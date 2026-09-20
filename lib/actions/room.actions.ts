// lib/actions/room.actions.ts
"use server";

import { isValidObjectId } from "mongoose";
import { auth } from "@clerk/nextjs/server";
import { Event } from "@/database/event.model";
import { Room, RoomMember, RoomMemberRole, type RoomStatus } from "@/database/Room.model";
import { isGateAuthorized } from "@/lib/actions/gate.actions";
import { isEventCreator } from "./event.actions";
import connectToDatabase from "../mongodb";
import { Order } from "@/database/Order.model";
import { Booking } from "@/database/booking.model";
import { getServerStreamClient } from "../stream/server-client";
import { autoCheckInOnRoomJoin } from "@/lib/actions/gate.actions";
import { resolveEventSchedule } from "@/lib/time";

export type RoomPhase = "not_configured" | "locked" | "lobby" | "live" | "ended";

const LOBBY_OPEN_MINUTES_BEFORE = 30;

function toStreamRole(role: RoomMemberRole): "call_member" | "admin" {
  if (role === "organizer" || role === "co-organizer") return "admin";
  return "call_member";
}


function getEffectivePhase(
  room: { status: RoomStatus; scheduledStart: Date },
  now: Date = new Date()
): RoomPhase {
  if (room.status === "ended" || room.status === "cancelled") return "ended";
  if (room.status === "live") return "live";

  const lobbyOpensAt = new Date(room.scheduledStart.getTime() - LOBBY_OPEN_MINUTES_BEFORE * 60_000);
  return now >= lobbyOpensAt ? "lobby" : "locked";
}

// TODO — confirm your Booking/Order field names before relying on this.
// Needs to answer: "does `clerkId` hold a valid, non-expired ticket for `eventId`?"
// Wire this up the same way verifyTicket() in gate.actions.ts resolves a ticket,
// just keyed by owner identity instead of a scanned ticket id.
// lib/actions/room.actions.ts — replaces the stub

async function getUserActiveTicketForEvent(
  eventId: string,
  clerkId: string,
): Promise<{ ticketId: string; ticketType: "booking" | "order" } | null> {
  // Paid tickets: only "paid" orders count. Pending/failed must not grant access.
  const order = await Order.findOne({ eventId, clerkId, status: "paid" })
    .select("_id")
    .lean();
  if (order) {
    return { ticketId: order._id.toString(), ticketType: "order" };
  }

  // Free tickets: existence is enough, no status field.
  const booking = await Booking.findOne({ eventId, clerkId }).select("_id").lean();
  if (booking) {
    return { ticketId: booking._id.toString(), ticketType: "booking" };
  }

  return null;
}


export interface RoomPublicMeta {
  phase: RoomPhase;
  scheduledStart: string;
  scheduledEnd: string;
}

export async function getRoomPublicMeta(eventId: string): Promise<RoomPublicMeta | null> {
  try {
    if (!isValidObjectId(eventId)) return null;
    await connectToDatabase();

    const room = await Room.findOne({ eventId }).select("scheduledStart scheduledEnd status").lean();
    if (!room) return null;

    return {
      phase: getEffectivePhase(room, new Date()),
      scheduledStart: room.scheduledStart.toISOString(),
      scheduledEnd: room.scheduledEnd.toISOString(),
    };
  } catch (error) {
    console.error("[getRoomPublicMeta]", error);
    return null;
  }
}


export async function createRoom(
  eventId: string,
  scheduledStart: Date,
  scheduledEnd: Date
): Promise<{ success: boolean; reason?: string; roomId?: string }> {
  try {
    if (!isValidObjectId(eventId)) return { success: false, reason: "not_found" };
    if (!(await isEventCreator(eventId))) return { success: false, reason: "unauthorized" };

    await connectToDatabase();

    const event = await Event.findById(eventId).lean();
    if (!event) return { success: false, reason: "not_found" };

    const existing = await Room.findOne({ eventId }).lean();
    if (existing) return { success: true, roomId: existing._id.toString() };

    const { userId } = await auth();
    if (!userId) return { success: false, reason: "unauthorized" };

    const streamCallId = `event-${eventId}`;
    const client = getServerStreamClient();

    await client.video.call("event-room", streamCallId).getOrCreate({
      data: {
        created_by_id: userId,
        members: [{ user_id: userId, role: "admin" }],
        custom: { eventId },
        // Nobody should be auto-prompted for camera/mic just by joining —
        // attendees can't publish anyway (call_member's Send audio/video is
        // "Not allowed" in the permissions matrix), and organizers get their
        // devices turned on explicitly client-side once they're actually in
        // the room. Without this override the call type's defaults trigger
        // a getUserMedia() prompt for every participant on join, regardless
        // of publish permission.
        //
        // NOTE: settings_override.audio/video aren't merged with the call
        // type's defaults — Stream validates each sub-object as a whole, so
        // touching one field means supplying the others it requires too
        // (default_device, target_resolution w/ a 240px floor) or getOrCreate
        // rejects the request outright.
        settings_override: {
          audio: {
            mic_default_on: false,
            default_device: "speaker",
          },
          video: {
            camera_default_on: false,
            target_resolution: { width: 1280, height: 720 },
          },
        },
      },
    });

    const room = await Room.create({
      eventId,
      streamCallId,
      streamCallType: "event-room",
      scheduledStart,
      scheduledEnd,
      status: "scheduled",
      createdByClerkId: userId,
    });

    return { success: true, roomId: room._id.toString() };
  } catch (error) {
    console.error("[createRoom]", error);
    return { success: false, reason: "server_error" };
  }
}

