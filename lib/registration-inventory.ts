import { ClientSession, Types } from "mongoose";
import connectToDatabase from "@/lib/mongodb";
import { Event } from "@/database/event.model";
import { Booking } from "@/database/booking.model";
import { Order } from "@/database/Order.model";
import EventRegistration from "@/database/event-registration.model";
export { calculateAvailability } from "@/lib/capacity";
import crypto from "crypto";


export const PAYMENT_HOLD_MS = 10 * 60 * 1000;

export type InventoryFailure = "not_found" | "sold_out" | "already_registered" | "hold_expired";

export class InventoryError extends Error {
  constructor(public readonly reason: InventoryFailure) {
    super(reason);
  }
}

const availabilityFilter = (eventId: string) => ({
  _id: eventId,
  $or: [
    { capacity: { $exists: false } },
    { capacity: null },
    {
      $expr: {
        $lt: [
          { $add: [{ $ifNull: ["$confirmedRegistrationCount", 0] }, { $ifNull: ["$reservedRegistrationCount", 0] }] },
          "$capacity",
        ],
      },
    },
  ],
});

async function releaseExpiredHolds(eventId: string, session: ClientSession, now = new Date()) {
  const holds = await EventRegistration.find({ eventId, state: "payment_hold", expiresAt: { $lte: now } })
    .session(session)
    .select("_id")
    .lean();
  if (!holds.length) return 0;

  await EventRegistration.updateMany(
    { _id: { $in: holds.map((hold) => hold._id) }, state: "payment_hold" },
    { $set: { state: "expired" }, $unset: { expiresAt: 1 } },
    { session }
  );
  await Event.updateOne(
    { _id: eventId },
    { $inc: { reservedRegistrationCount: -holds.length } },
    { session }
  );
  return holds.length;
}

/** Run from a protected scheduler so abandoned payment windows cannot lock seats. */
export async function releaseExpiredPaymentHolds() {
  const db = await connectToDatabase();
  const eventIds = await EventRegistration.distinct("eventId", {
    state: "payment_hold",
    expiresAt: { $lte: new Date() },
  });

  let released = 0;

  for (const eventId of eventIds) {
    const session = await db.startSession();

    try {
      const eventReleased = await session.withTransaction(() =>
        releaseExpiredHolds(eventId.toString(), session)
      );

      released += eventReleased ?? 0;
    } finally {
      await session.endSession();
    }
  }

  return {
    released,
    eventsProcessed: eventIds.length,
  };
}

async function hasLegacyRegistration(eventId: string, clerkId: string, session: ClientSession) {
  const [booking, paidOrder] = await Promise.all([
    Booking.exists({ eventId, clerkId }).session(session),
    Order.exists({
      eventId,
      clerkId,
      status: "paid",
      $or: [
          { fulfillmentStatus: "fulfilled" },
          { fulfillmentStatus: { $exists: false } },
      ],
    }).session(session)
  ]);
  return Boolean(booking || paidOrder);
}

export async function createFreeRegistration(input: {
  eventId: string;
  clerkId: string;
  email: string;
  slug: string;
}) {
  if (!Types.ObjectId.isValid(input.eventId)) throw new InventoryError("not_found");
  const db = await connectToDatabase();
  // Preserve the established path for unlimited/legacy events. Inventory
  // transactions only apply after an organizer opts into a confihard cap.
  const event = await Event.findById(input.eventId).select("capacity").lean();
  if (!event) throw new InventoryError("not_found");
  if (typeof event.capacity !== "number") {
    const booking = await Booking.create({ clerkId: input.clerkId, eventId: input.eventId, slug: input.slug, email: input.email });
    return { bookingId: booking._id.toString() };
  }
  const session = await db.startSession();
  try {
    let bookingId = "";
    await session.withTransaction(async () => {
      await releaseExpiredHolds(input.eventId, session);
      if (await hasLegacyRegistration(input.eventId, input.clerkId, session)) {
        throw new InventoryError("already_registered");
      }

      const existing = await EventRegistration.findOne({ eventId: input.eventId, clerkId: input.clerkId }).session(session);
      if (existing && ["free_confirmed", "paid_confirmed", "payment_hold"].includes(existing.state)) {
        throw new InventoryError("already_registered");
      }

      const event = await Event.findOneAndUpdate(
        availabilityFilter(input.eventId),
        { $inc: { confirmedRegistrationCount: 1 } },
        { new: true, session }
      );
      if (!event) {
        const exists = await Event.exists({ _id: input.eventId }).session(session);
        throw new InventoryError(exists ? "sold_out" : "not_found");
      }

      const booking = await Booking.create([{ clerkId: input.clerkId, eventId: input.eventId, slug: input.slug, email: input.email }], { session });
      await EventRegistration.findOneAndUpdate(
        { eventId: input.eventId, clerkId: input.clerkId },
        { $set: { state: "free_confirmed", bookingId: booking[0]._id }, $unset: { expiresAt: 1 } },
        { upsert: true, new: true, session }
      );
      bookingId = booking[0]._id.toString();
    });
    return { bookingId };
  } finally {
    await session.endSession();
  }
}

