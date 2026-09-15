import { HydratedDocument, Model, Schema, Types, model, models } from "mongoose";
import Event from "./event.model";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface IBooking {
    clerkId: string;           // links booking to the authenticated Clerk user
    eventId: Types.ObjectId;
    email: string;
    slug: string;
    checkedIn: boolean;
    checkedInAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

type BookingDocument = HydratedDocument<IBooking>;
type BookingModel = Model<IBooking>;

const bookingSchema = new Schema<IBooking>(
    {
        clerkId: {
            type: String,
            required: true,
            trim: true,
        },
        eventId: {
            type: Schema.Types.ObjectId,
            ref: "Event",
            required: true,
        },
        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            validate: {
                validator: (value: string) => EMAIL_REGEX.test(value),
                message: "Invalid email format.",
            },
        },
        slug: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },
        checkedIn: { 
            type: Boolean, 
            default: false,
        },
        checkedInAt: { 
            type: Date ,
        },
    },
    { timestamps: true }
);

// One booking per user per event — prevents duplicate bookings
bookingSchema.index({ clerkId: 1, eventId: 1 }, { unique: true });

bookingSchema.pre("save", async function validateBooking(this: BookingDocument) {
    this.email = this.email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(this.email)) {
        throw new Error("Invalid email format.");
    }

    if (this.isModified("eventId")) {
        const session = this.$session();
        const eventExists = session
            ? await Event.exists({ _id: this.eventId.toString() }).session(session)
            : await Event.exists({ _id: this.eventId.toString() });

        if (!eventExists) {
            throw new Error("Cannot create booking: referenced event does not exist.");
        }
    }
});

const Booking =
    (models.Booking as BookingModel | undefined) ??
    model<IBooking>("Booking", bookingSchema);

export { Booking };
export default Booking;