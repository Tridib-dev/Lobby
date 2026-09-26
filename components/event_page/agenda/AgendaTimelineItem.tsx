import { motion } from "framer-motion";
import type { EventAgendaItem } from "./types";

export default function AgendaTimelineItem({ item, index, isLast }: {
    item: EventAgendaItem;
    index: number;
    isLast: boolean;
}) {
    return (
        <motion.li
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, delay: Math.min(index * 0.035, 0.2) }}
            className="relative flex min-h-[56px] gap-3 pl-0"
        >
            <div className="relative flex w-5 shrink-0 justify-center">
                <span className="relative z-10 flex h-5 w-5 items-center justify-center rounded-full bg-[#3157d5] text-[10px] font-bold text-white">
                    {index + 1}
                </span>
                {!isLast && (
                    <span className="absolute left-1/2 top-5 h-[calc(100%+1px)] w-px -translate-x-1/2 bg-[#dbe2ef]" aria-hidden="true" />
                )}
            </div>
            <div className="min-w-0 flex-1 pb-4">
                <p className="text-[10px] font-bold leading-[1.2] text-[#3157d5]">
                    {item.startTime}-{item.endTime}
                </p>
                <p className="mt-1 text-[13px] font-semibold leading-[1.35] text-[#14213d]">
                    {item.keynote}
                </p>
            </div>
        </motion.li>
    );
}
