"use server";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { auth, clerkClient } from "@clerk/nextjs/server";
import { cache } from "react";
import connectToDatabase from "@/lib/mongodb";
import { Booking } from "@/database/booking.model";
import { Order } from "@/database/Order.model";
import { paiseToRupees } from "@/lib/payments/money";
import { Watchlist } from "@/database/watchlist.model";
import { User } from "@/database/User.model";
import { Event } from "@/database/event.model";
import { CoOrganizer } from "@/database/coOrganizer.model";
import { getEventStartUTC } from "../time";
import { connection } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TicketItem {
    id: string;
    type: "free" | "paid";
    eventId: string;
    eventTitle: string;
    username: string;
    eventCategory?: string;
    eventSlug: string;
    eventImage: string;
    eventDate: string;
    eventTime: string;
    eventLocation: string;
    eventMode: string;
    eventOrganizer: string;
    eventOrganizerImage?: string;
    price: number;
    bookedAt: string;
    checkedIn: boolean;
    status: "upcoming" | "past" | "expired";
    startAtUTC?: string;
    timezone?: string;
}

export interface PaymentIssueItem {
    id: string;
    eventTitle: string;
    amount: number;
    status: "refund_required" | "refunded";
    createdAt: string;
    refundedAt?: string;
}

export interface UserStats {
    attended: number;
    organized: number;
    saved: number;
    totalSpent: number;
}