export interface JoinRoomResult {
  status: "ok" | "denied";
  reason?:
    | "not_configured"
    | "not_started_yet"
    | "room_closed"
    | "unauthorized"
    | "removed_by_organizer"
    | "server_error";
  phase?: RoomPhase;
  callId?: string;
  callType?: string;
  role?: RoomMemberRole; // reuse the model's type instead of re-typing the union here
  scheduledEnd?: string;
}


export async function joinRoom(eventId: string): Promise<JoinRoomResult> {
  try {
    if (!isValidObjectId(eventId)) return { status: "denied", reason: "not_configured" };

    const { userId: clerkId } = await auth();
    if (!clerkId) return { status: "denied", reason: "unauthorized" };

    await connectToDatabase();

    const room = await Room.findOne({ eventId });
    if (!room) return { status: "denied", reason: "not_configured" };

    // Resolve identity: organizer/co-organizer vs ticketed attendee.
    // NOTE: this is only used as the *initial* role on first-ever join —
    // see the read-back below for why it can't be trusted after that.
    const isOrganizerTier = await isGateAuthorized(eventId);
    let initialRole: RoomMemberRole;
    let ticketRef: { ticketId: string; ticketType: "booking" | "order" } | null = null;

    if (isOrganizerTier) {
      initialRole = (await isEventCreator(eventId)) ? "organizer" : "co-organizer";
    } else {
      ticketRef = await getUserActiveTicketForEvent(eventId, clerkId);
      if (!ticketRef) return { status: "denied", reason: "unauthorized" };
      initialRole = "attendee";
    }

    const existingMember = await RoomMember.findOne({ roomId: room._id, clerkId });
    if (existingMember?.bannedAt) {
      return { status: "denied", reason: "removed_by_organizer" };
    }

    const phase = getEffectivePhase(room, new Date());
    if (phase === "ended") return { status: "denied", reason: "room_closed" };

    const canGetVideoToken = isOrganizerTier || phase === "live";
    if (!canGetVideoToken && phase === "locked") {
      // Keep the resolved role in the response even though the attendee is
      // not allowed to receive a video token before the lobby opens. The
      // client uses this to show attendee-only waiting UI safely.
      return { status: "denied", reason: "not_started_yet", phase, role: initialRole };
    }

    // Upsert membership, then READ BACK what's actually persisted —
    // this is the bug #1 fix. `initialRole` only applies via $setOnInsert
    // on someone's very first join; a returning speaker must not be
    // silently recomputed back down to "attendee".
    const memberDoc = await RoomMember.findOneAndUpdate(
      { roomId: room._id, clerkId },
      {
        $setOnInsert: {
          ticketId: ticketRef?.ticketId,
          ticketType: ticketRef?.ticketType,
        },
        // Keep the database role synchronized with current authorization. A
        // user who was previously an attendee may become an organizer later;
        // leaving the old role in place would make Stream assign call_member
        // and deny video publishing.
        $set: { role: initialRole, joinedAt: new Date(), leftAt: null },
      },
      { upsert: true, returnDocument: "after" }
    );

    const effectiveRole: RoomMemberRole = memberDoc.role;

    if (!canGetVideoToken) {
      // Lobby phase — no video token yet, but still report the REAL persisted role.
      return { status: "ok", phase, role: effectiveRole, scheduledEnd: room.scheduledEnd.toISOString() };
    }

    const client = getServerStreamClient();

    // bug #2 fix — 3-way mapping instead of the old binary ternary.
    await client.video.call(room.streamCallType, room.streamCallId).updateCallMembers({
      update_members: [{ user_id: clerkId, role: toStreamRole(effectiveRole) }],
    });

    if (effectiveRole === "attendee") {
      try {
        const checkin = await autoCheckInOnRoomJoin(eventId);
        if (!checkin.success) {
          console.warn("[joinRoom] autoCheckInOnRoomJoin skipped", { eventId, clerkId, reason: checkin.reason });
        }
      } catch (error) {
        console.error("[joinRoom] autoCheckInOnRoomJoin threw", error);
      }
    }

    return {
      status: "ok",
      phase,
      callId: room.streamCallId,
      callType: room.streamCallType,
      role: effectiveRole,
      scheduledEnd: room.scheduledEnd.toISOString(),
    };
  } catch (error) {
    console.error("[joinRoom]", error);
    return { status: "denied", reason: "server_error" };
  }
}

