import type { ReactNode } from "react";

export type EventAvailabilityState = "open" | "closed" | "sold-out";

export type EventHeroData = {
    title: string;
    subtitle?: string;
    image: string;
    category: string;
    price: number;
    isFree?: boolean;
    availabilityLabel?: string;
    availabilityState?: EventAvailabilityState;
    date: string;
    time: string;
    timezone?: string;
    startAtUTC?: string | Date;
    location: string;
    mode: string;
    audience: string[];
};

export type EventFact = {
    label: string;
    value: ReactNode;
    icon: "calendar" | "location" | "attendance";
};
