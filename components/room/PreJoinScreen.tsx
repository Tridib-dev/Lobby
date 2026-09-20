// components/room/PreJoinScreen.tsx
"use client";

import { useEffect, useState } from "react";
import {
  StreamCall,
  VideoPreview,
  useCallStateHooks,
  type Call,
} from "@stream-io/video-react-sdk";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";
import { describeMediaDeviceError } from "@/lib/room/media-error";

export interface PreJoinScreenProps {
  call: Call;
  eventTitle: string;
  bannerUrl?: string;
  isOrganizerTier: boolean;
  joining: boolean;
  joinError: boolean;
  onJoin: () => void;
}

export default function PreJoinScreen(props: PreJoinScreenProps) {
  // The device toggles below need call state hooks, which only work inside
  // a <StreamCall> boundary — this Call hasn't been join()'d yet, but the
  // SDK's camera/microphone managers and preview work fine pre-join.
  return (
    <StreamCall call={props.call}>
      <PreJoinScreenInner {...props} />
    </StreamCall>
  );
}

function PreJoinScreenInner({
  eventTitle,
  bannerUrl,
  isOrganizerTier,
  joining,
  joinError,
  onJoin,
}: Omit<PreJoinScreenProps, "call">) {
  const { useCameraState, useMicrophoneState } = useCallStateHooks();
  const {
    camera,
    isMute: cameraMuted,
    hasBrowserPermission: hasCameraPermission,
    isPromptingPermission: isPromptingCameraPermission,
    isTogglePending: isCameraTogglePending,
  } = useCameraState();
  const {
    microphone,
    isMute: micMuted,
    hasBrowserPermission: hasMicPermission,
    isPromptingPermission: isPromptingMicPermission,
    isTogglePending: isMicTogglePending,
  } = useMicrophoneState();
  const [devicesReady, setDevicesReady] = useState(() => !isOrganizerTier);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  // Do not request camera access automatically on mount. A failed or dismissed
  // automatic request can leave the SDK's permission state stale, while a
  // user-triggered toggle gives the browser a clean permission interaction.
  // The microphone remains off until the user explicitly enables it.
  useEffect(() => {
    if (!isOrganizerTier) return;
    let cancelled = false;
    microphone.disable().catch((error: unknown) => {
      console.error("[PreJoinScreen] microphone disable failed", error);
    });
    queueMicrotask(() => {
      if (!cancelled) setDevicesReady(true);
    });
    return () => {
      cancelled = true;
    };
    // Run when the organizer call/device manager becomes available.
  }, [isOrganizerTier, microphone]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#0A0C10] px-6 py-10 text-center text-[#F3F5F8]">
      {bannerUrl && (
        <img src={bannerUrl} alt={eventTitle} className="h-32 w-full max-w-sm rounded-xl object-cover" />
      )}
      <h1 className="text-xl font-semibold">{eventTitle}</h1>

      {isOrganizerTier ? (
        <div className="flex w-full max-w-sm flex-col items-center gap-4">
          <div className="aspect-video w-full overflow-hidden rounded-2xl border border-[#262B35] bg-[#11161D]">
            {devicesReady && !cameraMuted ? (
              <VideoPreview />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-[#8891A3]">
                Camera off
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() =>
                camera.toggle().catch((error: unknown) => {
                  console.error("[PreJoinScreen] camera toggle failed", error);
                  setDeviceError(describeMediaDeviceError("camera", error));
                })
              }
              disabled={!devicesReady || isCameraTogglePending}
              className={`flex h-11 w-11 items-center justify-center rounded-full ${
                cameraMuted ? "bg-[#1B1F27] text-[#8891A3]" : "bg-[#4f46e5] text-[#0A0C10]"
              } disabled:opacity-50`}
              aria-pressed={!cameraMuted}
              aria-label={cameraMuted ? "Turn camera on" : "Turn camera off"}
            >
              {cameraMuted ? <VideoOff size={18} /> : <Video size={18} />}
            </button>
            <button
              type="button"
              onClick={() =>
                microphone.toggle().catch((error: unknown) => {
                  console.error("[PreJoinScreen] microphone toggle failed", error);
                  setDeviceError(describeMediaDeviceError("microphone", error));
                })
              }
              disabled={!devicesReady || isMicTogglePending}
              className={`flex h-11 w-11 items-center justify-center rounded-full ${
                micMuted ? "bg-[#1B1F27] text-[#8891A3]" : "bg-[#4f46e5] text-[#0A0C10]"
              } disabled:opacity-50`}
              aria-pressed={!micMuted}
              aria-label={micMuted ? "Turn mic on" : "Turn mic off"}
            >
              {micMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          </div>

          {(isPromptingCameraPermission || isPromptingMicPermission) && (
            <p className="max-w-xs text-xs text-[#8891A3]">
              Waiting for browser permission. Choose Allow for the camera or microphone prompt to continue.
            </p>
          )}
          {!isPromptingCameraPermission && !isPromptingMicPermission &&
            (hasCameraPermission === false || hasMicPermission === false) && (
              <p className="max-w-xs text-xs text-[#8891A3]">
                Camera or microphone access is not available yet. Use the controls to retry, or allow access in the
                browser&apos;s site settings.
              </p>
            )}
          {deviceError && <p className="max-w-xs text-xs text-[#FF5468]">{deviceError}</p>}
        </div>
      ) : (
        <p className="max-w-xs text-sm text-[#8891A3]">
          You&apos;ll join as a viewer — your camera and mic stay off, but you can chat, ask questions, and react.
        </p>
      )}

      {joinError && (
        <p className="max-w-xs text-xs text-[#FF5468]">Couldn&apos;t connect — check your network and try again.</p>
      )}

      <button
        type="button"
        onClick={onJoin}
        disabled={joining}
        className="rounded-full bg-[#33D6A0] px-6 py-3 text-sm font-semibold text-[#0A0C10] disabled:opacity-60"
      >
        {joining ? "Joining…" : joinError ? "Try again" : "Join meeting"}
      </button>
    </div>
  );
}
