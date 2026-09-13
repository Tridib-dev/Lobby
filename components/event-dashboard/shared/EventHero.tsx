"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { eventCountdown, displayEventTime, resolveEventSchedule } from "@/lib/time";
import { Badge } from "@/components/ui/badge";
import { edTokens } from "@/components/event-dashboard/theme/tokens";
import AnimatedNumberCountdown from "@/components/room/AnimatedNumberCountdown";

const subscribe = () => () => {};

function formatCountdown(target: Date | null) {
    if (!target || Number.isNaN(target.getTime())) return { label: "Date not set", parts: null };
    if (target.getTime() <= Date.now()) return { label: "Event started", parts: null };

    const parts = eventCountdown(target);
    if (!parts.days && !parts.hours && !parts.minutes && !parts.seconds) {
        return { label: null, parts };
    }

    return {
        label: null,
        parts,
    };
}

export default function EventHero({
    title,
    category,
    date,
    time,
    timezone,
    startAtUTC,
    mode,
}: {
    title: string;
    category: string;
    date: string;
    time: string;
    timezone?: string;
    startAtUTC?: string | Date;
    mode?: string;
}) {
    const schedule = useMemo(
        () => resolveEventSchedule({ date, time, timezone, startAtUTC, mode }),
        [date, time, timezone, startAtUTC, mode]
    );
    const viewerTimezone = useSyncExternalStore(
        subscribe,
        () => Intl.DateTimeFormat().resolvedOptions().timeZone,
        () => undefined,
    );
    const display = useMemo(
        () => displayEventTime(schedule.instant, schedule.timezone, viewerTimezone ?? schedule.timezone, mode),
        [schedule.instant, schedule.timezone, mode, viewerTimezone]
    );
    const startDate = schedule.instant;
    const [countdown, setCountdown] = useState<ReturnType<typeof formatCountdown>>(() => formatCountdown(startDate));

    useEffect(() => {
        const id = setInterval(() => setCountdown(formatCountdown(startDate)), 1000);
        return () => clearInterval(id);
    }, [startDate]);

    return (
        <section className="relative overflow-hidden px-2 py-0 sm:px-4 sm:py-1">
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-1/2 top-0 h-40 w-96 -translate-x-1/2 rounded-full blur-3xl"
                style={{ background: "rgba(51, 43, 224, 0.18)" }}
            />

            <div className="relative mx-auto flex max-w-5xl flex-col items-center text-center">
                <h1 className="max-w-4xl text-balance text-[30px] font-semibold leading-tight text-slate-950 sm:text-[40px] lg:text-[48px]">
                    {title}
                </h1>

                <Badge
                    variant="secondary"
                    className="mt-4 border border-slate-200 bg-slate-100 px-3 py-1 text-[12px] font-medium text-slate-600"
                >
                    {category}
                </Badge>

                <p className="mt-4 text-[14px] text-slate-500 sm:text-[15px]">
                    <span>{display.primary}</span>
                </p>
                {display.secondary && (
                    <p className="mt-1 text-[12px] text-slate-400">{display.secondary}</p>
                )}

                <div className="mt-6 flex w-full max-w-[620px] justify-center px-2 py-1">
                    {!countdown || countdown.label ? (
                        <div
                            className="rounded-full border px-4 py-2 text-sm font-medium text-slate-700"
                            style={{
                                borderColor: edTokens.accentBorder,
                                background: edTokens.accentMuted,
                            }}
                        >
                            {countdown?.label ?? "Loading countdown"}
                        </div>
                    ) : (
                        <AnimatedNumberCountdown endDate={startDate} />
                    )}
                </div>
            </div>
        </section>
    );
}
