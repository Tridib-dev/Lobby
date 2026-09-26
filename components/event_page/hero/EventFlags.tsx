import { cn } from "@/lib/utils";
import type { EventAvailabilityState } from "./types";

function Flag({ children, className }: { children: React.ReactNode; className: string }) {
    return (
        <span className={cn(
            "inline-flex items-center rounded-full px-2.5 py-1.5 text-[12px] font-bold uppercase leading-none tracking-[-0.01em]",
            className,
        )}>
            {children}
        </span>
    );
}

export default function EventFlags({
    category,
    availabilityLabel,
    availabilityState,
}: {
    category: string;
    availabilityLabel: string;
    availabilityState: EventAvailabilityState;
}) {
    const availabilityStyles = {
        open: "bg-[#dff7f4] text-[#18785b]",
        closed: "bg-[#fff3db] text-[#9a6500]",
        "sold-out": "bg-[#ffe6e6] text-[#b42318]",
    } as const;

    return (
        <div className="flex flex-wrap items-start gap-2" aria-label="Event status">
            <Flag className="bg-[#e9eeff] text-[#3157d5]">{category}</Flag>
            <Flag className={availabilityStyles[availabilityState]}>{availabilityLabel}</Flag>
        </div>
    );
}
