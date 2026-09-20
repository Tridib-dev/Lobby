"use server";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { auth } from "@clerk/nextjs/server";
import { cache } from "react";
import connectToDatabase from "@/lib/mongodb";
import { Booking } from "@/database/booking.model";
import { Order } from "@/database/Order.model";
import { paiseToRupees } from "@/lib/payments/money";
import { Event } from "@/database/event.model";
import { CoOrganizer } from "@/database/coOrganizer.model";
import { User } from "@/database/User.model";
import { DEFAULT_EVENT_TIMEZONE, getEventStartUTC, resolveEventSchedule } from "@/lib/time";
import { DateTime } from "luxon";
import { connection } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AttendedAnalyticsData {
    lifetime: number;
    thisYear: number;
    thisMonth: number;
    upcomingCount: number;
    nextEvent: { title: string; date: string; slug: string; time?: string; timezone?: string; startAtUTC?: string } | null;
    nextEventCountdown: string | null;
    totalSpent: number;
    avgTicketPrice: number;
    categoryBreakdown: { category: string; count: number }[];
    favoriteOrganizers: { name: string; count: number; image?: string }[];
    monthlyActivity: { month: string; count: number }[];
    modeBreakdown: { mode: string; count: number }[];
    streak: number;
}

export interface OrganizedAnalyticsData {
    totalEvents: number;
    thisMonth: number;
    thisYear: number;
    totalAttendees: number;
    avgAttendeesPerEvent: number;
    totalRevenue: number;
    avgRevenuePerAttendee: number;
    checkinRate: number;
    repeatAttendeeRate: number;
    revenueByEvent: { title: string; revenue: number; attendees: number }[];
    attendeeGrowth: { month: string; attendees: number; revenue: number }[];
    monthlyActivity: { month: string; count: number }[];
    modeBreakdown: { mode: string; count: number }[];
    funnel: { label: string; value: number; pct: number }[];
}

