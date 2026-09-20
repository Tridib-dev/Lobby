"use client";

import { ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { StreamVideo, StreamVideoClient } from "@stream-io/video-react-sdk";
import { useUser } from "@clerk/nextjs";

const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
const CONNECT_TIMEOUT_MS = 12_000;

const StreamVideoProvider = ({ children }: { children: ReactNode }) => {
  const { user, isLoaded } = useUser();
  const pathname = usePathname();
  const router = useRouter();
  const [retryKey, setRetryKey] = useState(0);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const userId = user?.id ?? null;
  const userName = user?.fullName ?? user?.username ?? userId ?? undefined;
  const userImage = user?.imageUrl ?? undefined;
  const configError = isLoaded && userId && !apiKey ? "Stream API key is missing. Please check your environment variables." : null;

  const [videoClient, setVideoClient] = useState<StreamVideoClient | null>(null);

  // Stream clients own a WebSocket and device/session state. Create them in
  // an effect and dispose them in the matching cleanup so strict-mode
  // remounts and connection retries cannot reuse a disconnected client.
  useEffect(() => {
    if (!isLoaded || !userId || !apiKey || retryKey < 0) {
      return;
    }

    let active = true;
    const client = new StreamVideoClient({
      apiKey,
      user: {
        id: userId,
        name: userName,
        image: userImage,
      },
      tokenProvider: async () => {
        const res = await fetch("/api/stream/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) {
          if (res.status === 401) {
            throw new Error("You are not signed in, so Stream cannot create a room token.");
          }
          throw new Error("[Stream]: failed to fetch user token");
        }

        return await res.text();
      },
      options: {
        maxConnectUserRetries: 3,
        onConnectUserError: (err) => {
          console.error("[StreamVideoProvider] connectUser failed", err);
          setConnectError(err instanceof Error ? err.message : "Failed to connect Stream user.");
        },
      },
    });

    // Publish the client after the effect has completed so React does not
    // synchronously cascade another render from inside the effect body.
    queueMicrotask(() => {
      if (active) setVideoClient(client);
    });

    return () => {
      active = false;
      void client.disconnectUser().catch((error: unknown) => {
        console.error("[StreamVideoProvider] disconnect failed", error);
      });
      setVideoClient((current) => (current === client ? null : current));
    };
  }, [isLoaded, retryKey, userId, userName, userImage]);

  const connectedUser = useSyncExternalStore(
    (onStoreChange) => {
      if (!videoClient) {
        return () => {};
      }

      const subscription = videoClient.state.connectedUser$.subscribe(() => {
        onStoreChange();
      });

      return () => {
        subscription.unsubscribe();
      };
    },
    () => videoClient?.state.connectedUser,
    () => undefined,
  );

  useEffect(() => {
    if (!isLoaded || userId) return;

    const redirectTo = `/sign-in?redirect_url=${encodeURIComponent(pathname ?? "/")}`;
    router.replace(redirectTo);
  }, [isLoaded, pathname, router, userId]);

  useEffect(() => {
    if (!videoClient || connectedUser) return;

    const timer = window.setTimeout(() => {
      if (!videoClient.state.connectedUser) {
        setTimedOut(true);
        setConnectError("Stream is taking longer than usual to connect.");
      }
    }, CONNECT_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [connectedUser, videoClient]);

  if (!isLoaded) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0A0C10] px-6 text-center text-[#F3F5F8]">
        <div className="space-y-2">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#4FD1FF] border-t-transparent" />
          <h3 className="text-sm font-medium">Preparing your account…</h3>
        </div>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0A0C10] px-6 text-center text-[#F3F5F8]">
        <div className="space-y-2">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#4FD1FF] border-t-transparent" />
          <h3 className="text-sm font-medium">Redirecting to sign in…</h3>
        </div>
      </div>
    );
  }

  if (configError || connectError || timedOut) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0A0C10] px-6 text-center text-[#F3F5F8]">
        <div className="max-w-sm space-y-4 rounded-3xl border border-[#262B35] bg-[#11161D] px-6 py-7 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
          <div className="mx-auto h-10 w-10 rounded-full bg-[#4FD1FF]/10 text-[#4FD1FF] flex items-center justify-center">
            !
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold">Couldn’t load the room</h3>
            <p className="text-sm text-[#8891A3]">
              {configError ?? connectError ?? "The room connection timed out. Please try again."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setConnectError(null);
              setTimedOut(false);
              setRetryKey((current) => current + 1);
            }}
            className="inline-flex items-center justify-center rounded-full bg-[#33D6A0] px-5 py-3 text-sm font-semibold text-[#0A0C10] transition-opacity hover:opacity-90"
          >
            Retry connection
          </button>
        </div>
      </div>
    );
  }

  if (!videoClient || !connectedUser) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0A0C10] px-6 text-center text-[#F3F5F8]">
        <div className="space-y-2">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#4FD1FF] border-t-transparent" />
          <h3 className="text-sm font-medium">Connecting to room…</h3>
          <p className="text-xs text-[#8891A3]">This usually takes a moment on the first load.</p>
        </div>
      </div>
    );
  }

  return (
    <StreamVideo client={videoClient}>
      {children}
    </StreamVideo>
  );
};

export default StreamVideoProvider;
