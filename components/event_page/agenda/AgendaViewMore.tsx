import { ChevronDown, ChevronUp } from "lucide-react";
import { motion } from "framer-motion";

export default function AgendaViewMore({ expanded, onClick, count }: {
    expanded: boolean;
    onClick: () => void;
    count: number;
}) {
    return (
        <div className={expanded
            ? "pointer-events-none relative z-20 flex justify-center pt-2"
            : "pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center bg-gradient-to-t from-[#f5f7fa] via-[#f5f7fa]/95 to-transparent pb-1 pt-14"}>
            <motion.button
                type="button"
                onClick={onClick}
                whileTap={{ scale: 0.98 }}
                className="pointer-events-auto inline-flex items-center gap-2 rounded-lg border border-[#dde3ec] bg-white px-4 py-2.5 text-[12px] font-bold text-[#14213d] shadow-[0_6px_18px_rgba(20,33,61,0.16)] transition-colors hover:bg-[#f7f9fc]"
                aria-expanded={expanded}
            >
                {expanded ? "Show less" : `View all ${count} agenda items`}
                {expanded ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
            </motion.button>
        </div>
    );
}
