// app/api/razorpay/verify/route.ts
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createOrder } from "@/lib/actions/order.actions";
import { sendOrderReceipt } from "@/lib/email/services/booking.email";
import { Event } from "@/database/event.model";
import connectToDatabase from "@/lib/mongodb";
import { clerkClient } from "@clerk/nextjs/server";
import Razorpay from "razorpay";
import { isValidObjectId } from "mongoose";
import { paiseToRupees, rupeesToPaise } from "@/lib/payments/money";
import { isValidEventTimezone } from "@/lib/time";

type EventEmailDoc = {
    price?: number;
    title: string;
    slug: string;
    _id: { toString(): string };
    date?: string;
    time?: string;
    location?: string;
    mode?: string;
    timezone?: string;
    startAtUTC?: string | Date;
};

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
});


export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const clerk = await clerkClient();
        const clerkUser = await clerk.users.getUser(userId);
        const userEmail = clerkUser.emailAddresses[0]?.emailAddress ?? "";


        const verificationPayload = await req.json() as {
            razorpay_order_id?: unknown;
            razorpay_payment_id?: unknown;
            razorpay_signature?: unknown;
            eventId?: unknown;
            recipientTimezone?: unknown;
        };
        const razorpay_order_id = typeof verificationPayload.razorpay_order_id === "string" ? verificationPayload.razorpay_order_id.trim() : "";
        const razorpay_payment_id = typeof verificationPayload.razorpay_payment_id === "string" ? verificationPayload.razorpay_payment_id.trim() : "";
        const razorpay_signature = typeof verificationPayload.razorpay_signature === "string" ? verificationPayload.razorpay_signature.trim() : "";
        const eventId = typeof verificationPayload.eventId === "string" ? verificationPayload.eventId.trim() : "";

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !isValidObjectId(eventId)) {
            return NextResponse.json({ error: "Invalid payment verification request" }, { status: 400 });
        }

        // Verify HMAC signature — this is the critical security step
        const signatureBody = `${razorpay_order_id}|${razorpay_payment_id}`;
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
            .update(signatureBody)
            .digest("hex");

        const expected = Buffer.from(expectedSignature, "utf8");
        const received = Buffer.from(razorpay_signature, "utf8");
        if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
            return NextResponse.json(
                { error: "Payment verification failed — invalid signature" },
                { status: 400 }
            );
        }

        await connectToDatabase();
        const eventDoc = await Event.findById(eventId)
            .select("price title slug date time location mode timezone startAtUTC")
            .lean<EventEmailDoc | null>();
        if (!eventDoc) return NextResponse.json({ error: "Event not found" }, { status: 404 });

        const razorpayOrder = await razorpay.orders.fetch(razorpay_order_id);
        const razorpayPayment = await razorpay.payments.fetch(razorpay_payment_id);
        const amountPaise = Number(razorpayOrder.amount);
        const notes = razorpayOrder.notes ?? {};
        const expectedAmountPaise = rupeesToPaise(eventDoc.price ?? 0);

        if (
            razorpayOrder.currency !== "INR" ||
            !Number.isInteger(amountPaise) ||
            amountPaise <= 0 ||
            razorpayOrder.status !== "paid" ||
            amountPaise !== expectedAmountPaise ||
            razorpayPayment.order_id !== razorpay_order_id ||
            razorpayPayment.status !== "captured" ||
            (notes.eventId && notes.eventId !== eventId) ||
            (notes.clerkId && notes.clerkId !== userId) ||
            (notes.amountPaise && Number(notes.amountPaise) !== amountPaise)
        ) {
            return NextResponse.json({ error: "Payment details could not be verified" }, { status: 400 });
        }

        const result = await createOrder({
            eventId,
            eventTitle: eventDoc.title,
            eventSlug: eventDoc.slug,
            amountPaise,
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            razorpaySignature: razorpay_signature,
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        const recipientTimezone = typeof verificationPayload.recipientTimezone === "string"
            ? verificationPayload.recipientTimezone
            : undefined;

        // Send confirmation email — a failure is contained by the email service.
        if (userEmail) {
            await sendOrderReceipt({
                to: userEmail,
                eventTitle: eventDoc.title,
                eventDate: eventDoc?.date ?? "",
                eventTime: eventDoc?.time ?? "",
                eventLocation: eventDoc?.location ?? "",
                ticketId: result.order._id.toString(),
                paymentId: razorpay_payment_id,
                amount: paiseToRupees(amountPaise),
                eventSlug: eventDoc.slug,
                mode: eventDoc?.mode,
                timezone: eventDoc?.timezone,
                startAtUTC: eventDoc?.startAtUTC instanceof Date ? eventDoc.startAtUTC.toISOString() : eventDoc?.startAtUTC,
                recipientTimezone: isValidEventTimezone(recipientTimezone) ? recipientTimezone : undefined,
            });
        }
        
        return NextResponse.json({ success: true, order: result.order });
    } catch (error) {
        console.error("[Razorpay verify]", error);
        return NextResponse.json({ error: "Verification failed" }, { status: 500 });
    }
}
