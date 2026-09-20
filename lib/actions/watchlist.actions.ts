"use server";

import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/mongodb";
import { Watchlist } from "@/database/watchlist.model";
import { connection } from "next/server";

// Toggle save/unsave — returns new saved state
export const toggleWatchlist = async (eventId: string): Promise<{
    saved: boolean;
    error?: string;
}> => {
    try {
        const { userId } = await auth();
        if (!userId) return { saved: false, error: "Sign in to save events." };

        await connectToDatabase();

        const existing = await Watchlist.findOne({ clerkId: userId, eventId });

        if (existing) {
            await Watchlist.deleteOne({ _id: existing._id });
            return { saved: false };
        } else {
            await Watchlist.create({ clerkId: userId, eventId });
            return { saved: true };
        }
    } catch (error) {
        console.error("[toggleWatchlist]", error);
        return { saved: false, error: "Failed to update watchlist." };
    }
};

// Check if current user has saved a specific event
export const isEventSaved = async (eventId: string): Promise<boolean> => {
    try {
        const { userId } = await auth();
        if (!userId) return false;

        await connectToDatabase();

        const existing = await Watchlist.findOne({ clerkId: userId, eventId });
        return !!existing;
    } catch {
        return false;
    }
};

// Get all saved events for the current user (for dashboard)
export const getSavedEvents = async () => {
    await connection();
    try {
        const { userId } = await auth();
        if (!userId) return [];

        await connectToDatabase();

        const saved = await Watchlist.find({ clerkId: userId })
            .populate({
                path: "eventId",
                select: "title date time location slug startAtUTC timezone image mode description price",
            })
            .sort({ createdAt: -1 });               

        // Filter out any orphaned saves where the event was deleted
        return JSON.parse(
            JSON.stringify(saved.filter((w) => w.eventId !== null))
        );
    } catch (error) {
        console.error("[getSavedEvents]", error);
        return [];
    }
};