export async function startRoom(eventId: string): Promise<{ success: boolean; reason?: string }> {
  try {
    if (!isValidObjectId(eventId)) return { success: false, reason: "not_found" };
    if (!(await isGateAuthorized(eventId))) return { success: false, reason: "unauthorized" };

    await connectToDatabase();
    const room = await Room.findOne({ eventId });
    if (!room) return { success: false, reason: "not_found" };

    room.status = "live";
    await room.save();

    return { success: true };
  } catch (error) {
    console.error("[startRoom]", error);
    return { success: false, reason: "server_error" };
  }
}

export async function endRoom(eventId: string): Promise<{ success: boolean; reason?: string }> {
  try {
    if (!isValidObjectId(eventId)) return { success: false, reason: "not_found" };
    if (!(await isGateAuthorized(eventId))) return { success: false, reason: "unauthorized" };

    await connectToDatabase();
    const room = await Room.findOne({ eventId });
    if (!room) return { success: false, reason: "not_found" };

    const client = getServerStreamClient();
    await client.video.call(room.streamCallType, room.streamCallId).end();

    room.status = "ended";
    await room.save();

    return { success: true };
  } catch (error) {
    console.error("[endRoom]", error);
    return { success: false, reason: "server_error" };
  }
}




export async function leaveRoom(eventId: string): Promise<{ success: boolean }> {
  try {
    if (!isValidObjectId(eventId)) return { success: false };

    const { userId: clerkId } = await auth();
    if (!clerkId) return { success: false };

    await connectToDatabase();
    const room = await Room.findOne({ eventId }).select("_id");
    if (!room) return { success: false };

    await RoomMember.findOneAndUpdate(
      { roomId: room._id, clerkId },
      { $set: { leftAt: new Date() } }
    );

    return { success: true };
  } catch (error) {
    console.error("[leaveRoom]", error);
    return { success: false };
  }
}


const DEFAULT_ROOM_DURATION_MS = 2 * 60 * 60 * 1000; // 2h — no explicit end-time field on Event yet

export async function ensureRoomForEvent(eventId: string): Promise<RoomPublicMeta | null> {
  try {
    if (!isValidObjectId(eventId)) return null;
    await connectToDatabase();

    const event = await Event.findById(eventId).select("date time timezone startAtUTC").lean();
    if (!event) return null;

    const eventSchedule = resolveEventSchedule({
      date: String(event.date),
      time: String(event.time),
      timezone: event.timezone,
      startAtUTC: event.startAtUTC,
    });
    const canonicalStart = eventSchedule.instant;
    const canonicalEnd = new Date(canonicalStart.getTime() + DEFAULT_ROOM_DURATION_MS);

    const existing = await Room.findOne({ eventId }).select("scheduledStart scheduledEnd status").lean();
    if (existing) {
      // A room is created once, but the event schedule may be edited later.
      // Reconcile only scheduled rooms; never move a live, ended, or cancelled
      // room while people may be relying on its current lifecycle state.
      const scheduleChanged = Math.abs(existing.scheduledStart.getTime() - canonicalStart.getTime()) > 1000;
      if (scheduleChanged && existing.status === "scheduled") {
        await Room.updateOne(
          { eventId, status: "scheduled" },
          { $set: { scheduledStart: canonicalStart, scheduledEnd: canonicalEnd } }
        );
        return {
          phase: getEffectivePhase({ status: "scheduled", scheduledStart: canonicalStart }, new Date()),
          scheduledStart: canonicalStart.toISOString(),
          scheduledEnd: canonicalEnd.toISOString(),
        };
      }

      return {
        phase: getEffectivePhase(existing, new Date()),
        scheduledStart: existing.scheduledStart.toISOString(),
        scheduledEnd: existing.scheduledEnd.toISOString(),
      };
    }

    // No room yet — only an organizer/co-organizer visiting the page can trigger creation.
    if (!(await isGateAuthorized(eventId))) return null;

    const scheduledStart = canonicalStart;
    const scheduledEnd = canonicalEnd;

    const created = await createRoom(eventId, scheduledStart, scheduledEnd);
    if (!created.success) return null;

    return {
      phase: getEffectivePhase({ status: "scheduled", scheduledStart }, new Date()),
      scheduledStart: scheduledStart.toISOString(),
      scheduledEnd: scheduledEnd.toISOString(),
    };
  } catch (error) {
    console.error("[ensureRoomForEvent]", error);
    return null;
  }
}
