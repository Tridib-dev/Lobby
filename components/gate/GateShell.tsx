"use client";

// components/gate/GateShell.tsx
// Layout orchestrator. Owns activeTab + refreshKey. Also the single place
// that defines the gate's visual token system as CSS variables, so every
// child component (GateStats, ScannerPanel, AttendeeList, etc) can just
// reference var(--gv-*) without importing a theme file.
//
// Design direction: this is a door-staff tool, not a marketing surface —
// modeled on a departures/gate display: near-black panel, mono digits for
// counts and timestamps, clear go/stop/wait signal colors.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import GateStats from "./GateStats";
import GateTabs from "./GateTabs";
import ScannerPanel from "./ScannerPanel";
import AttendeeList from "./AttendeeList";
import { formatClockTime } from "./gate-format";

type GateTab = "scanner" | "attendees";

export interface GateShellProps {
  eventId: string;
  eventTitle: string;
  eventMode: "online" | "offline" | "hybrid";
  eventSlug: string;
  /** When set, back arrow links here instead of the public event page. */
  backHref?: string;
  /** Dashboard embed: drop full-page min-height. */
  embedded?: boolean;
}

function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="font-[family-name:var(--font-mono)] text-sm tabular-nums text-[var(--gv-ink-dim)]">
      {now ? formatClockTime(now) : "--:--:--"}
    </span>
  );
}

export default function GateShell({
  eventId,
  eventTitle,
  eventMode,
  eventSlug,
  backHref,
  embedded = false,
}: GateShellProps) {
  const [activeTab, setActiveTab] = useState<GateTab>("scanner");
  const [refreshKey, setRefreshKey] = useState(0);

  const handleCheckedIn = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <div
      className={`${embedded ? "min-h-0" : "min-h-screen"} bg-[var(--gv-bg)] text-[var(--gv-ink)] rounded-2xl border border-white/8 overflow-hidden`}
      style={
        {
          "--font-display": "Inter, sans-serif",
          "--font-mono": "JetBrains Mono, Consolas, monospace",
          "--gv-bg": "#0A0C10",
          "--gv-panel": "#14171D",
          "--gv-panel-2": "#1B1F27",
          "--gv-line": "#262B35",
          "--gv-ink": "#F3F5F8",
          "--gv-ink-dim": "#8891A3",
          "--gv-go": "#33D6A0",
          "--gv-stop": "#FF5468",
          "--gv-wait": "#F5A623",
          "--gv-scan": "#4FD1FF",
        } as React.CSSProperties
      }
    >
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-[var(--gv-line)] bg-[var(--gv-bg)]/95 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href={backHref ?? `/events/${eventSlug}`}
              className="shrink-0 rounded-full p-1.5 text-[var(--gv-ink-dim)] hover:bg-[var(--gv-panel-2)] hover:text-[var(--gv-ink)] transition-colors"
              aria-label={backHref ? "Back to dashboard" : "Back to event"}
            >
              <ArrowLeft size={18} />
            </Link>
            <div className="min-w-0">
              <p className="truncate font-[family-name:var(--font-display)] text-base font-medium leading-tight">
                {eventTitle}
              </p>
              <p className="text-[11px] uppercase tracking-wider text-[var(--gv-ink-dim)]">
                Gate · {eventMode}
              </p>
            </div>
          </div>
          <LiveClock />
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 pb-24 pt-4">
        <GateStats eventSlug={eventSlug} refreshKey={refreshKey} />

        <div className="mt-5">
          <GateTabs active={activeTab} onTabChange={setActiveTab} />
        </div>

        <div className="mt-4">
          {activeTab === "scanner" ? (
            <ScannerPanel eventId={eventId} onCheckedIn={handleCheckedIn} />
          ) : (
            <AttendeeList
              eventId={eventId}
              eventSlug={eventSlug}
              refreshKey={refreshKey}
              onCheckedIn={handleCheckedIn}
            />
          )}
        </div>
      </div>
    </div>
  );
}
