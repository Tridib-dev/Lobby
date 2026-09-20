// components/room/RoomGate.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStreamVideoClient, type Call } from "@stream-io/video-react-sdk";
import { useRoomPhase } from "@/hooks/useRoomPhase";
import type { RoomPhase } from "@/lib/actions/room.actions";
import LockedScreen from "./LockedScreen";
import LobbyScreen from "./LobbyScreen";
import LiveRoomScreen from "./LiveRoomScreen";
import EndedScreen from "./EndedScreen";
import OrganizerControls from "./OrganizerControl";
import PreJoinScreen from "./PreJoinScreen";
import PreMeetingUpdates from "./PreMeetingUpdates";


export interface RoomGateProps {
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  bannerUrl?: string;
  initialPhase: RoomPhase;
  scheduledStart: string;
  scheduledEnd: string;
  viewerIsOrganizer: boolean;
}

export default function RoomGate({
  eventId,
  eventSlug,
  eventTitle,
  bannerUrl,
  initialPhase,
  scheduledStart,
  viewerIsOrganizer,
}: RoomGateProps) {
  const client = useStreamVideoClient(); // comes from <StreamVideoProvider> context — no second client
  const router = useRouter();
  const { phase, joinResult, refetch } = useRoomPhase(eventId, initialPhase);
  const isOrganizerTier = joinResult?.role === "organizer" || joinResult?.role === "co-organizer";
  // Never infer attendee status from a missing/failed organizer check. The
  // countdown is shown only after the room join endpoint explicitly resolves
  // this viewer as an attendee.
  const showAttendeeCountdown = !viewerIsOrganizer && joinResult?.role === "attendee";

  // `call` exists as soon as we've created the Call object — this happens
  // well before it's actually joined, so PreJoinScreen can show a device
  // preview/toggle against the real call. `hasJoined` is what gates
  // rendering the full LiveRoomScreen.
  const [call, setCall] = useState<Call | null>(null);
  const [hasJoined, setHasJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const callRef = useRef<Call | null>(null);
  const hasJoinedCallRef = useRef(false);
  const [joinFailedState, setJoinFailedState] = useState(false);
  const [joinAttemptKey, setJoinAttemptKey] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const joinTimeoutRef = useRef<number | null>(null);
  const JOIN_TIMEOUT_MS = 60_000;

  const start = new Date(scheduledStart);
  const lobbyOpensAt = new Date(start.getTime() - 30 * 60_000);
  const callId = joinResult?.callId;
  const callType = joinResult?.callType ?? "event-room";

  const joinFailed =
    joinFailedState || (joinResult?.status === "denied" && phase === "live" && joinResult.reason !== "not_started_yet");

  // Create the call object as soon as we're allowed to — but do NOT join it
  // yet. Joining is deferred to an explicit click on PreJoinScreen, both so
  // people can set their devices first and so the browser gets a real user
  // gesture before any audio tries to play.
  useEffect(() => {
    if (phase !== "live" || !client || !callId) return;
    if (callRef.current) return;

    const c = client.call(callType, callId);
    callRef.current = c;
    hasJoinedCallRef.current = false;
    setJoinFailedState(false);
    setHasJoined(false);
    setCall(c);

    // Devices must be disabled BEFORE join(), not after. Whether the SDK
    // auto-requests camera/mic on join is driven by the call type's
    // camera_default_on/mic_default_on settings, independent of the
    // "Send audio/video" permission — so an attendee who genuinely can't
    // publish would still get the browser's getUserMedia prompt (and a
    // "[devices]: Failed to get video/audio stream" error on denial) if we
    // don't head it off. PreJoinScreen handles the organizer-tier device
    // choices instead.
    if (!isOrganizerTier) {
      c.camera.disable().catch((err: unknown) => {
        console.warn("[RoomGate] pre-join camera disable failed", err);
      });
      c.microphone.disable().catch((err: unknown) => {
        console.warn("[RoomGate] pre-join microphone disable failed", err);
      });
    }

    return () => {
      if (callRef.current === c) {
        callRef.current = null;
      }
      // Dispose the call even when the user leaves from the pre-join screen.
      // Stream recommends leaving every created call instance; otherwise a
      // retry/navigation can retain stale device and permission state.
      c.leave().catch(() => {});
      if (hasJoinedCallRef.current) {
        fetch(`/api/rooms/${eventId}/leave`, { method: "POST", keepalive: true }).catch(() => {});
      }
    };
  }, [phase, client, callId, callType, eventId, isOrganizerTier, joinAttemptKey]);

  async function handleJoinClick() {
    const c = callRef.current;
    if (!c || joining || hasJoinedCallRef.current) return;

    setJoining(true);
    setJoinFailedState(false);

    if (joinTimeoutRef.current !== null) {
      window.clearTimeout(joinTimeoutRef.current);
    }
    joinTimeoutRef.current = window.setTimeout(() => {
      console.error("[RoomGate] join timed out");
      setJoinFailedState(true);
      setJoining(false);
    }, JOIN_TIMEOUT_MS);

    try {
      await c.join({ create: false });
      hasJoinedCallRef.current = true;
      setHasJoined(true);
    } catch (err) {
      console.error("[RoomGate] join failed", err);
      setJoinFailedState(true);
    } finally {
      setJoining(false);
      if (joinTimeoutRef.current !== null) {
        window.clearTimeout(joinTimeoutRef.current);
        joinTimeoutRef.current = null;
      }
    }
  }

  function handleRetry() {
    callRef.current?.leave().catch(() => {});
    setJoinFailedState(false);
    setCall(null);
    setHasJoined(false);
    callRef.current = null;
    hasJoinedCallRef.current = false;
    setJoinAttemptKey((current) => current + 1);
    refetch();
  }

  async function handleLeave() {
    if (leaving) return;

    setLeaving(true);
    try {
      await call?.leave().catch(() => {});
      await fetch(`/api/rooms/${eventId}/leave`, { method: "POST" }).catch(() => {});
    } finally {
      callRef.current = null;
      hasJoinedCallRef.current = false;
      setCall(null);
      setHasJoined(false);
      setLeaving(false);
      router.push(`/events/${eventSlug}`);
    }
  }

  let screen: React.ReactNode;
  if (phase === "locked") {
    screen = (
      <>
        <LockedScreen
          eventTitle={eventTitle}
          bannerUrl={bannerUrl}
          lobbyOpensAt={lobbyOpensAt}
          showCountdown={showAttendeeCountdown}
        />
        <PreMeetingUpdates eventId={eventId} canModerate={isOrganizerTier} />
      </>
    );
  } else if (phase === "lobby") {
    screen = (
      <LobbyScreen
        eventId={eventId}
        eventTitle={eventTitle}
        bannerUrl={bannerUrl}
        scheduledStart={start}
        onCountdownComplete=
        
        {refetch}
        canModerate={isOrganizerTier}
        showCountdown={showAttendeeCountdown}
      />
    );
  } else if (phase === "live") {
    if (joinFailed && !call) {
      // Call object itself never got created (e.g. denied before we even
      // had a callId) — nothing for PreJoinScreen to attach to, so fall
      // back to a plain retry screen.
      screen = (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#0A0C10] px-6 text-center text-[#F3F5F8]">
          <p className="text-sm text-[#8891A3]">Couldn&apos;t connect to the meeting.</p>
          <p className="max-w-sm text-xs text-[#8891A3]">
            Check your network connection and try again. If it still fails, the room may not be ready yet.
          </p>
          <button
            onClick={handleRetry}
            className="rounded-full bg-[#4f46e5] px-4 py-2 text-sm font-semibold text-[#0A0C10]"
          >
            Try again
          </button>
        </div>
      );
    } else if (hasJoined && call) {
      screen = (
        <>
          <LiveRoomScreen
            call={call}
            onLeave={handleLeave}
            eventId={eventId}
            showDeviceControls={isOrganizerTier}
            canModerate={isOrganizerTier}
            eventTitle={eventTitle}
            bannerUrl={bannerUrl}
          />
          <PreMeetingUpdates eventId={eventId} canModerate={isOrganizerTier} />
        </>
      );
    } else if (call) {
      screen = (
        <PreJoinScreen
          call={call}
          eventTitle={eventTitle}
          bannerUrl={bannerUrl}
          isOrganizerTier={isOrganizerTier}
          joining={joining}
          joinError={joinFailed}
          onJoin={joinFailed ? handleRetry : handleJoinClick}
        />
      );
    } else {
      // Call object not created yet (brief moment right as phase flips to
      // "live") — genuinely nothing to show a device preview against yet.
      screen = (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#0A0C10] px-6 text-center text-[#F3F5F8]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#4f46e5] border-t-transparent" />
          <h1 className="text-lg font-semibold">{eventTitle}</h1>
        </div>
      );
    }
  } else {
    screen = <EndedScreen eventTitle={eventTitle} />;
  }

  return (
    <>
      {screen}
      {isOrganizerTier && <OrganizerControls eventId={eventId} phase={phase} onChanged={refetch} />}
    </>
  );
}
