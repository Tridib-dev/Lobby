import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { Event } from "@/database/event.model";
import connectToDatabase from "@/lib/mongodb";
import { confirmPaidRegistration } from "@/lib/registration-inventory";
import { rupeesToPaise } from "@/lib/payments/money";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

/** Reconciles capped registrations if the browser closes before /verify completes. */
export async function POST(request: NextRequest) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = request.headers.get("x-razorpay-signature");
  const rawBody = await request.text();
  if (!secret || !signature) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (received.length !== expectedBuffer.length || !crypto.timingSafeEqual(received, expectedBuffer)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    const body = JSON.parse(rawBody) as { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; status?: string } } } };
    if (body.event !== "payment.captured") return NextResponse.json({ ok: true, ignored: true });
    const payment = body.payload?.payment?.entity;
    if (!payment?.id || !payment.order_id || payment.status !== "captured") return NextResponse.json({ ok: true, ignored: true });

    const [order, paymentDetail] = await Promise.all([
      razorpay.orders.fetch(payment.order_id),
      razorpay.payments.fetch(payment.id),
    ]);
    const notes = order.notes ?? {};
    const eventId = typeof notes.eventId === "string" ? notes.eventId : "";
    const clerkId = typeof notes.clerkId === "string" ? notes.clerkId : "";
    if (!eventId || !clerkId || paymentDetail.order_id !== payment.order_id || paymentDetail.status !== "captured") {
      return NextResponse.json({ error: "Payment metadata mismatch" }, { status: 400 });
    }

    await connectToDatabase();
    const event = await Event.findById(eventId).select("capacity price title slug").lean();
    // Unlimited events retain the existing client verification path; this
    // webhook is the durable reconciliation path for capacity reservations.
    if (!event || typeof event.capacity !== "number") return NextResponse.json({ ok: true, ignored: true });
    const amountPaise = Number(order.amount);
    if (!Number.isInteger(amountPaise) || amountPaise !== rupeesToPaise(event.price ?? 0)) {
      return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
    }

    const result = await confirmPaidRegistration({
      eventId,
      clerkId,
      eventTitle: event.title,
      eventSlug: event.slug,
      amountPaise,
      razorpayOrderId: payment.order_id,
      razorpayPaymentId: payment.id,
      // The webhook is independently HMAC-authenticated; this value is not
      // used to validate the webhook, but is retained for the order record.
      razorpaySignature: signature,
    });

    if (result.status === "refund_required") {
      console.error(
        "[razorpay webhook] captured payment requires refund",
        {
          razorpayOrderId: payment.order_id,
          razorpayPaymentId: payment.id,
          orderId: result.orderId,
          eventId,
          clerkId,
        }
      );

      // The payment has been durably recorded as refund_required.
      // Returning 200 prevents Razorpay from repeatedly retrying the same
      // webhook while your team handles the refund manually.
      return NextResponse.json({
        ok: true,
        requiresRefund: true,
        orderId: result.orderId,
      });
    }

    if (result.status === "refunded") {
      return NextResponse.json({
        ok: true,
        alreadyRefunded: true,
        orderId: result.orderId,
      });
    }

    return NextResponse.json({
      ok: true,
      orderId: result.orderId,
    });
  } catch (error) {
    console.error("[razorpay webhook]", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
