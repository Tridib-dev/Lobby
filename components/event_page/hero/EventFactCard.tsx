import Image from "next/image";
import type { EventFact } from "./types";

const icons: Record<EventFact["icon"], { src: string; alt: string }> = {
    calendar: { src: "/icons/calendar.svg", alt: "" },
    location: { src: "/icons/map-pin.svg", alt: "" },
    attendance: { src: "/icons/audience.svg", alt: "" },
};

export default function EventFactCard({ fact }: { fact: EventFact }) {
    const icon = icons[fact.icon];

    return (
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden rounded-[14px] bg-white p-3.5">
            <Image
                src={icon.src}
                alt={icon.alt}
                width={45}
                height={45}
                className="h-[35px] w-[35px] shrink-0 object-contain xl:h-[45px] xl:w-[45px]"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-normal">
                <p className="text-[11px] font-bold uppercase text-[#657086]">{fact.label}</p>
                <div className="min-w-0 text-[14px] font-semibold text-[#14213d] [&>span]:inline [&>span:last-child]:text-[#14213d]">
                    {fact.value}
                </div>
            </div>
        </div>
    );
}
