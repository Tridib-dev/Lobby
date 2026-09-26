import EventFlags from "./EventFlags";
import type { EventAvailabilityState } from "./types";

export default function EventHeroCopy({
    title,
    subtitle,
    category,
    availabilityLabel,
    availabilityState,
}: {
    title: string;
    subtitle?: string;
    category: string;
    availabilityLabel: string;
    availabilityState: EventAvailabilityState;
}) {
    return (
        <div className="flex w-full min-w-0 flex-col items-start gap-4 overflow-hidden">
            <EventFlags
                category={category}
                availabilityLabel={availabilityLabel}
                availabilityState={availabilityState}
            />
            <h1 id="event-hero-title" className="w-full text-[36px] font-normal leading-[1.05] tracking-[-0.025em] text-[#14213d] md:text-[46px] xl:text-[58px]">
                {title}
            </h1>
            {subtitle && (
                <p className="w-full text-[17px] leading-[1.45] text-[#657086] md:text-[20px]">
                    {subtitle}
                </p>
            )}
        </div>
    );
}
