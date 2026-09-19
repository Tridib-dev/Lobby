"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { isValidObjectId, type Types } from "mongoose";
import connectToDatabase from "@/lib/mongodb";
import { Booking } from "@/database/booking.model";
import { Order } from "@/database/Order.model";
import { CoOrganizer } from "@/database/coOrganizer.model";
import { Event } from "@/database/event.model";
import { User } from "@/database/User.model";
import { isEventCreator } from "@/lib/actions/event.actions";
import { sendCoOrganizerInvites } from "@/lib/co-organizer-invites";
import { getEventStartUTC } from "@/lib/time";

export type TicketType = "booking" | "order";

export interface GateAttendeeItem {
    id: string;
    type: TicketType;
    pricePaise: number;
    clerkId: string;
    name: string;
    email: string;
    photo: string;
    checkedIn: boolean;
    checkedInAt?: string;
    bookedAt: string;
}

export interface GateAttendeesResponse {
    total: number;
    checkedIn: number;
    remaining: number;
    attendees: GateAttendeeItem[];
}

export interface VerifyTicketResult {
    valid: boolean;
    reason?: "not_found" | "already_used" | "expired" | "wrong_event" | "unauthorized";
    ticket?: {
        id: string;
        type: TicketType;
        attendeeEmail: string;
        pricePaise: number;
        checkedIn: boolean;
        checkedInAt?: string;
    };
}

export interface CheckInTicketResult {
    success: boolean;
    reason?: "not_found" | "already_used" | "wrong_event" | "unauthorized" | "expired";
    ticket?: {
        id: string;
        type: TicketType;
        checkedIn: boolean;
        checkedInAt?: string;
    };
}

export interface AutoCheckInResult {
    success: boolean;
    reason?: "not_found" | "outside_window" | "wrong_mode" | "unauthorized";
    ticketType?: TicketType;
    ticketId?: string;
    checkedIn?: boolean;
    alreadyCheckedIn?: boolean;
}

export interface GateCoOrganizerItem {
    clerkId: string;
    name: string;
    email: string;
    photo: string;
    addedAt: string;
}

export interface GateMutationResult {
    success: boolean;
    reason?: "not_found" | "unauthorized" | "already_exists" | "already_removed";
    coOrganizer?: GateCoOrganizerItem;
}

type BookingDoc = {
    _id: Types.ObjectId;
    clerkId: string;
    eventId: Types.ObjectId;
    email: string;
    checkedIn?: boolean;
    checkedInAt?: Date;
    createdAt: Date;
};

type OrderDoc = {
    _id: Types.ObjectId;
    clerkId: string;
    eventId: Types.ObjectId;
    amount: number;
    status: "pending" | "paid" | "failed";
    checkedIn?: boolean;
    checkedInAt?: Date;
    createdAt: Date;
};

type GateTicketRecord =
    | { type: "booking"; doc: BookingDoc }
    | { type: "order"; doc: OrderDoc };

type UserDoc = {
    clerkId: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    photo?: string;
    username?: string;
};

type CoOrganizerDoc = {
    eventId: Types.ObjectId;
    clerkId: string;
    addedByClerkId?: string;
    addedAt: Date;
};

const GATE_CHECKIN_GRACE_MS = 3 * 60 * 60 * 1000;

