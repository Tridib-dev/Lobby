import { HydratedDocument, Model, Schema, Types, model, models } from "mongoose";

export type RegistrationState = "free_confirmed" | "payment_hold" | "paid_confirmed" | "released" | "expired";

export interface IEventRegistration {
  eventId: Types.ObjectId;
  clerkId: string;
  state: RegistrationState;
  expiresAt?: Date;
  razorpayOrderId?: string;
  bookingId?: Types.ObjectId;
  orderId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

type EventRegistrationDocument = HydratedDocument<IEventRegistration>;
type EventRegistrationModel = Model<IEventRegistration>;

const eventRegistrationSchema = new Schema<IEventRegistration>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
    clerkId: { type: String, required: true, trim: true, index: true },
    state: {
      type: String,
      required: true,
      enum: ["free_confirmed", "payment_hold", "paid_confirmed", "released", "expired"],
    },
    expiresAt: { type: Date, index: true },
    razorpayOrderId: { type: String, sparse: true, unique: true },
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking" },
    orderId: { type: Schema.Types.ObjectId, ref: "Order" },
  },
  { timestamps: true }
);

// A participant has one registration lifecycle per event. This is deliberately
// separate from Booking/Order so free and paid paths cannot oversell each other.
eventRegistrationSchema.index({ eventId: 1, clerkId: 1 }, { unique: true });

const EventRegistration =
  (models.EventRegistration as EventRegistrationModel | undefined) ??
  model<IEventRegistration>("EventRegistration", eventRegistrationSchema);

export type { EventRegistrationDocument };
export default EventRegistration;
