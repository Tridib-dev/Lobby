import EventScheduleDisplay from "@/components/EventScheduleDisplay";
import EventAudiencePreview from "./EventAudiencePreview";
import EventBanner from "./EventBanner";
import EventHeroCopy from "./EventHeroCopy";
import EventPriceStatus from "./EventPriceStatus";
import EventQuickFacts from "./EventQuickFacts";
import type { EventHeroData } from "./types";

export default function EventHero({ event }: { event: EventHeroData }) {
    const isSoldOut = event.availabilityState === "sold-out";
    const availabilityState = event.availabilityState ?? (isSoldOut ? "sold-out" : "open");
    const availabilityLabel = event.availabilityLabel ?? (isSoldOut ? "SOLD OUT" : "REGISTRATION OPEN");

    return (
        <section className="flex w-full flex-col items-start gap-6 bg-white px-5 pb-9 pt-7 md:gap-8 md:px-10 md:pb-14 md:pt-11 xl:px-[72px]" aria-labelledby="event-hero-title">
            <EventHeroCopy
                title={event.title}
                subtitle={event.subtitle}
                category={event.category}
                availabilityLabel={availabilityLabel}
                availabilityState={availabilityState}
            />

            <div className="flex w-full flex-col items-start gap-6 md:gap-8 xl:grid xl:grid-cols-[minmax(0,922px)_minmax(280px,1fr)] xl:gap-6">
                <EventBanner src={event.image} alt={`${event.title} banner`} priority />

                <div className="flex w-full min-w-0 flex-col items-start gap-5 md:gap-8 xl:h-[520px] xl:gap-[30px]">
                    <div className="flex w-full flex-col items-start gap-5">
                        <EventPriceStatus price={event.price} isFree={event.isFree ?? event.price <= 0} />
                        <EventQuickFacts
                            facts={[
                                {
                                    label: "Date and time",
                                    icon: "calendar",
                                    value: (
                                        <EventScheduleDisplay
                                            date={event.date}
                                            time={event.time}
                                            timezone={event.timezone}
                                            startAtUTC={event.startAtUTC}
                                            mode={event.mode}
                                        />
                                    ),
                                },
                                { label: "Venue", icon: "location", value: event.location },
                                { label: "Attendance", icon: "attendance", value: event.mode },
                            ]}
                        />
                    </div>
                    <EventAudiencePreview audience={event.audience} />
                </div>
            </div>
        </section>
    );
}

export type { EventHeroData } from "./types";