function toIso(value?: Date | string | null): string | undefined {
    if (!value) return undefined;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function parseEventStart(input: {
    eventDate?: string;
    eventTime?: string;
    timezone?: string;
    startAtUTC?: Date | string;
}): Date | null {
    if (input.startAtUTC) {
        const stored = new Date(input.startAtUTC);
        if (!Number.isNaN(stored.getTime())) return stored;
    }

    if (!input.eventDate || !input.eventTime) return null;

    try {
        return getEventStartUTC(input.eventDate, input.eventTime, input.timezone);
    } catch {
        return null;
    }
}

function isWithinWindow(input: Parameters<typeof parseEventStart>[0], windowMinutes = 15): boolean {
    const start = parseEventStart(input);
    if (!start) return false;

    const diff = Math.abs(Date.now() - start.getTime());
    return diff <= windowMinutes * 60 * 1000;
}

function isTicketExpired(input: Parameters<typeof parseEventStart>[0]): boolean {
    const start = parseEventStart(input);
    if (!start) return false;

    return Date.now() > start.getTime() + GATE_CHECKIN_GRACE_MS;
}

async function getAuthenticatedUserId(): Promise<string | null> {
    const { userId } = await auth();
    return userId ?? null;
}

async function loadTicket(ticketId: string): Promise<GateTicketRecord | null> {
    if (!isValidObjectId(ticketId)) return null;

    const booking = (await Booking.findById(ticketId).lean()) as BookingDoc | null;
    if (booking) {
        return { type: "booking", doc: booking };
    }

    const order = (await Order.findById(ticketId).lean()) as OrderDoc | null;
    if (order) {
        return { type: "order", doc: order };
    }

    return null;
}

async function loadTicketByType(
    ticketId: string,
    ticketType: TicketType
): Promise<GateTicketRecord | null> {
    if (!isValidObjectId(ticketId)) return null;

    if (ticketType === "booking") {
        const booking = (await Booking.findById(ticketId).lean()) as BookingDoc | null;
        return booking ? { type: "booking", doc: booking } : null;
    }

    const order = (await Order.findById(ticketId).lean()) as OrderDoc | null;
    return order ? { type: "order", doc: order } : null;
}

async function getOrderEmail(clerkId: string): Promise<string> {
    try {
        const client = await clerkClient();
        const user = await client.users.getUser(clerkId);
        return user.emailAddresses[0]?.emailAddress ?? "";
    } catch {
        return "";
    }
}

async function resolveUserProfile(clerkId: string): Promise<{
    clerkId: string;
    name: string;
    email: string;
    photo: string;
} | null> {
    const [dbUser, clerkUser] = await Promise.all([
        User.findOne({ clerkId })
            .select("clerkId firstName lastName email photo username")
            .lean<UserDoc | null>(),
        (async () => {
            try {
                const client = await clerkClient();
                return await client.users.getUser(clerkId);
            } catch {
                return null;
            }
        })(),
    ]);

    if (!dbUser && !clerkUser) return null;

    const firstName = dbUser?.firstName?.trim() || clerkUser?.firstName?.trim() || "";
    const lastName = dbUser?.lastName?.trim() || clerkUser?.lastName?.trim() || "";
    const username = dbUser?.username?.trim() || clerkUser?.username?.trim() || "";
    const name = [firstName, lastName].filter(Boolean).join(" ").trim() || username || "Unknown organizer";
    const email =
        dbUser?.email?.trim() ||
        clerkUser?.emailAddresses?.[0]?.emailAddress?.trim() ||
        "";
    const photo = dbUser?.photo?.trim() || clerkUser?.imageUrl?.trim() || "";

    return { clerkId, name, email, photo };
}

async function isTicketAlreadyCheckedIn(ticket: GateTicketRecord): Promise<boolean> {
    return Boolean(ticket.doc.checkedIn);
}

async function markBookingCheckedIn(ticketId: string) {
    return await Booking.findOneAndUpdate(
        { _id: ticketId, checkedIn: { $ne: true } },
        { $set: { checkedIn: true, checkedInAt: new Date() } },
        { returnDocument: "after" }
    ).lean();
}

async function markOrderCheckedIn(ticketId: string) {
    return await Order.findOneAndUpdate(
        {
            _id: ticketId,
            status: "paid",
            checkedIn: { $ne: true },
            $or: [
                { fulfillmentStatus: "fulfilled" },
                { fulfillmentStatus: { $exists: false } },
            ],
        },
        { $set: { checkedIn: true, checkedInAt: new Date() } },
        { returnDocument: "after" }
    ).lean();
}

function buildTicketPayload(ticket: GateTicketRecord) {
    return {
        id: ticket.doc._id.toString(),
        type: ticket.type,
        checkedIn: Boolean(ticket.doc.checkedIn),
        checkedInAt: toIso(ticket.doc.checkedInAt),
    };
}

// ─── Authorization ───────────────────────────────────────────────────────────

export async function isGateAuthorized(eventId: string): Promise<boolean> {
    try {
        if (!isValidObjectId(eventId)) return false;

        const userId = await getAuthenticatedUserId();
        if (!userId) return false;

        if (await isEventCreator(eventId)) {
            return true;
        }

        await connectToDatabase();

        const coOrganizer = await CoOrganizer.exists({ eventId, clerkId: userId });
        return Boolean(coOrganizer);
    } catch (error) {
        console.error("[isGateAuthorized]", error);
        return false;
    }
}

// ─── Co-organizer helpers ────────────────────────────────────────────────────

export async function getEventCoOrganizers(eventId: string): Promise<GateCoOrganizerItem[]> {
    try {
        if (!isValidObjectId(eventId)) return [];

        if (!(await isGateAuthorized(eventId))) {
            return [];
        }

        await connectToDatabase();

        const coOrganizers = (await CoOrganizer.find({ eventId })
            .sort({ addedAt: -1 })
            .lean()) as CoOrganizerDoc[];

        const resolved = await Promise.all(
            coOrganizers.map(async (entry) => {
                const profile = await resolveUserProfile(entry.clerkId);
                if (!profile) return null;

                return {
                    clerkId: entry.clerkId,
                    name: profile.name,
                    email: profile.email,
                    photo: profile.photo,
                    addedAt: entry.addedAt.toISOString(),
                };
            })
        );

        return resolved.filter(Boolean) as GateCoOrganizerItem[];
    } catch (error) {
        console.error("[getEventCoOrganizers]", error);
        return [];
    }
}

export async function addCoOrganizer(eventId: string, clerkId: string): Promise<GateMutationResult> {
    try {
        const normalizedClerkId = clerkId.trim();
        if (!isValidObjectId(eventId) || !normalizedClerkId) {
            return { success: false, reason: "not_found" };
        }

        if (!(await isEventCreator(eventId))) {
            return { success: false, reason: "unauthorized" };
        }

        await connectToDatabase();

        const eventExists = await Event.exists({ _id: eventId });
        if (!eventExists) {
            return { success: false, reason: "not_found" };
        }

        const profile = await resolveUserProfile(normalizedClerkId);
        if (!profile) {
            return { success: false, reason: "not_found" };
        }

        const existing = (await CoOrganizer.findOne({ eventId, clerkId: normalizedClerkId }).lean()) as CoOrganizerDoc | null;
        if (existing) {
            return {
                success: true,
                reason: "already_exists",
                coOrganizer: {
                    clerkId: existing.clerkId,
                    name: profile.name,
                    email: profile.email,
                    photo: profile.photo,
                    addedAt: existing.addedAt.toISOString(),
                },
            };
        }

        const { userId } = await auth();
        const result = await sendCoOrganizerInvites(eventId, [normalizedClerkId], userId ?? "");

        if (result.sent.includes(normalizedClerkId)) {
            return {
                success: true,
                coOrganizer: {
                    clerkId: normalizedClerkId,
                    name: profile.name,
                    email: profile.email,
                    photo: profile.photo,
                    addedAt: new Date().toISOString(),
                },
            };
        }

        if (result.skipped.includes(normalizedClerkId)) {
            return { success: true, reason: "already_exists" };
        }

        return { success: false, reason: "not_found" };
    } catch (error) {
        console.error("[addCoOrganizer]", error);
        return { success: false, reason: "not_found" };
    }
}

export async function removeCoOrganizer(eventId: string, clerkId: string): Promise<GateMutationResult> {
    try {
        const normalizedClerkId = clerkId.trim();
        if (!isValidObjectId(eventId) || !normalizedClerkId) {
            return { success: false, reason: "not_found" };
        }

        if (!(await isEventCreator(eventId))) {
            return { success: false, reason: "unauthorized" };
        }

        await connectToDatabase();

        const removed = (await CoOrganizer.findOneAndDelete({
            eventId,
            clerkId: normalizedClerkId,
        }).lean()) as CoOrganizerDoc | null;

        if (!removed) {
            return { success: true, reason: "already_removed" };
        }

        const profile = await resolveUserProfile(normalizedClerkId);
        return {
            success: true,
            coOrganizer: {
                clerkId: removed.clerkId,
                name: profile?.name ?? "Unknown organizer",
                email: profile?.email ?? "",
                photo: profile?.photo ?? "",
                addedAt: removed.addedAt.toISOString(),
            },
        };
    } catch (error) {
        console.error("[removeCoOrganizer]", error);
        return { success: false, reason: "not_found" };
    }
}

// ─── Attendee list ────────────────────────────────────────────────────────────

export async function getEventAttendees(eventId: string): Promise<GateAttendeesResponse> {
    // TODO: batch Clerk lookups or store email on Order at creation time
    try {
        if (!isValidObjectId(eventId)) {
            return { total: 0, checkedIn: 0, remaining: 0, attendees: [] };
        }

        if (!(await isGateAuthorized(eventId))) {
            return { total: 0, checkedIn: 0, remaining: 0, attendees: [] };
        }

        await connectToDatabase();

        const [bookings, orders] = await Promise.all([
            Booking.find({ eventId }).sort({ createdAt: 1 }).lean(),
            Order.find({
                eventId,
                status: "paid",
                $or: [
                    { fulfillmentStatus: "fulfilled" },
                    { fulfillmentStatus: { $exists: false } },
                ],
            }).sort({ createdAt: 1 }).lean(),
        ]);

        const bookingRows = await Promise.all(
            (bookings as BookingDoc[]).map(async (booking) => {
                const profile = await resolveUserProfile(booking.clerkId);

                return {
                    id: booking._id.toString(),
                    type: "booking" as const,
                    pricePaise: 0,
                    clerkId: booking.clerkId,
                    name: profile?.name ?? booking.email ?? "Unknown attendee",
                    email: profile?.email ?? booking.email,
                    photo: profile?.photo ?? "",
                    checkedIn: Boolean(booking.checkedIn),
                    checkedInAt: toIso(booking.checkedInAt),
                    bookedAt: booking.createdAt.toISOString(),
                } satisfies GateAttendeeItem;
            })
        );

        const orderRows = await Promise.all(
            (orders as OrderDoc[]).map(async (order) => {
                const profile = await resolveUserProfile(order.clerkId);

                return {
                    id: order._id.toString(),
                    type: "order" as const,
                    pricePaise: order.amount,
                    clerkId: order.clerkId,
                    name: profile?.name ?? "Unknown attendee",
                    email: profile?.email ?? (await getOrderEmail(order.clerkId)),
                    photo: profile?.photo ?? "",
                    checkedIn: Boolean(order.checkedIn),
                    checkedInAt: toIso(order.checkedInAt),
                    bookedAt: order.createdAt.toISOString(),
                } satisfies GateAttendeeItem;
            })
        );

        const attendees = [...bookingRows, ...orderRows].sort((a, b) => {
            if (a.checkedIn !== b.checkedIn) return a.checkedIn ? -1 : 1;
            return new Date(b.bookedAt).getTime() - new Date(a.bookedAt).getTime();
        });

        const checkedIn = attendees.filter((attendee) => attendee.checkedIn).length;

        return {
            total: attendees.length,
            checkedIn,
            remaining: Math.max(0, attendees.length - checkedIn),
            attendees,
        };
    } catch (error) {
        console.error("[getEventAttendees]", error);
        return { total: 0, checkedIn: 0, remaining: 0, attendees: [] };
    }
}

// ─── Verify ticket ────────────────────────────────────────────────────────────

export async function verifyTicket(ticketId: string, eventId: string): Promise<VerifyTicketResult> {

    // TODO : Add Grace time for Event starting like 2 hrs or 3 hrs 
    try {
        if (!isValidObjectId(eventId)) {
            return { valid: false, reason: "not_found" };
        }

        if (!(await isGateAuthorized(eventId))) {
            return { valid: false, reason: "unauthorized" };
        }

        await connectToDatabase();

        const event = await Event.findById(eventId).select("date time timezone startAtUTC").lean<{
            date?: string;
            time?: string;
            timezone?: string;
            startAtUTC?: Date;
        } | null>();

        if (!event) {
            return { valid: false, reason: "not_found" };
        }

        const ticket = await loadTicket(ticketId);
        if (!ticket) {
            return { valid: false, reason: "not_found" };
        }

        if (ticket.doc.eventId.toString() !== eventId) {
            return { valid: false, reason: "wrong_event" };
        }

        if (ticket.type === "order" && ticket.doc.status !== "paid") {
            return { valid: false, reason: "not_found" };
        }

        if (await isTicketAlreadyCheckedIn(ticket)) {
            return {
                valid: false,
                reason: "already_used",
                ticket: {
                    id: ticket.doc._id.toString(),
                    type: ticket.type,
                    attendeeEmail:
                        ticket.type === "booking"
                            ? ticket.doc.email
                            : await getOrderEmail(ticket.doc.clerkId),
                    pricePaise: ticket.type === "booking" ? 0 : ticket.doc.amount,
                    checkedIn: true,
                    checkedInAt: toIso(ticket.doc.checkedInAt),
                },
            };
        }

        if (isTicketExpired({ eventDate: event.date, eventTime: event.time, timezone: event.timezone, startAtUTC: event.startAtUTC })) {
            return { valid: false, reason: "expired" };
        }

        return {
            valid: true,
            ticket: {
                id: ticket.doc._id.toString(),
                type: ticket.type,
                attendeeEmail:
                    ticket.type === "booking"
                        ? ticket.doc.email
                        : await getOrderEmail(ticket.doc.clerkId),
                pricePaise: ticket.type === "booking" ? 0 : ticket.doc.amount,
                checkedIn: false,
            },
        };
    } catch (error) {
        console.error("[verifyTicket]", error);
        return { valid: false, reason: "not_found" };
    }
}

// ─── Check in ticket ──────────────────────────────────────────────────────────

export async function checkInTicket(
    ticketId: string,
    ticketType: TicketType,
    eventId: string
): Promise<CheckInTicketResult> {
    try {
        if (!isValidObjectId(eventId)) {
            return { success: false, reason: "not_found" };
        }

        if (!(await isGateAuthorized(eventId))) {
            return { success: false, reason: "unauthorized" };
        }

        await connectToDatabase();

        const ticket = await loadTicketByType(ticketId, ticketType);
        if (!ticket) {
            return { success: false, reason: "not_found" };
        }

        if (ticket.doc.eventId.toString() !== eventId) {
            return { success: false, reason: "wrong_event" };
        }

        if (ticket.type === "order" && ticket.doc.status !== "paid") {
            return { success: false, reason: "not_found" };
        }

        if (ticket.doc.checkedIn) {
            return {
                success: false,
                reason: "already_used",
                ticket: buildTicketPayload(ticket),
            };
        }

        const event = await Event.findById(eventId).select("date time timezone startAtUTC").lean<{
            date?: string;
            time?: string;
            timezone?: string;
            startAtUTC?: Date;
        } | null>();

        if (!event) {
            return { success: false, reason: "not_found" };
        }

        if (isTicketExpired({ eventDate: event.date, eventTime: event.time, timezone: event.timezone, startAtUTC: event.startAtUTC })) {
            return { success: false, reason: "expired" };
        }

        if (ticket.type === "booking") {
            const updated = await markBookingCheckedIn(ticketId);
            if (!updated) {
                const current = (await Booking.findById(ticketId).lean()) as BookingDoc | null;
                if (current?.checkedIn) {
                    return {
                        success: false,
                        reason: "already_used",
                        ticket: {
                            id: current._id.toString(),
                            type: "booking",
                            checkedIn: true,
                            checkedInAt: toIso(current.checkedInAt),
                        },
                    };
                }
                return { success: false, reason: "not_found" };
            }
        } else {
            const updated = await markOrderCheckedIn(ticketId);
            if (!updated) {
                const current = (await Order.findById(ticketId).lean()) as OrderDoc | null;
                if (current?.checkedIn) {
                    return {
                        success: false,
                        reason: "already_used",
                        ticket: {
                            id: current._id.toString(),
                            type: "order",
                            checkedIn: true,
                            checkedInAt: toIso(current.checkedInAt),
                        },
                    };
                }
                return { success: false, reason: "not_found" };
            }
        }

        return {
            success: true,
            ticket: {
                id: ticket.doc._id.toString(),
                type: ticket.type,
                checkedIn: true,
                checkedInAt: new Date().toISOString(),
            },
        };
    } catch (error) {
        console.error("[checkInTicket]", error);
        return { success: false, reason: "not_found" };
    }
}

// ─── Auto check in on room join ───────────────────────────────────────────────

export async function autoCheckInOnRoomJoin(eventId: string): Promise<AutoCheckInResult> {
    try {
        if (!isValidObjectId(eventId)) {
            return { success: false, reason: "not_found" };
        }

        const userId = await getAuthenticatedUserId();
        if (!userId) {
            return { success: false, reason: "unauthorized" };
        }

        await connectToDatabase();

        const event = await Event.findById(eventId).select("date time timezone startAtUTC mode").lean<{
            date?: string;
            time?: string;
            timezone?: string;
            startAtUTC?: Date;
            mode?: string;
        } | null>();

        if (!event) {
            return { success: false, reason: "not_found" };
        }

        const mode = String(event.mode ?? "").toLowerCase();
        if (mode !== "online" && mode !== "hybrid") {
            return { success: false, reason: "wrong_mode" };
        }

        if (!isWithinWindow({ eventDate: event.date, eventTime: event.time, timezone: event.timezone, startAtUTC: event.startAtUTC }, 15)) {
            return { success: false, reason: "outside_window" };
        }

        const [booking, order] = await Promise.all([
            Booking.findOne({ clerkId: userId, eventId }).lean(),
            Order.findOne({
                clerkId: userId,
                eventId,
                status: "paid",
                $or: [
                    { fulfillmentStatus: "fulfilled" },
                    { fulfillmentStatus: { $exists: false } },
                ],
            }).lean(),
        ]);

        if (booking) {
            if (!booking.checkedIn) {
                const updated = await Booking.findOneAndUpdate(
                    { _id: booking._id, checkedIn: { $ne: true } },
                    { $set: { checkedIn: true, checkedInAt: new Date() } },
                    { returnDocument: "after" }
                ).lean();

                if (!updated) {
                    const current = (await Booking.findById(booking._id).lean()) as BookingDoc | null;
                    return {
                        success: true,
                        ticketType: "booking",
                        ticketId: booking._id.toString(),
                        checkedIn: Boolean(current?.checkedIn),
                        alreadyCheckedIn: Boolean(current?.checkedIn),
                    };
                }

                return {
                    success: true,
                    ticketType: "booking",
                    ticketId: booking._id.toString(),
                    checkedIn: true,
                    alreadyCheckedIn: false,
                };
            }

            return {
                success: true,
                ticketType: "booking",
                ticketId: booking._id.toString(),
                checkedIn: true,
                alreadyCheckedIn: true,
            };
        }

        if (order) {
            if (!order.checkedIn) {
                const updated = await Order.findOneAndUpdate(
                    {
                        _id: order._id,
                        status: "paid",
                        checkedIn: { $ne: true },
                        $or: [
                            { fulfillmentStatus: "fulfilled" },
                            { fulfillmentStatus: { $exists: false } },
                        ],
                    },
                    { $set: { checkedIn: true, checkedInAt: new Date() } },
                    { returnDocument: "after" }
                ).lean();

                if (!updated) {
                    const current = (await Order.findById(order._id).lean()) as OrderDoc | null;
                    return {
                        success: true,
                        ticketType: "order",
                        ticketId: order._id.toString(),
                        checkedIn: Boolean(current?.checkedIn),
                        alreadyCheckedIn: Boolean(current?.checkedIn),
                    };
                }

                return {
                    success: true,
                    ticketType: "order",
                    ticketId: order._id.toString(),
                    checkedIn: true,
                    alreadyCheckedIn: false,
                };
            }

            return {
                success: true,
                ticketType: "order",
                ticketId: order._id.toString(),
                checkedIn: true,
                alreadyCheckedIn: true,
            };
        }

        return { success: false, reason: "not_found" };
    } catch (error) {
        console.error("[autoCheckInOnRoomJoin]", error);
        return { success: false, reason: "not_found" };
    }
}