export async function reservePaidRegistration(input: { eventId: string; clerkId: string }) {
  if (!Types.ObjectId.isValid(input.eventId)) throw new InventoryError("not_found");

  const db = await connectToDatabase();
  const session = await db.startSession();

  try {
    let registrationId = "";
    let expiresAt = new Date();
    let razorpayOrderId: string | undefined;
    let razorpayReceipt: string | undefined;

    await session.withTransaction(async () => {
      await releaseExpiredHolds(input.eventId, session);

      if (await hasLegacyRegistration(input.eventId, input.clerkId, session)) {
        throw new InventoryError("already_registered");
      }

      const existing = await EventRegistration.findOne({
        eventId: input.eventId,
        clerkId: input.clerkId,
      }).session(session);

      // Reuse the existing active hold and its payment attempt.
      if (
        existing?.state === "payment_hold" &&
        existing.expiresAt &&
        existing.expiresAt > new Date()
      ) {
        registrationId = existing._id.toString();
        expiresAt = existing.expiresAt;
        razorpayOrderId = existing.razorpayOrderId;
        razorpayReceipt =
          existing.razorpayReceipt ?? `reg_${crypto.randomUUID()}`;

        // Legacy active hold that predates razorpayReceipt.
        if (!existing.razorpayReceipt) {
          await EventRegistration.updateOne(
            { _id: existing._id },
            { $set: { razorpayReceipt } },
            { session }
          );
        }

        return;
      }

      if (
        existing &&
        ["free_confirmed", "paid_confirmed"].includes(existing.state)
      ) {
        throw new InventoryError("already_registered");
      }

      const event = await Event.findOneAndUpdate(
        availabilityFilter(input.eventId),
        { $inc: { reservedRegistrationCount: 1 } },
        { new: true, session }
      );

      if (!event) {
        const exists = await Event.exists({ _id: input.eventId }).session(session);
        throw new InventoryError(exists ? "sold_out" : "not_found");
      }

      expiresAt = new Date(Date.now() + PAYMENT_HOLD_MS);
      razorpayReceipt = `reg_${crypto.randomUUID()}`;

      const registration = await EventRegistration.findOneAndUpdate(
        {
          eventId: input.eventId,
          clerkId: input.clerkId,
        },
        {
          $set: {
            state: "payment_hold",
            expiresAt,
            razorpayReceipt,
          },
          $unset: {
            razorpayOrderId: 1,
          },
        },
        {
          upsert: true,
          new: true,
          session,
        }
      );

      registrationId = registration._id.toString();
    });

    return {
      registrationId,
      expiresAt,
      razorpayOrderId,
      razorpayReceipt,
    };
  } finally {
    await session.endSession();
  }
}


export async function attachPaymentOrder(input: {
  registrationId: string;
  eventId: string;
  clerkId: string;
  razorpayOrderId: string;
}) {
  const result = await EventRegistration.updateOne(
    {
      _id: input.registrationId,
      eventId: input.eventId,
      clerkId: input.clerkId,
      state: "payment_hold",
      expiresAt: { $gt: new Date() },
      razorpayOrderId: { $exists: false },
    },
    {
      $set: {
        razorpayOrderId: input.razorpayOrderId,
      },
    }
  );

  if (result.matchedCount === 1) {
    return {
      attached: true,
      orderId: input.razorpayOrderId,
    };
  }

  // Another request may have attached an order first.
  const existing = await EventRegistration.findOne({
    _id: input.registrationId,
    eventId: input.eventId,
    clerkId: input.clerkId,
    state: "payment_hold",
    expiresAt: { $gt: new Date() },
  })
    .select("razorpayOrderId")
    .lean();

  if (existing?.razorpayOrderId) {
    return {
      attached: false,
      orderId: existing.razorpayOrderId,
    };
  }

  throw new InventoryError("hold_expired");
}
export async function releasePaidRegistrationHold(input: { eventId: string; clerkId: string; registrationId?: string }) {
  const db = await connectToDatabase();
  const session = await db.startSession();
  try {
    await session.withTransaction(async () => {
      const registration = await EventRegistration.findOneAndUpdate(
        { _id: input.registrationId, eventId: input.eventId, clerkId: input.clerkId, state: "payment_hold" },
        {
          $set: { state: "released" },
          $unset: {
            expiresAt: 1,
            razorpayReceipt: 1,
          },
        },
        { new: true, session }
      );
      if (registration) await Event.updateOne({ _id: input.eventId }, { $inc: { reservedRegistrationCount: -1 } }, { session });
    });
  } finally {
    await session.endSession();
  }
}

