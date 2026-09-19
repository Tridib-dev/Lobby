"use server";

import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/mongodb";
import { Order } from "@/database/Order.model";

// Called after Razorpay payment is verified — creates the paid order record
export const createOrder = async ({
    eventId,
    eventTitle,
    eventSlug,
    amountPaise,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
}: {
    eventId: string;
    eventTitle: string;
    eventSlug: string;
    amountPaise: number;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
}) => {
    try {
        const { userId } = await auth();
        if (!userId) throw new Error("Unauthorized");
        if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
            throw new Error("Invalid payment amount");
        }

        await connectToDatabase();

        const order = await Order.findOneAndUpdate(
            { razorpayOrderId },
            {
                clerkId: userId,
                eventId,
                eventTitle,
                eventSlug,
                amount: amountPaise,
                razorpayPaymentId,
                razorpaySignature,
                status: "paid",
            },
            { upsert: true, returnDocument: "after" }
        );

        return { success: true, order: JSON.parse(JSON.stringify(order)) };
    } catch (error) {
        console.error("[createOrder]", error);
        return { success: false, error: "Failed to save order." };
    }
};

// Check if the current user has a paid order for an event
export const hasUserPaidForEvent = async (eventId: string): Promise<boolean> => {
    try {
        const { userId } = await auth();
        if (!userId) return false;

        await connectToDatabase();

        const order = await Order.findOne({
            clerkId: userId,
            eventId,
            status: "paid",
            $or: [
                { fulfillmentStatus: "fulfilled" },
                { fulfillmentStatus: { $exists: false } },
            ],
        });

        return !!order;
    } catch {
        return false;
    }
};

// Get all paid orders for the current user (for dashboard)
export const getUserOrders = async () => {
    try {
        const { userId } = await auth();
        if (!userId) return [];

        await connectToDatabase();

        const orders = await Order.find({
            clerkId: userId,
            status: "paid",
        }).populate("eventId").sort({ createdAt: -1 });

        return JSON.parse(JSON.stringify(orders));
    } catch {
        return [];
    }
};
