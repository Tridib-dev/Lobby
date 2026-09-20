// lib/actions/event.actions.ts

'use server'

import { Event , IEvent} from "@/database/event.model";
import connectToDatabase from "../mongodb"
import { auth } from "@clerk/nextjs/server";
import { User } from "@/database/User.model";
import { notifyFollowersOfNewEvent } from "@/lib/notifications";
import { revalidatePath } from "next/cache";


export const getSimilarEventsBySlug = async (slug: string, limit = 6) => {
    try {
        await connectToDatabase();

        const event = await Event.findOne({ slug });
        if (!event) return [];

        // Use the stored, pre-computed real start instant — no need to
        // recompute timezone math here, and no need to attempt timezone
        // conversion inside the Mongo aggregation pipeline itself.
        // Falls back to the (UTC-midnight) `date` field for any legacy
        // event created before startAtUTC existed.
        const eventStart = event.startAtUTC ?? new Date(event.date);
        const now = new Date();

        const events = await Event.aggregate([
            {
                $match: {
                    _id: { $ne: event._id },
                    startAtUTC: { $gte: now }, // only recommend upcoming events
                },
            },

            // Step 1: raw comparison values
            {
                $addFields: {
                    sharedTagsCount: {
                        $size: { $setIntersection: ["$tags", event.tags] },
                    },
                    daysApart: {
                        $abs: {
                            $divide: [
                                { $subtract: ["$startAtUTC", eventStart] },
                                1000 * 60 * 60 * 24,
                            ],
                        },
                    },
                },
            },

            // Step 2: "real" similarity score — date is NOT part of this
            {
                $addFields: {
                    coreScore: {
                        $add: [
                            { $multiply: ["$sharedTagsCount", 10] },
                            { $cond: [{ $eq: ["$category", event.category] }, 25, 0] },
                            { $cond: [{ $eq: ["$city", event.city] }, 20, 0] },
                            {
                                $cond: [
                                    { $and: [{ $ne: ["$city", event.city] }, { $eq: ["$country", event.country] }] },
                                    8,
                                    0,
                                ],
                            },
                            { $cond: [{ $eq: ["$mode", event.mode] }, 8, 0] },
                        ],
                    },
                    dateBonus: {
                        $max: [0, { $subtract: [15, { $divide: ["$daysApart", 7] }] }],
                    },
                },
            },

            // Step 3: final ranking score = real similarity + date boost
            {
                $addFields: {
                    score: { $add: ["$coreScore", "$dateBonus"] },
                },
            },

            //  Filter on coreScore, not the blended score — date alone can't qualify an event
            { $match: { coreScore: { $gt: 0 } } },

            { $sort: { score: -1, startAtUTC: 1 } },
            { $limit: limit },
        ]);

        return JSON.parse(JSON.stringify(events));
    } catch (e) {
        console.error("Failed to fetch similar events by slug:", e);
        return [];
    }
};

export const getEventBySlug = async (slug: string) => {
    try {
        const normalizedSlug = slug.trim().toLowerCase();
        if (!normalizedSlug) return null;

        await connectToDatabase();

        const event = await Event.findOne({ slug: normalizedSlug }).lean();
        if (!event) return null;

        // Additive: expose utc/timezone alongside the existing date/time
        // fields. Existing consumers reading date/time are unaffected.
        const response = {
            ...event,
            utc: event.startAtUTC ? new Date(event.startAtUTC).toISOString() : null,
            timezone: event.timezone ?? null,
        };

        return JSON.parse(JSON.stringify(response));
    } catch (e) {
        console.error("Failed to fetch event by slug:", e);
        throw e;
    }
};


export const createEvent = async (data: Omit<IEvent, '_id' | 'slug' | 'createdAt' | 'updatedAt' | 'tagSlugs' | 'countrySlug' | 'stateSlug' | 'citySlug' | 'categorySlug'>) => {
    try {
        const { userId } = await auth();
        if (!userId) throw new Error("Unauthorized");

        const db = await connectToDatabase();

        // Track how many events this user has hosted (for billing)
        const user = await User.findOne(
            { clerkId: userId },
        ).select("eventsHostedCount username");

        if (!user) throw new Error("Creator profile not found");

        // Future: if !isFirstEvent → charge platform fee before proceeding

        const session = await db.startSession();
        let transactionResult;

        try {
            transactionResult = await session.withTransaction(async () => {
                const [createdEvent] = await Event.create([{
                    ...data,
                    creatorClerkId: userId,
                }], { session });

                const nextUser = await User.findOneAndUpdate(
                    { clerkId: userId },
                    { $inc: { eventsHostedCount: 1 } },
                    { new: true, session }
                ).select("eventsHostedCount username");

                if (!nextUser) throw new Error("Creator profile disappeared during event creation");

                return { event: createdEvent, updatedUser: nextUser };
            });
        } finally {
            await session.endSession();
        }

        if (!transactionResult) throw new Error("Event creation transaction returned no result");

        const { event, updatedUser } = transactionResult;
        const isFirstEvent = updatedUser.eventsHostedCount === 1;

        await notifyFollowersOfNewEvent({
            creatorClerkId: userId,
            eventId: event._id.toString(),
            eventSlug: event.slug,
            eventTitle: event.title,
        });

        if (updatedUser.username) {
            revalidatePath(`/profile/${updatedUser.username}`);
        }

        return { 
            success: true, 
            event: JSON.parse(JSON.stringify(event)),
            isFirstEvent,
        };
    } catch (error) {
        console.error("[createEvent]", error);
        return { success: false, error: "Failed to create event." };
    }
};

export const getEventsByCreator = async () => {
    try {
        const { userId } = await auth();
        if (!userId) return [];

        await connectToDatabase();

        const events = await Event.find({ creatorClerkId: userId })
            .sort({ createdAt: -1 })
            .lean();

        // Additive: expose utc/timezone alongside existing date/time fields.
        const response = events.map((event) => ({
            ...event,
            utc: event.startAtUTC ? new Date(event.startAtUTC).toISOString() : null,
            timezone: event.timezone ?? null,
        }));

        return JSON.parse(JSON.stringify(response));
    } catch (error) {
        console.error("[getEventsByCreator]", error);
        return [];
    }
};

export const isEventCreator = async (eventId: string): Promise<boolean> => {
    try {
        const { userId } = await auth();
        if (!userId) return false;

        await connectToDatabase();

        const event = await Event.findById(eventId).select("creatorClerkId");
        return event?.creatorClerkId === userId;
    } catch {
        return false;
    }
};
