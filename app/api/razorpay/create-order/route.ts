// app/api/razorpay/create-order/route.ts
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { isValidObjectId } from "mongoose";
import { Event } from "@/database/event.model";
import connectToDatabase from "@/lib/mongodb";
import { rupeesToPaise } from "@/lib/payments/money";
import {
    attachPaymentOrder,
    InventoryError,
    releasePaidRegistrationHold,
    reservePaidRegistration,
} from "@/lib/registration-inventory";



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

        const body = await req.json() as { eventId?: unknown };
        const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";

        if (!eventId || !isValidObjectId(eventId)) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        await connectToDatabase();
        const event = await Event.findById(eventId).select("price title slug capacity").lean<{
            price?: number;
            title: string;
            slug: string;
            capacity?: number;
        } | null>();
        if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

        const amountPaise = rupeesToPaise(event.price ?? 0);
        if (!amountPaise) {
            return NextResponse.json({ error: "This event does not require payment" }, { status: 400 });
        }

        let hold: Awaited<ReturnType<typeof reservePaidRegistration>> | null = null;
        try {
            if (typeof event.capacity === "number") {
                hold = await reservePaidRegistration({ eventId, clerkId: userId });
            }
        } catch (error) {
            if (error instanceof InventoryError) {
                const status = error.reason === "not_found" ? 404 : 409;
                const messages = {
                    sold_out: "This event is sold out",
                    already_registered: "You already have a registration for this event",
                    not_found: "Event not found",
                    hold_expired: "Your previous checkout hold expired. Please try again",
                };
                return NextResponse.json({ error: messages[error.reason] }, { status });
            }
            throw error;
        }

        let order;

        try {
            // Reuse the order already attached to the active registration hold.
            if (hold?.razorpayOrderId) {
                order = await razorpay.orders.fetch(hold.razorpayOrderId);

                if (
                    order.amount !== amountPaise ||
                    order.currency !== "INR"
                ) {
                    throw new Error("Attached Razorpay order does not match the registration");
                }
            }

            // If the hold has a receipt but no attached order, recover an order
            // that may have been created before the server crashed or the DB
            // attachment failed.
            if (hold && !order && hold.razorpayReceipt) {
                const existingOrders = await razorpay.orders.all({
                    receipt: hold.razorpayReceipt,
                    count: 1,
                });

                const existingOrder = existingOrders.items?.[0];

                if (existingOrder) {
                    if (
                        existingOrder.amount !== amountPaise ||
                        existingOrder.currency !== "INR" ||
                        existingOrder.receipt !== hold.razorpayReceipt
                    ) {
                        throw new Error("Recovered Razorpay order does not match the registration");
                    }

                    order = await razorpay.orders.fetch(existingOrder.id);
                }
            }

            // No existing order could be recovered, so create the first order
            // for this payment hold using its persistent unique receipt.
            if (!order) {
                const receipt = hold?.razorpayReceipt
                    ?? `rcpt_${Date.now().toString().slice(-10)}`;

                try {
                    order = await razorpay.orders.create({
                        amount: amountPaise,
                        currency: "INR",
                        receipt,
                        notes: {
                            eventId,
                            eventTitle: event.title,
                            eventSlug: event.slug,
                            clerkId: userId,
                            ...(hold ? { registrationId: hold.registrationId } : {}),
                            amountPaise: String(amountPaise),
                        },
                    });
                } catch (createError) {
                    // The request may have reached Razorpay even if this server
                    // received an error. Try to recover the order by receipt.
                    if (hold?.razorpayReceipt) {
                        const recoveredOrders = await razorpay.orders.all({
                            receipt: hold.razorpayReceipt,
                            count: 1,
                        });

                        const recoveredOrder = recoveredOrders.items?.[0];

                        if (recoveredOrder) {
                            if (
                                recoveredOrder.amount !== amountPaise ||
                                recoveredOrder.currency !== "INR" ||
                                recoveredOrder.receipt !== hold.razorpayReceipt
                            ) {
                                throw createError;
                            }

                            order = await razorpay.orders.fetch(recoveredOrder.id);
                        } else {
                            throw createError;
                        }
                    } else {
                        throw createError;
                    }
                }
            }

            if (hold) {
                const attached = await attachPaymentOrder({
                    registrationId: hold.registrationId,
                    eventId,
                    clerkId: userId,
                    razorpayOrderId: order.id,
                });

                // Another request may have attached an order first.
                if (attached.orderId !== order.id) {
                    order = await razorpay.orders.fetch(attached.orderId);
                }
            }
        } catch (error) {
            // Keep the hold if an order may still be payable in an open checkout.
            if (hold && !hold.razorpayOrderId && !order) {
                await releasePaidRegistrationHold({
                    eventId,
                    clerkId: userId,
                    registrationId: hold.registrationId,
                });
            }

            throw error;
        }

        return NextResponse.json({
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            holdExpiresAt: hold?.expiresAt.toISOString() ?? null,
        });
    } catch (error) {
        console.error("[Razorpay create-order]", error);
        return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
    }
}
