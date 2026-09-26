import type { EventFact } from "./types";
import EventFactCard from "./EventFactCard";

export default function EventQuickFacts({ facts }: { facts: EventFact[] }) {
    return (
        <div className="flex w-full flex-col gap-3 md:flex-row xl:flex-col xl:gap-0">
            {facts.map((fact) => <EventFactCard key={fact.label} fact={fact} />)}
        </div>
    );
}
