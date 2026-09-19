import { Schema, model, models, Model, Types } from "mongoose";

export interface IOrder {
    clerkId: string;
    eventId: Types.ObjectId;
    eventTitle: string;
    eventSlug: string;
    amount: number;                  // integer paise (INR × 100), never decimal rupees
    currency: string;
    razorpayOrderId: string;         // from Razorpay create-order
    razorpayPaymentId?: string;      // filled after successful payment
    razorpaySignature?: string;      // filled after verification
    status: "pending" | "paid" | "failed";
    fulfillmentStatus: "fulfilled" | "refund_required" | "refunded";
    refundRequiredAt?: Date;
    razorpayRefundId?: string;
    refundedAt?: Date;
    checkedIn: boolean;     // interface
    checkedInAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

type OrderModel = Model<IOrder>;

const orderSchema = new Schema<IOrder>(
    {
        clerkId: { type: String, required: true },
        eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true },
        eventTitle: { type: String, required: true },
        eventSlug: { type: String, required: true },
        amount: {
            type: Number,
            required: true,
            min: 0,
            validate: {
                validator: Number.isInteger,
                message: "Order amount must be an integer number of paise.",
            },
        },
        currency: { type: String, default: "INR" },
        razorpayOrderId: { type: String, required: true, unique: true },
        razorpayPaymentId: { type: String },
        razorpaySignature: { type: String },
        fulfillmentStatus: {
            type: String,
            enum: ["fulfilled", "refund_required", "refunded"],
            default: "fulfilled",
        },
        refundRequiredAt: { type: Date },
        razorpayRefundId: { type: String },
        refundedAt: { type: Date },
        checkedIn: { type: Boolean, default: false },   // schema
        checkedInAt: { type: Date },
        status: {
            type: String,
            enum: ["pending", "paid", "failed"],
            default: "pending",
        },
    },
    { timestamps: true }
);

orderSchema.index({ clerkId: 1, eventId: 1 });

const Order =
    (models.Order as OrderModel | undefined) ??
    model<IOrder>("Order", orderSchema);

export { Order };
export default Order;