export async function confirmPaidRegistration(input: {
  eventId: string;
  clerkId: string;
  razorpayOrderId: string;
  eventTitle: string;
  eventSlug: string;
  amountPaise: number;
  razorpayPaymentId: string;
  razorpaySignature: string;
}) {
  const db = await connectToDatabase();
  const session = await db.startSession();

  try {
    const result = await session.withTransaction(async () => {
      const existingOrder = await Order.findOne({
        razorpayOrderId: input.razorpayOrderId,
      }).session(session);

      // Idempotency: this payment has already been recorded.
      if (existingOrder?.status === "paid") {
        if (existingOrder.fulfillmentStatus === "refund_required") {
          return {
            status: "refund_required" as const,
            orderId: existingOrder._id.toString(),
          };
        }

        if (existingOrder.fulfillmentStatus === "refunded") {
          return {
            status: "refunded" as const,
            orderId: existingOrder._id.toString(),
          };
        }

        // Includes old orders where fulfillmentStatus does not exist.
        return {
          status: "paid" as const,
          orderId: existingOrder._id.toString(),
        };
      }

      const registration = await EventRegistration.findOne({
        eventId: input.eventId,
        clerkId: input.clerkId,
        razorpayOrderId: input.razorpayOrderId,
      }).session(session);

      const now = new Date();

      /*
       * The Razorpay payment is already authenticated and captured.
       *
       * If there is no valid payment hold anymore, the payment cannot
       * be fulfilled. Record it durably as refund_required.
       */
      if (
        !registration ||
        registration.state !== "payment_hold" ||
        !registration.expiresAt ||
        registration.expiresAt <= now
      ) {
        // Release this reservation only if it is still an active
        // payment hold and this transaction successfully changes it.
        if (
          registration &&
          registration.state === "payment_hold" &&
          registration.expiresAt &&
          registration.expiresAt <= now
        ) {
          const expired = await EventRegistration.updateOne(
            {
              _id: registration._id,
              state: "payment_hold",
              expiresAt: { $lte: now },
            },
            {
              $set: {
                state: "expired",
              },
              $unset: {
                expiresAt: 1,
              },
            },
            { session }
          );

          if (expired.modifiedCount === 1) {
            await Event.updateOne(
              { _id: input.eventId },
              { $inc: { reservedRegistrationCount: -1 } },
              { session }
            );
          }
        }

        const order = await Order.create(
          [
            {
              clerkId: input.clerkId,
              eventId: input.eventId,
              eventTitle: input.eventTitle,
              eventSlug: input.eventSlug,
              amount: input.amountPaise,
              razorpayOrderId: input.razorpayOrderId,
              razorpayPaymentId: input.razorpayPaymentId,
              razorpaySignature: input.razorpaySignature,
              status: "paid",
              fulfillmentStatus: "refund_required",
              refundRequiredAt: now,
            },
          ],
          { session }
        );

        return {
          status: "refund_required" as const,
          orderId: order[0]._id.toString(),
        };
      }

      // Normal successful payment.
      const order = await Order.create(
        [
          {
            clerkId: input.clerkId,
            eventId: input.eventId,
            eventTitle: input.eventTitle,
            eventSlug: input.eventSlug,
            amount: input.amountPaise,
            razorpayOrderId: input.razorpayOrderId,
            razorpayPaymentId: input.razorpayPaymentId,
            razorpaySignature: input.razorpaySignature,
            status: "paid",
            fulfillmentStatus: "fulfilled",
          },
        ],
        { session }
      );

      await Event.updateOne(
        { _id: input.eventId },
        {
          $inc: {
            reservedRegistrationCount: -1,
            confirmedRegistrationCount: 1,
          },
        },
        { session }
      );

      await EventRegistration.updateOne(
        {
          _id: registration._id,
          state: "payment_hold",
        },
        {
          $set: {
            state: "paid_confirmed",
            orderId: order[0]._id,
          },
          $unset: {
            expiresAt: 1,
          },
        },
        { session }
      );

      return {
        status: "paid" as const,
        orderId: order[0]._id.toString(),
      };
    });

    return result;
  } finally {
    await session.endSession();
  }
}