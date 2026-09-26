"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useMemo, useState } from "react";
import AgendaTimelineItem from "./AgendaTimelineItem";
import AgendaViewMore from "./AgendaViewMore";
import type { EventAgendaItem, EventAgendaProps } from "./types";

function formatAgendaDate(value?: string | Date) {
    if (!value) return undefined;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    return new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
    }).format(date);
}

export default function EventAgenda({ items, date, title = "Agenda" }: EventAgendaProps) {
    const reducedMotion = useReducedMotion();
    const [expanded, setExpanded] = useState(false);
    const agendaItems = useMemo(
        () => items.filter((item): item is EventAgendaItem => Boolean(item?.startTime && item?.endTime && item?.keynote)),
        [items],
    );

    if (agendaItems.length === 0) return null;

    const hasOverflow = agendaItems.length > 4;
    const visibleItems = expanded || !hasOverflow ? agendaItems : agendaItems.slice(0, 4);

    return (
        <section className="flex w-full flex-col items-start gap-3" aria-labelledby="event-agenda-heading">
            <p className="text-[12px] font-bold uppercase leading-normal text-[#3157d5]">{title}</p>
            {formatAgendaDate(date) && (
                <h2 id="event-agenda-heading" className="text-[20px] font-normal leading-normal text-[#14213d] md:text-[24px]">
                    {formatAgendaDate(date)}
                </h2>
            )}

            <div className="relative w-full overflow-hidden">
                <motion.ol
                    layout={!reducedMotion}
                    className="m-0 list-none p-0"
                    initial={false}
                >
                    <AnimatePresence initial={false} mode="popLayout">
                        {visibleItems.map((item, index) => (
                            <AgendaTimelineItem
                                key={`${item.startTime}-${item.endTime}-${item.keynote}`}
                                item={item}
                                index={index}
                                isLast={index === visibleItems.length - 1}
                            />
                        ))}
                    </AnimatePresence>
                </motion.ol>

                {hasOverflow && !expanded && (
                    <AgendaViewMore
                        expanded={expanded}
                        onClick={() => setExpanded(true)}
                        count={agendaItems.length}
                    />
                )}
            </div>

            {hasOverflow && expanded && (
                <AgendaViewMore
                    expanded={expanded}
                    onClick={() => setExpanded(false)}
                    count={agendaItems.length}
                />
            )}
        </section>
    );
}

export type { EventAgendaItem, EventAgendaProps } from "./types";
