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
  const { camera, isMute: cameraMuted, hasBrowserPermission: hasCameraPermission } = useCameraState();
  const { microphone, isMute: micMuted, hasBrowserPermission: hasMicPermission } = useMicrophoneState();
  const [devicesReady, setDevicesReady] = useState(() => !isOrganizerTier);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  // Organizer tier gets a live preview by default (camera on, mic off —
  // most people don't want to broadcast audio while they're still
  // fiddling with settings). Attendees can't publish at all, so there's
  // nothing to preview or toggle for them.
  useEffect(() => {
    if (!isOrganizerTier) return;
    let cancelled = false;
    Promise.allSettled([camera.enable(), microphone.disable()]).then(([cameraResult]) => {
      if (!cancelled) {
        if (cameraResult.status === "rejected") {
          setDeviceError("Camera could not be enabled. Check browser and device permissions.");
        }
        setDevicesReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
    // Only run once when entering the pre-join screen as organizer tier.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOrganizerTier]);

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
              onClick={() => camera.toggle()}
              disabled={!devicesReady || hasCameraPermission === false}
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
              onClick={() => microphone.toggle()}
              disabled={!devicesReady || hasMicPermission === false}
              className={`flex h-11 w-11 items-center justify-center rounded-full ${
                micMuted ? "bg-[#1B1F27] text-[#8891A3]" : "bg-[#4f46e5] text-[#0A0C10]"
              } disabled:opacity-50`}
              aria-pressed={!micMuted}
              aria-label={micMuted ? "Turn mic on" : "Turn mic off"}
            >
              {micMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          </div>

          {(hasCameraPermission === false || hasMicPermission === false) && (
            <p className="max-w-xs text-xs text-[#8891A3]">
              Camera/mic permission was denied in the browser — you can still join and enable them later from the
              controls bar.
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
