"use client";

// components/gate/QRScanner.tsx
// Camera QR scanning via html5-qrcode. Ticket type is unknown from the QR
// itself — the scanned URL only carries the ticket id, and /api/verify
// resolves whether it's a booking or an order server-side.
//
// npm install html5-qrcode

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CameraOff } from "lucide-react";
import CameraPermissionDrawer from "./CameraPermissionDrawer";
import { normalizeScanValue } from "./gate-format";
import { describeMediaDeviceError } from "@/lib/room/media-error";

export interface QRScannerProps {
  onScan: (ticketId: string) => void;
  active: boolean;
}

const REGION_ID = "gate-qr-region";

export default function QRScanner({ onScan, active }: QRScannerProps) {
  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const startedRef = useRef(false);
  const onScanRef = useRef(onScan);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionDrawerOpen, setPermissionDrawerOpen] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const lastScanRef = useRef<{ value: string; at: number }>({ value: "", at: 0 });

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    async function start() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;

        setError(null);
        setPermissionDrawerOpen(false);
        const instance = new Html5Qrcode(REGION_ID, { verbose: false });
        scannerRef.current = instance;

        await instance.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            const now = Date.now();
            // Debounce identical scans within 3s so one held-up QR doesn't spam.
            if (decodedText === lastScanRef.current.value && now - lastScanRef.current.at < 3000) {
              return;
            }
            lastScanRef.current = { value: decodedText, at: now };

            const ticketId = normalizeScanValue(decodedText);
            if (ticketId) onScanRef.current(ticketId);
          },
          () => {
            // per-frame decode failures are expected while aiming — ignore.
          }
        );

        startedRef.current = true;
        if (!cancelled) setRunning(true);
      } catch (err) {
        console.error("[QRScanner] camera start failed", err);
        if (!cancelled) setError(describeMediaDeviceError("camera", err));
        if (!cancelled) setPermissionDrawerOpen(true);
      }
    }

    start();

    return () => {
      cancelled = true;
      const instance = scannerRef.current;
      if (instance && startedRef.current) {
        try {
          void (async () => {
            try {
              await instance.stop();
              await instance.clear();
            } catch {
              // Ignore cleanup errors during unmount or rapid tab switches.
            }
          })();
        } catch {
          void instance.clear();
        }
      }
      startedRef.current = false;
      scannerRef.current = null;
      setRunning(false);
      setError(null);
      setPermissionDrawerOpen(false);
    };
  }, [active, retryToken]);

  return (
    <div className="space-y-2">
      <div className="relative mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-xl border border-[var(--gv-line)] bg-black">
        <div id={REGION_ID} className="h-full w-full" />
        {running && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-x-3 h-0.5 rounded-full bg-[var(--gv-scan)] shadow-[0_0_8px_2px_var(--gv-scan)]"
            animate={{ top: ["8%", "92%", "8%"] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </div>
      {error && (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-[var(--gv-stop)]">
          <CameraOff size={13} className="mt-0.5 shrink-0" />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setPermissionDrawerOpen(true)}
            className="underline decoration-dotted underline-offset-2 transition-opacity hover:opacity-80"
          >
            Check permissions
          </button>
        </div>
      )}
      {running && (
        <p className="text-center text-xs text-[var(--gv-ink-dim)]">
          Point the camera at a ticket QR code
        </p>
      )}

      <CameraPermissionDrawer
        open={permissionDrawerOpen}
        onOpenChange={setPermissionDrawerOpen}
        onRetry={() => {
          setError(null);
          setPermissionDrawerOpen(false);
          setRetryToken((current) => current + 1);
        }}
      />
    </div>
  );
}
