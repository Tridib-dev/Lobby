"use server";

import { cache } from "react";
import { isValidObjectId } from "mongoose";
import connectToDatabase from "@/lib/mongodb";
import { Event } from "@/database/event.model";
import { isGateAuthorized } from "@/lib/actions/gate.actions";
import { isEventCreator } from "@/lib/actions/event.actions";

export interface EventSettingsPatch {
    title?: string;
    description?: string;
    overview?: string;
    date?: string;
    time?: string;
    timezone?: string;
    venue?: string;
    location?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    category?: string;
    tags?: string[];
    price?: number;
    isFree?: boolean;
}

export type UpdateEventSettingsResult =
    | { success: true }
    | { success: false; reason: "unauthorized" | "not_found" | "not_implemented" | "invalid" };

export async function updateEventSettings(
    eventId: string,
    _patch: EventSettingsPatch
): Promise<UpdateEventSettingsResult> {
    if (!isValidObjectId(eventId)) {
        return { success: false, reason: "not_found" };
    }

    const authorized = await isGateAuthorized(eventId);
    if (!authorized) {
        return { success: false, reason: "unauthorized" };
    }

    const creator = await isEventCreator(eventId);
    if (!creator) {
        return { success: false, reason: "unauthorized" };
    }

    return { success: false, reason: "not_implemented" };
}

export interface EventSettingsSummary {
    title: string;
    description: string;
    overview: string;
    date: string;
    time: string;
    timezone: string;
    startAtUTC?: string;
    venue: string;
    location: string;
    address: string;
    city: string;
    state: string;
    country: string;
    price: number;
    isFree: boolean;
    capacity: number | null;
    mode: string;
    category: string;
    slug: string;
}

export const getEventSettings = cache(
    async (eventId: string): Promise<EventSettingsSummary | null> => {
        if (!isValidObjectId(eventId)) return null;

        const authorized = await isGateAuthorized(eventId);
        if (!authorized) return null;

        await connectToDatabase();

        const event = await Event.findById(eventId)
            .select(
                "title description overview date time timezone startAtUTC venue location address city state country price isFree capacity mode category slug"
            )
            .lean<{
                title: string;
                description: string;
                overview: string;
                date: string;
                time: string;
                timezone?: string;
                startAtUTC?: Date;
                venue: string;
                location: string;
                address: string;
                city: string;
                state: string;
                country: string;
                price: number;
                isFree: boolean;
                capacity?: number;
                mode: string;
                category: string;
                slug: string;
            }>();

        if (!event) return null;

        return {
            title: event.title,
            description: event.description,
            overview: event.overview,
            date: event.date,
            time: event.time,
            timezone: event.timezone ?? "Asia/Kolkata",
            startAtUTC: event.startAtUTC?.toISOString(),
            venue: event.venue,
            location: event.location,
            address: event.address ?? "",
            city: event.city ?? "",
            state: event.state ?? "",
            country: event.country ?? "",
            price: event.price ?? 0,
            isFree: event.isFree ?? event.price === 0,
            capacity: event.capacity ?? null,
            mode: event.mode,
            category: event.category,
            slug: event.slug,
        };
    }
);