export interface OrganizedEventItem {
    id: string;
    title: string;
    slug: string;
    image: string;
    date: string;
    time: string;
    location: string;
    organizer: string;
    organizerImage?: string;
    mode: string;
    price: number;
    status: "upcoming" | "past";
    attendeeCount: number;
    revenue: number;
    startAtUTC?: string;
    timezone?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type OrganizerProfile = {
    name: string;
    image: string;
};

async function getOrganizerProfiles(events: any[]): Promise<Map<string, OrganizerProfile>> {
    const creatorIds = [...new Set(events.map((event) => String(event.creatorClerkId ?? "")).filter(Boolean))];
    if (!creatorIds.length) return new Map();

    const users = await User.find({ clerkId: { $in: creatorIds } })
        .select("clerkId firstName lastName username photo")
        .lean();

    return new Map(users.map((user: any) => {
        const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.username || "Organizer";
        return [String(user.clerkId), { name, image: user.photo ?? "" }];
    }));
}

function organizerForEvent(event: any, profiles: Map<string, OrganizerProfile>): OrganizerProfile {
    return profiles.get(String(event.creatorClerkId ?? "")) ?? {
        // Do not expose the legacy free-text organizer field here: older records
        // may contain the event description instead of the creator identity.
        name: "Organizer",
        image: "",
    };
}

function categorize(
    event: { date: string; time: string; timezone?: string; startAtUTC?: string | Date }
): "upcoming" | "past" | "expired" {
    const instant = event.startAtUTC
        ? new Date(event.startAtUTC)
        : getEventStartUTC(event.date, event.time, event.timezone);
    const now = new Date();
    const diffDays = (now.getTime() - instant.getTime()) / (1000 * 60 * 60 * 24);

    if (instant > now) return "upcoming";
    if (diffDays <= 30) return "past";
    return "expired";
}

// ─── getUserTickets ────────────────────────────────────────────────────────────
// Merges free bookings + paid orders into one unified ticket list

export const getUserTickets = cache(async (): Promise<TicketItem[]> => {
    await connection();
    try {
        const { userId } = await auth();
        if (!userId) return [];

        await connectToDatabase();

        // Fetch both in parallel
        const [bookings, orders, user] = await Promise.all([
            Booking.find({ clerkId: userId }).populate("eventId").lean(),
            Order.find({
                clerkId: userId,
                status: "paid",
                $or: [
                    { fulfillmentStatus: "fulfilled" },
                    { fulfillmentStatus: { $exists: false } },
                ],
            }).populate("eventId").lean(),
            User.findOne({ clerkId: userId }).select("username").lean(),
        ]);
        const username = (user as any)?.username ?? "";
        const ticketEvents = [
            ...(bookings as any[]).map((booking) => booking.eventId),
            ...(orders as any[]).map((order) => order.eventId),
        ].filter(Boolean);
        const organizerProfiles = await getOrganizerProfiles(ticketEvents);

        const tickets: TicketItem[] = [];

        // Free bookings
        for (const b of bookings) {
            const ev = b.eventId as any;
            if (!ev) continue;
            const organizer = organizerForEvent(ev, organizerProfiles);
            tickets.push({
                id: b._id.toString(),
                type: "free",
                eventId: ev._id.toString(),
                username,
                eventCategory: ev.category,
                eventTitle: ev.title,
                eventSlug: ev.slug,
                eventImage: ev.image,
                eventDate: ev.date,
                eventTime: ev.time,
                eventLocation: ev.location,
                eventMode: ev.mode,
                eventOrganizer: organizer.name,
                eventOrganizerImage: organizer.image,
                price: 0,
                bookedAt: (b as any).createdAt,
                checkedIn: (b as any).checkedIn ?? false,
                startAtUTC: ev.startAtUTC?.toISOString(),
                timezone: ev.timezone,
                status: categorize({
                    date: ev.date,
                    time: ev.time,
                    timezone: ev.timezone,
                    startAtUTC: ev.startAtUTC,
                }),
            });
        }

        // Paid orders
        for (const o of orders) {
            const ev = o.eventId as any;
            if (!ev) continue;
            const organizer = organizerForEvent(ev, organizerProfiles);
            tickets.push({
                id: o._id.toString(),
                type: "paid",
                eventId: ev._id.toString(),
                username,
                eventCategory: ev.category,
                eventTitle: ev.title,
                eventSlug: ev.slug,
                eventImage: ev.image,
                eventDate: ev.date,
                eventTime: ev.time,
                eventLocation: ev.location,
                eventMode: ev.mode,
                eventOrganizer: organizer.name,
                eventOrganizerImage: organizer.image,
                price: paiseToRupees(o.amount),
                bookedAt: (o as any).createdAt,
                checkedIn: false,
                startAtUTC: ev.startAtUTC?.toISOString(),
                timezone: ev.timezone,
                status: categorize({
                    date: ev.date,
                    time: ev.time,
                    timezone: ev.timezone,
                    startAtUTC: ev.startAtUTC,
                }),
            });
        }

        // Sort: upcoming first, then by event date
        return tickets.sort((a, b) => {
            const order = { upcoming: 0, past: 1, expired: 2 };
            if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
            return new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime();
        });
    } catch (error) {
        console.error("[getUserTickets]", error);
        return [];
    }
});

export const getUserPaymentIssues = cache(async (): Promise<PaymentIssueItem[]> => {
    await connection();
    try {
        const { userId } = await auth();
        if (!userId) return [];

        await connectToDatabase();

        const orders = await Order.find({
            clerkId: userId,
            status: "paid",
            fulfillmentStatus: { $in: ["refund_required", "refunded"] },
        })
            .populate("eventId", "title")
            .sort({ createdAt: -1 })
            .lean();

        return orders.map((order: any) => ({
            id: order._id.toString(),
            eventTitle: order.eventId?.title ?? order.eventTitle,
            amount: paiseToRupees(order.amount),
            status: order.fulfillmentStatus,
            createdAt: order.createdAt,
            refundedAt: order.refundedAt,
        }));
    } catch (error) {
        console.error("[getUserPaymentIssues]", error);
        return [];
    }
});

// ─── getUserStats ──────────────────────────────────────────────────────────────

export const getUserStats = cache(async (): Promise<UserStats> => {
    await connection();
    try {
        const { userId } = await auth();
        if (!userId) return { attended: 0, organized: 0, saved: 0, totalSpent: 0 };

        await connectToDatabase();

        const [bookingCount, orders, savedCount, user] = await Promise.all([
            Booking.countDocuments({ clerkId: userId }),
            Order.find({ clerkId: userId, status: "paid" }).select("amount").lean(),
            Watchlist.countDocuments({ clerkId: userId }),
            User.findOne({ clerkId: userId }).select("eventsHostedCount").lean(),
        ]);

        return {
            attended: bookingCount + orders.length,
            organized: (user as any)?.eventsHostedCount ?? 0,
            saved: savedCount,
            totalSpent: paiseToRupees(orders.reduce((sum, o) => sum + ((o as any).amount ?? 0), 0)),
        };
    } catch (error) {
        console.error("[getUserStats]", error);
        return { attended: 0, organized: 0, saved: 0, totalSpent: 0 };
    }
});

function organizedEventStatus(
    event: { date: string; time: string; timezone?: string; startAtUTC?: string | Date }
): "upcoming" | "past" {
    return categorize(event) === "upcoming" ? "upcoming" : "past";
}

async function buildOrganizedEventItems(events: any[]): Promise<OrganizedEventItem[]> {
    if (!events.length) return [];

    const organizerProfiles = await getOrganizerProfiles(events);

    const eventIds = events.map((e) => e._id);

    const [bookingCounts, orderAggs] = await Promise.all([
        Booking.aggregate([
            { $match: { eventId: { $in: eventIds } } },
            { $group: { _id: "$eventId", count: { $sum: 1 } } },
        ]),
        Order.aggregate([
            { $match: { eventId: { $in: eventIds }, status: "paid" } },
            { $group: { _id: "$eventId", revenue: { $sum: "$amount" }, count: { $sum: 1 } } },
        ]),
    ]);

    const bookingMap = Object.fromEntries(
        bookingCounts.map((b: any) => [b._id.toString(), b.count])
    );
    const orderMap = Object.fromEntries(
        orderAggs.map((o: any) => [o._id.toString(), { revenue: o.revenue, count: o.count }])
    );

    return events.map((ev: any) => {
        const id = ev._id.toString();
        const freeCount = bookingMap[id] ?? 0;
        const paidData = orderMap[id] ?? { revenue: 0, count: 0 };
        const organizer = organizerForEvent(ev, organizerProfiles);

        return {
            id,
            title: ev.title,
            slug: ev.slug,
            image: ev.image,
            date: ev.date,
            time: ev.time,
            location: ev.location,
            organizer: organizer.name,
            organizerImage: organizer.image,
            mode: ev.mode,
            price: ev.price ?? 0,
            status: organizedEventStatus({
                    date: ev.date,
                    time: ev.time,
                    timezone: ev.timezone,
                    startAtUTC: ev.startAtUTC,
                }),
            attendeeCount: freeCount + paidData.count,
            // Order.amount is stored as integer paise; dashboard event values are displayed in rupees.
            revenue: paiseToRupees(paidData.revenue),
            startAtUTC: ev.startAtUTC?.toISOString(),
            timezone: ev.timezone,
        };
    });
}

// ─── getOrganizedEvents ────────────────────────────────────────────────────────

export const getOrganizedEvents = cache(async (): Promise<OrganizedEventItem[]> => {
    await connection();
    try {
        const { userId } = await auth();
        if (!userId) return [];

        await connectToDatabase();

        const events = await Event.find({ creatorClerkId: userId })
            .sort({ date: -1 })
            .lean();

        return buildOrganizedEventItems(events);
    } catch (error) {
        console.error("[getOrganizedEvents]", error);
        return [];
    }
});

// ─── getCoOrganizedEvents ──────────────────────────────────────────────────────

export const getCoOrganizedEvents = cache(async (): Promise<OrganizedEventItem[]> => {
    await connection();
    try {
        const { userId } = await auth();
        if (!userId) return [];

        await connectToDatabase();

        const coOrganizerEntries = await CoOrganizer.find({ clerkId: userId })
            .select("eventId")
            .lean();

        if (!coOrganizerEntries.length) return [];

        const eventIds = coOrganizerEntries.map((entry) => entry.eventId.toString());

        const events = await Event.find({
            _id: { $in: eventIds },
            creatorClerkId: { $ne: userId },
        })
            .sort({ date: -1 })
            .lean();

        return buildOrganizedEventItems(events);
    } catch (error) {
        console.error("[getCoOrganizedEvents]", error);
        return [];
    }
});

// ─── updateUserProfile ─────────────────────────────────────────────────────────

export const updateUserProfile = async (data: {
    firstName: string;
    lastName: string;
}) => {
    try {
        const { userId } = await auth();
        if (!userId) return { success: false, error: "Unauthorized" };

        await connectToDatabase();
        const client = await clerkClient();

        await Promise.all([
            client.users.updateUser(userId, {
                firstName: data.firstName,
                lastName: data.lastName,
            }),
            User.findOneAndUpdate({ clerkId: userId }, { $set: data }),
        ]);

        return { success: true };
    } catch (error) {
        console.error("[updateUserProfile]", error);
        return { success: false, error: "Failed to update profile." };
    }
};

// ─── updateUserSettings ───────────────────────────────────────────────────────

export const updateUserSettings = async (data: {
    publicMetadata: Record<string, unknown>;
}) => {
    try {
        const { userId } = await auth();
        if (!userId) return { success: false, error: "Unauthorized" };

        const client = await clerkClient();
        await client.users.updateUserMetadata(userId, {
            publicMetadata: data.publicMetadata,
        });

        return { success: true };
    } catch (error) {
        console.error("[updateUserSettings]", error);
        return { success: false, error: "Failed to save settings." };
    }
};
