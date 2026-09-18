'use server';

import { Types } from "mongoose";
import { auth, currentUser } from "@clerk/nextjs/server";
import connectToDatabase from "../mongodb";
import { Booking } from "@/database/booking.model";
import { Order } from "@/database/Order.model";
import { Event } from "@/database/event.model";
import { sendBookingConfirmation } from "@/lib/email/services/booking.email";
import { isValidEventTimezone } from "@/lib/time";
import { createFreeRegistration, InventoryError } from "@/lib/registration-inventory";

type EventEmailDoc = {
    title?: string;
    date?: string;
    time?: string;
    location?: string;
    slug?: string;
    mode?: string;
    timezone?: string;
    startAtUTC?: string | Date;
};

// ─── Create Booking ───────────────────────────────────────────────────────────
// No longer accepts email as a param — pulls identity from the active
// Clerk session so a user can only book as themselves.

export const CreateBooking = async ({
    eventId,
    slug,
    recipientTimezone,
}: {
    eventId: string;
    slug: string;
    recipientTimezone?: string;
}) => {
    try {
        const { userId } = await auth();
        if (!userId) {
            return { success: false, error: "You must be signed in to book an event." };
        }

        // Pull the verified email directly from Clerk — no trusting client input
        const user = await currentUser();
        const email = user?.emailAddresses?.[0]?.emailAddress;

        if (!email) {
            return { success: false, error: "No email address found on your account." };
        }

        await connectToDatabase();

        const { bookingId } = await createFreeRegistration({
            clerkId: userId,
            eventId,
            slug,
            email: email.toLowerCase().trim(),
        });
        
        // Fetch event details for email — fire and forget, never blocks booking
        const eventDoc = await Event.findById(eventId)
            .select("title date time location slug mode startAtUTC timezone")
            .lean<EventEmailDoc>();
        
        await sendBookingConfirmation({
            to: email,
            eventTitle: eventDoc?.title ?? "Your Event",
            eventDate: eventDoc?.date ?? "",
            eventTime: eventDoc?.time ?? "",
            eventLocation: eventDoc?.location ?? "",
            ticketId: bookingId,
            price: 0,
            eventSlug: eventDoc?.slug ?? slug,
            mode: eventDoc?.mode,
            timezone: eventDoc?.timezone,
            startAtUTC: eventDoc?.startAtUTC instanceof Date ? eventDoc.startAtUTC.toISOString() : eventDoc?.startAtUTC,
            recipientTimezone: isValidEventTimezone(recipientTimezone) ? recipientTimezone : undefined,
        });
        
        return { success: true };
    } catch (error: unknown) {
        if (error instanceof InventoryError) {
            const errors = {
                sold_out: "This event is sold out.",
                already_registered: "You've already booked this event.",
                not_found: "This event is no longer available.",
                hold_expired: "Your reservation expired. Please try again.",
            };
            return { success: false, error: errors[error.reason] };
        }
        const bookingError = error as { code?: number };
        if (bookingError.code === 11000) {
            return {
                success: false,
                error: "You've already booked this event.",
            };
        }
        console.error("Booking Creation Failed", error);
        return { success: false, error: "Failed to create booking." };
    }
};

// ─── Attendee Count ───────────────────────────────────────────────────────────

export const getAttendeesCount = async (eventId: string): Promise<number> => {
    try {
        await connectToDatabase();
        if (!Types.ObjectId.isValid(eventId)) return 0;

        // Older records may store eventId as a string while newer records use
        // an ObjectId. Raw collection queries preserve both representations.
        const eventReferences = [eventId, new Types.ObjectId(eventId)];

        // Free registrations are bookings and paid registrations are orders.
        // Checked-in status must not reduce this registration total.
        const [freeBookings, paidOrders] = await Promise.all([
            Booking.collection.countDocuments({ eventId: { $in: eventReferences } }),
            Order.collection.countDocuments({
                eventId: { $in: eventReferences },
                $or: [
                    { status: "paid" },
                    { razorpayPaymentId: { $exists: true, $nin: [null, ""] } },
                ],
            }),
        ]);

        return freeBookings + paidOrders;
    } catch (error) {
        console.error("Failed to get attendees count:", error);
        return 0;
    }
};

// ─── Check if current user has booked ────────────────────────────────────────
// Replaces the old email-based check — uses clerkId from session instead.

export const hasUserBookedEvent = async (eventId: string): Promise<boolean> => {
    try {
        const { userId } = await auth();
        if (!userId) return false;

        await connectToDatabase();

        const booking = await Booking.findOne({ clerkId: userId, eventId });
        return !!booking;
    } catch (error) {
        console.error("Failed to check booking status:", error);
        return false;
    }
};

// ─── Get all bookings for current user ───────────────────────────────────────

export const getUserBookings = async () => {
    try {
        const { userId } = await auth();
        if (!userId) return [];

        await connectToDatabase();

        const bookings = await Booking.find({ clerkId: userId })
            .populate("eventId")
            .sort({ createdAt: -1 });

        return JSON.parse(JSON.stringify(bookings));
    } catch (error) {
        console.error("Failed to get user bookings:", error);
        return [];
    }
};