export interface EventAnalyticsData {
    event: {
        id: string;
        title: string;
        slug: string;
        date: string;
        time: string;
        location: string;
        category: string;
        image: string;
        price: number;
        mode: string;
        timezone: string;
        startAtUTC?: string;
        agendaCount: number;
    } | null;
    totalBookings: number;
    totalPaidOrders: number;
    totalAttendees: number;
    checkedInCount: number;
    checkinRate: number;
    totalRevenue: number;
    avgOrderValue: number;
    freeBookings: number;
    paidBookings: number;
    bookingTrend: { month: string; bookings: number; checkIns: number; revenue: number }[];
    dailyBookingTrend: { month: string; bookings: number; checkIns: number; revenue: number }[];
    weekdayHeatmap: { day: string; bookings: number }[];
    recentActivity: {
        id: string;
        kind: "booking" | "payment";
        label: string;
        bookedAt: string;
        checkedIn?: boolean;
        amount?: number;
    }[];
    reportingTimezone: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function monthKey(date: Date) {
    return date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

function monthKeyInZone(date: Date, timezone: string) {
    return DateTime.fromJSDate(date, { zone: "utc" })
        .setZone(timezone)
        .toFormat("LLL yy");
}

function dayKeyInZone(date: Date, timezone: string) {
    return DateTime.fromJSDate(date, { zone: "utc" })
        .setZone(timezone)
        .toFormat("d LLL");
}

function startOf(unit: "year" | "month") {
    const d = new Date();
    if (unit === "year") return new Date(d.getFullYear(), 0, 1);
    return new Date(d.getFullYear(), d.getMonth(), 1);
}

function humanCountdown(date: Date) {
    const diff = date.getTime() - Date.now();
    if (diff <= 0) return "started";

    const minutes = Math.max(1, Math.round(diff / 60000));
    if (minutes < 60) return `in ${minutes}m`;

    const hours = Math.round(minutes / 60);
    if (hours < 24) return `in ${hours}h`;

    const days = Math.round(hours / 24);
    return `in ${days}d`;
}

function getEventInstant(event: { date: string; time?: string; timezone?: string; startAtUTC?: string | Date }): Date {
    if (event.startAtUTC) return new Date(event.startAtUTC);
    try {
        if (event.time) return getEventStartUTC(event.date, event.time, event.timezone);
    } catch {
        // fall through to legacy behavior rather than crash the whole dashboard
    }
    return new Date(event.date);
}

function displayMode(mode: string) {
    const normalized = String(mode || "other").trim().toLowerCase();
    if (normalized === "online") return "Online";
    if (normalized === "offline") return "Offline";
    if (normalized === "hybrid") return "Hybrid";
    if (!normalized) return "Other";
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

// ─── Attended analytics ───────────────────────────────────────────────────────

export const getAttendedAnalytics = cache(async (): Promise<AttendedAnalyticsData> => {
    await connection();
    const empty: AttendedAnalyticsData = {
        lifetime: 0, thisYear: 0, thisMonth: 0, upcomingCount: 0,
        nextEvent: null, nextEventCountdown: null, totalSpent: 0, avgTicketPrice: 0,
        categoryBreakdown: [], favoriteOrganizers: [],
        monthlyActivity: [], modeBreakdown: [], streak: 0,
    };

    try {
        const { userId } = await auth();
        if (!userId) return empty;

        await connectToDatabase();

        const [bookings, orders] = await Promise.all([
            Booking.find({ clerkId: userId }).populate("eventId").lean(),
            Order.find({ clerkId: userId, status: "paid" }).populate("eventId").lean(),
        ]);

        const now = new Date();
        const yearStart = startOf("year");
        const monthStart = startOf("month");

        // All attended event docs
        const allEvents: any[] = [
            ...(bookings as any[]).map((b) => ({ event: b.eventId, paidAmount: 0, bookedAt: b.createdAt })),
            ...(orders as any[]).map((o) => ({ event: o.eventId, paidAmount: o.amount ?? 0, bookedAt: o.createdAt })),
        ].filter((e) => e.event);

        const creatorIds = [...new Set(allEvents.map((entry) => String(entry.event.creatorClerkId ?? "")).filter(Boolean))];
        const organizerUsers = await User.find({ clerkId: { $in: creatorIds } })
            .select("clerkId firstName lastName username photo")
            .lean();
        const organizerMap = new Map(organizerUsers.map((user: any) => [
            String(user.clerkId), {
                name: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.username || "Organizer",
                image: user.photo ?? "",
            },
        ]));

        // Counts
        const lifetime = allEvents.length;
        const thisYear = allEvents.filter((e) => new Date(e.bookedAt) >= yearStart).length;
        const thisMonth = allEvents.filter((e) => new Date(e.bookedAt) >= monthStart).length;

        // Upcoming
        const upcoming = allEvents.filter((e) => getEventInstant(e.event) > now);
        const upcomingCount = upcoming.length;
        const nextEvent = upcoming.sort(
            (a, b) => getEventInstant(a.event).getTime() - getEventInstant(b.event).getTime()
        )[0]?.event ?? null;

        // Money
        const totalSpent = paiseToRupees(allEvents.reduce((s, e) => s + e.paidAmount, 0));
        const paidCount = allEvents.filter((e) => e.paidAmount > 0).length;
        const avgTicketPrice = paidCount > 0 ? Math.round(totalSpent / paidCount) : 0;

        // Category breakdown
        const catMap: Record<string, number> = {};
        allEvents.forEach((e) => {
            const cat = e.event.category ?? "Other";
            catMap[cat] = (catMap[cat] ?? 0) + 1;
        });
        const categoryBreakdown = Object.entries(catMap)
            .map(([category, count]) => ({ category, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8);

        // Favorite organizers
        const orgMap: Record<string, number> = {};
        allEvents.forEach((e) => {
            const profile = organizerMap.get(String(e.event.creatorClerkId ?? ""));
            const org = profile?.name || "Unknown organizer";
            orgMap[org] = (orgMap[org] ?? 0) + 1;
        });
        const favoriteOrganizers = Object.entries(orgMap)
            .map(([name, count]) => ({ name, count, image: organizerUsers.find((user: any) => {
                const profileName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.username || "Organizer";
                return profileName === name;
            })?.photo ?? "" }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        // Monthly activity (last 12 months)
        const monthMap: Record<string, number> = {};
        const last12Months: string[] = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            last12Months.push(monthKey(d));
            monthMap[monthKey(d)] = 0;
        }
        allEvents.forEach((e) => {
            const k = monthKey(new Date(e.bookedAt));
            if (k in monthMap) monthMap[k] += 1;
        });
        const monthlyActivity = last12Months.map((month) => ({ month, count: monthMap[month] }));

        const modeMap: Record<string, number> = {};
        allEvents.forEach((e) => {
            const mode = displayMode(e.event.mode);
            modeMap[mode] = (modeMap[mode] ?? 0) + 1;
        });
        const modeBreakdown = Object.entries(modeMap)
            .map(([mode, count]) => ({ mode, count }))
            .sort((a, b) => b.count - a.count);

        // Streak: consecutive months with at least 1 event (going backwards)
        let streak = 0;
        for (let i = monthlyActivity.length - 1; i >= 0; i--) {
            if (monthlyActivity[i].count > 0) streak++;
            else break;
        }

        return {
            lifetime, thisYear, thisMonth, upcomingCount,
            nextEvent: nextEvent
                ? {
                    title: nextEvent.title,
                    date: nextEvent.date,
                    slug: nextEvent.slug,
                    time: nextEvent.time,
                    timezone: nextEvent.timezone,
                    startAtUTC: nextEvent.startAtUTC,
                  }
                : null,
            nextEventCountdown: nextEvent ? humanCountdown(getEventInstant(nextEvent)) : null,
            totalSpent, avgTicketPrice,
            categoryBreakdown, favoriteOrganizers, monthlyActivity, modeBreakdown, streak,
        };
    } catch (err) {
        console.error("[getAttendedAnalytics]", err);
        return empty;
    }
});

// ─── Organized analytics ──────────────────────────────────────────────────────

export const getOrganizedAnalytics = cache(async (): Promise<OrganizedAnalyticsData> => {
    await connection();
    const empty: OrganizedAnalyticsData = {
        totalEvents: 0, thisMonth: 0, thisYear: 0, totalAttendees: 0, avgAttendeesPerEvent: 0,
        totalRevenue: 0, avgRevenuePerAttendee: 0, checkinRate: 0,
        repeatAttendeeRate: 0, revenueByEvent: [], attendeeGrowth: [], monthlyActivity: [], modeBreakdown: [], funnel: [],
    };

    try {
        const { userId } = await auth();
        if (!userId) return empty;

        await connectToDatabase();

        const myEvents = await Event.find({ creatorClerkId: userId }).lean() as any[];
        if (!myEvents.length) return empty;

        const eventIds = myEvents.map((e) => e._id);
        const now = new Date();
        const yearStart = startOf("year");
        const monthStart = startOf("month");
        const thisMonth = myEvents.filter((e) => getEventInstant(e) >= monthStart).length;
        const thisYear = myEvents.filter((e) => getEventInstant(e) >= yearStart).length;

        const [allBookings, allOrders] = await Promise.all([
            Booking.find({ eventId: { $in: eventIds } }).lean() as Promise<any[]>,
            Order.find({ eventId: { $in: eventIds }, status: "paid" }).lean() as Promise<any[]>,
        ]);

        const totalAttendees = allBookings.length + allOrders.length;
        const totalEvents = myEvents.length;
        const avgAttendeesPerEvent = totalEvents > 0 ? Math.round(totalAttendees / totalEvents) : 0;

        const totalRevenue = paiseToRupees(allOrders.reduce((s, o) => s + (o.amount ?? 0), 0));
        const avgRevenuePerAttendee = allOrders.length > 0
            ? Math.round(totalRevenue / allOrders.length)
            : 0;

        // Check-in rate
        const checkedInCount = allBookings.filter((b) => b.checkedIn).length;
        const checkinRate = totalAttendees > 0
            ? Math.round((checkedInCount / totalAttendees) * 100)
            : 0;

        // Repeat attendee rate (attendees who booked more than 1 of your events)
        const emailCount: Record<string, number> = {};
        [...allBookings, ...allOrders].forEach((item) => {
            const email = item.email ?? "";
            if (email) emailCount[email] = (emailCount[email] ?? 0) + 1;
        });
        const repeatCount = Object.values(emailCount).filter((c) => c > 1).length;
        const uniqueAttendees = Object.keys(emailCount).length;
        const repeatAttendeeRate = uniqueAttendees > 0
            ? Math.round((repeatCount / uniqueAttendees) * 100)
            : 0;

        // Revenue by event (top 6)
        const revenueByEventMap: Record<string, { revenue: number; attendees: number; title: string }> = {};
        myEvents.forEach((e) => {
            revenueByEventMap[e._id.toString()] = { revenue: 0, attendees: 0, title: e.title };
        });
        allOrders.forEach((o) => {
            const key = o.eventId.toString();
            if (revenueByEventMap[key]) {
                revenueByEventMap[key].revenue += paiseToRupees(o.amount ?? 0);
                revenueByEventMap[key].attendees += 1;
            }
        });
        allBookings.forEach((b) => {
            const key = b.eventId.toString();
            if (revenueByEventMap[key]) revenueByEventMap[key].attendees += 1;
        });
        const revenueByEvent = Object.values(revenueByEventMap)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 6);

        // Attendee growth (last 12 months)
        const growthMap: Record<string, { attendees: number; revenue: number }> = {};
        const last12: string[] = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const k = monthKey(d);
            last12.push(k);
            growthMap[k] = { attendees: 0, revenue: 0 };
        }
        [...allBookings, ...allOrders].forEach((item) => {
            const k = monthKey(new Date(item.createdAt));
            if (growthMap[k]) {
                growthMap[k].attendees += 1;
                if (item.amount) growthMap[k].revenue += paiseToRupees(item.amount);
            }
        });
        const attendeeGrowth = last12.map((month) => ({ month, ...growthMap[month] }));

        const monthlyMap: Record<string, number> = {};
        const last12Events: string[] = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const k = monthKey(d);
            last12Events.push(k);
            monthlyMap[k] = 0;
        }
        myEvents.forEach((event) => {
            const k = monthKey(getEventInstant(event));
            if (k in monthlyMap) monthlyMap[k] += 1;
        });
        const monthlyActivity = last12Events.map((month) => ({ month, count: monthlyMap[month] }));

        const modeMap: Record<string, number> = {};
        myEvents.forEach((event) => {
            const mode = displayMode(event.mode);
            modeMap[mode] = (modeMap[mode] ?? 0) + 1;
        });
        const modeBreakdown = Object.entries(modeMap)
            .map(([mode, count]) => ({ mode, count }))
            .sort((a, b) => b.count - a.count);

        // Funnel: total bookings → check-ins
        const funnel = [
            { label: "Registered", value: totalAttendees, pct: 100 },
            { label: "Checked in", value: checkedInCount, pct: totalAttendees > 0 ? Math.round((checkedInCount / totalAttendees) * 100) : 0 },
        ];

        return {
            totalEvents, thisMonth, thisYear, totalAttendees, avgAttendeesPerEvent,
            totalRevenue, avgRevenuePerAttendee, checkinRate,
            repeatAttendeeRate, revenueByEvent, attendeeGrowth, monthlyActivity, modeBreakdown, funnel,
        };
    } catch (err) {
        console.error("[getOrganizedAnalytics]", err);
        return empty;
    }
});

// ─── Event analytics ─────────────────────────────────────────────────────────

export const getEventAnalytics = cache(async (eventId: string): Promise<EventAnalyticsData> => {
    await connection();
    const empty: EventAnalyticsData = {
        event: null,
        totalBookings: 0,
        totalPaidOrders: 0,
        totalAttendees: 0,
        checkedInCount: 0,
        checkinRate: 0,
        totalRevenue: 0,
        avgOrderValue: 0,
        freeBookings: 0,
        paidBookings: 0,
        bookingTrend: [],
        dailyBookingTrend: [],
        weekdayHeatmap: [],
        recentActivity: [],
        reportingTimezone: DEFAULT_EVENT_TIMEZONE,
    };

    try {
        const { userId } = await auth();
        if (!userId) return empty;

        await connectToDatabase();

        const event = await Event.findById(eventId).lean() as any | null;
        if (!event) return empty;

        const isCreator = event.creatorClerkId === userId;
        const hasAccess = isCreator
            || Boolean(await CoOrganizer.exists({ eventId, clerkId: userId }));

        if (!hasAccess) return empty;

        const [bookings, orders] = await Promise.all([
            Booking.find({ eventId }).sort({ createdAt: -1 }).lean() as Promise<any[]>,
            Order.find({ eventId, status: "paid" }).sort({ createdAt: -1 }).lean() as Promise<any[]>,
        ]);

        const totalBookings = bookings.length;
        const totalPaidOrders = orders.length;
        const totalAttendees = totalBookings + totalPaidOrders;
        const checkedInCount = bookings.filter((booking) => booking.checkedIn).length;
        const checkinRate = totalAttendees > 0
            ? Math.round((checkedInCount / totalAttendees) * 100)
            : 0;
        const totalRevenue = paiseToRupees(orders.reduce((sum, order) => sum + (order.amount ?? 0), 0));
        const avgOrderValue = totalPaidOrders > 0
            ? Math.round(totalRevenue / totalPaidOrders)
            : 0;

        const reportingTimezone = resolveEventSchedule({
            date: event.date,
            time: event.time,
            timezone: event.timezone,
            startAtUTC: event.startAtUTC,
            mode: event.mode,
        }).timezone;
        const timelineMap: Record<string, { bookings: number; checkIns: number; revenue: number }> = {};
        const last12: string[] = [];
        const now = DateTime.now().setZone(reportingTimezone);
        for (let i = 11; i >= 0; i--) {
            const d = now.startOf("month").minus({ months: i });
            const key = monthKeyInZone(d.toJSDate(), reportingTimezone);
            last12.push(key);
            timelineMap[key] = { bookings: 0, checkIns: 0, revenue: 0 };
        }

        bookings.forEach((booking) => {
            const key = monthKeyInZone(new Date(booking.createdAt), reportingTimezone);
            if (timelineMap[key]) {
                timelineMap[key].bookings += 1;
                if (booking.checkedIn) timelineMap[key].checkIns += 1;
            }
        });

        orders.forEach((order) => {
            const key = monthKeyInZone(new Date(order.createdAt), reportingTimezone);
            if (timelineMap[key]) {
                timelineMap[key].bookings += 1;
                timelineMap[key].revenue += paiseToRupees(order.amount ?? 0);
            }
        });

        const bookingTrend = last12.map((month) => ({
            month,
            ...timelineMap[month],
        }));

        const dailyTimelineMap: Record<string, { bookings: number; checkIns: number; revenue: number }> = {};
        const last14: string[] = [];
        for (let i = 13; i >= 0; i -= 1) {
            const d = now.startOf("day").minus({ days: i });
            const key = dayKeyInZone(d.toJSDate(), reportingTimezone);
            last14.push(key);
            dailyTimelineMap[key] = { bookings: 0, checkIns: 0, revenue: 0 };
        }

        bookings.forEach((booking) => {
            const key = dayKeyInZone(new Date(booking.createdAt), reportingTimezone);
            if (dailyTimelineMap[key]) {
                dailyTimelineMap[key].bookings += 1;
                if (booking.checkedIn) dailyTimelineMap[key].checkIns += 1;
            }
        });

        orders.forEach((order) => {
            const key = dayKeyInZone(new Date(order.createdAt), reportingTimezone);
            if (dailyTimelineMap[key]) {
                dailyTimelineMap[key].bookings += 1;
                dailyTimelineMap[key].revenue += paiseToRupees(order.amount ?? 0);
            }
        });

        const dailyBookingTrend = last14.map((day) => ({
            month: day,
            ...dailyTimelineMap[day],
        }));

        const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const weekdayMap = weekdayNames.reduce<Record<string, number>>((acc, day) => {
            acc[day] = 0;
            return acc;
        }, {});

        [...bookings, ...orders].forEach((entry) => {
            const day = DateTime.fromJSDate(new Date(entry.createdAt), { zone: "utc" })
                .setZone(reportingTimezone)
                .toFormat("ccc");
            weekdayMap[day] += 1;
        });

        const weekdayHeatmap = weekdayNames.map((day) => ({
            day,
            bookings: weekdayMap[day],
        }));

        const recentActivity = [
            ...bookings.slice(0, 4).map((booking) => ({
                id: booking._id.toString(),
                kind: "booking" as const,
                label: booking.checkedIn ? "Checked in booking" : "Free booking",
                bookedAt: booking.createdAt,
                checkedIn: booking.checkedIn,
            })),
            ...orders.slice(0, 4).map((order) => ({
                id: order._id.toString(),
                kind: "payment" as const,
                label: "Paid order",
                bookedAt: order.createdAt,
                amount: paiseToRupees(order.amount ?? 0),
            })),
        ]
            .sort((a, b) => new Date(b.bookedAt).getTime() - new Date(a.bookedAt).getTime())
            .slice(0, 8);

        return {
            event: {
                id: event._id.toString(),
                title: event.title,
                slug: event.slug,
                date: event.date,
                time: event.time,
                location: event.location,
                category: event.category,
                image: event.image,
                price: event.price ?? 0,
                mode: event.mode,
                timezone: reportingTimezone,
                startAtUTC: event.startAtUTC
                    ? new Date(event.startAtUTC).toISOString()
                    : resolveEventSchedule({
                        date: event.date,
                        time: event.time,
                        timezone: event.timezone,
                        mode: event.mode,
                    }).instant.toISOString(),
                agendaCount: Array.isArray(event.agenda) ? event.agenda.length : 0,
            },
            totalBookings,
            totalPaidOrders,
            totalAttendees,
            checkedInCount,
            checkinRate,
            totalRevenue,
            avgOrderValue,
            freeBookings: totalBookings,
            paidBookings: totalPaidOrders,
            bookingTrend,
            dailyBookingTrend,
            weekdayHeatmap,
            recentActivity,
            reportingTimezone,
        };
    } catch (err) {
        console.error("[getEventAnalytics]", err);
        return empty;
    }
});
