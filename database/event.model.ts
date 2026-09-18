import { HydratedDocument, Model, Schema, model, models } from "mongoose";
import { EVENT_CATEGORIES, EventCategory } from "@/lib/constants/event-categories";
import { DEFAULT_EVENT_TIMEZONE, getEventStartUTC } from "@/lib/time";
import { DateTime } from "luxon";

export interface IAgendaItem {
  startTime: string;
  endTime: string;
  keynote: string;
}

export interface ISponsorItem {
  name: string;
  website: string;
  logo?: string; // populated later by an auto-detect system (social/company DP or favicon.ico) — not user-entered at creation
}

export interface IEvent {
  _id?: string;
  title: string;
  slug: string;
  description: string;
  overview: string;
  image: string;
  slideshowImages: string[];
  venue: string;
  location: string;
  address: string;
  city: string;
  state: string;
  country: string;
  // lat: number;
  // lng: number;
  // placeId: string;
  category: EventCategory;
  date: string;
  time: string;
  mode: string;
  audience: string[];
  agenda: IAgendaItem[];
  organizer: string;
  creatorClerkId: string;
  organizerEmails: string[];
  tags: string[];
  tagSlugs?: string[];
  countrySlug?: string;
  stateSlug?: string;
  citySlug?: string;
  categorySlug?: string;
  price: number;
  isFree?: boolean;
  /** Undefined means registrations are unlimited. */
  capacity?: number;
  /** Internal inventory counters. They are only mutated by registration-inventory. */
  confirmedRegistrationCount?: number;
  reservedRegistrationCount?: number;
  sponsors: ISponsorItem[];
  timezone?: string;
  startAtUTC?: Date;
  createdAt: Date;
  updatedAt: Date;
}

type EventDocument = HydratedDocument<IEvent>;
type EventModel = Model<IEvent>;
type RequiredStringField =
  | "title"
  | "description"
  | "overview"
  | "image"
  | "venue"
  | "location"
  | "address"
  | "city"
  | "state"
  | "country"
  // | "placeId"
  | "category"
  | "date"
  | "time"
  | "mode"
  | "organizer";

const REQUIRED_STRING_FIELDS: RequiredStringField[] = [
  "title",
  "description",
  "overview",
  "image",
  "venue",
  "location",
  "address",
  "city",
  "state",
  "country",
  // "placeId",
  "category",
  "date",
  "time",
  "mode",
  "organizer",
];

const createSlug = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const normalizeDateToIso = (value: string): string => {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error("Invalid event date. Use a valid date value.");
  }

  return parsedDate.toISOString();
};

const normalizeTime = (value: string): string => {
  const trimmed = value.trim();
  const twentyFourHourMatch = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);

  if (twentyFourHourMatch) {
    const [, hour, minutes] = twentyFourHourMatch;
    return `${hour.padStart(2, "0")}:${minutes}`;
  }

  const twelveHourMatch = trimmed.match(/^(\d{1,2})(?::([0-5]\d))?\s*(AM|PM)$/i);

  if (!twelveHourMatch) {
    throw new Error("Invalid event time. Use HH:mm or h:mm AM/PM.");
  }

  const rawHour = Number(twelveHourMatch[1]);
  const minutes = twelveHourMatch[2] ?? "00";
  const meridiem = twelveHourMatch[3].toUpperCase();

  if (rawHour < 1 || rawHour > 12) {
    throw new Error("Invalid event time hour.");
  }

  const hour24 = (rawHour % 12) + (meridiem === "PM" ? 12 : 0);
  return `${String(hour24).padStart(2, "0")}:${minutes}`;
};

const agendaItemSchema = new Schema<IAgendaItem>(
  {
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
    keynote: { type: String, required: true, trim: true },
  },
  { _id: false }
);

// URL-ish validation kept loose on purpose — a bare "acme.com" (no protocol)
// is a very common thing for someone to type, and the auto-detect logo
// system (social vs favicon) will need to normalize this anyway later.
const WEBSITE_PATTERN = /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/\S*)?$/i;

const sponsorItemSchema = new Schema<ISponsorItem>(
  {
    name: { type: String, required: true, trim: true },
    website: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value: string) => WEBSITE_PATTERN.test(value),
        message: (props: { value: string }) => `"${props.value}" doesn't look like a valid website or social link.`,
      },
    },
    logo: { type: String, trim: true },
  },
  { _id: false }
);

const eventSchema = new Schema<IEvent>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, trim: true, lowercase: true, unique: true },
    description: { type: String, required: true, trim: true },
    overview: { type: String, required: true, trim: true },
    image: { type: String, required: true, trim: true },
    slideshowImages: {
      type: [{ type: String, trim: true }],
      default: [],
      validate: {
        validator: (value: string[]) => value.length <= 3,
        message: "slideshowImages can contain at most 3 images.",
      },
    },
    venue: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },

    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },

    category: { type: String, required: true, enum: EVENT_CATEGORIES },

    date: { type: String, required: true, trim: true },
    time: { type: String, required: true, trim: true },
    mode: { type: String, required: true, trim: true },
    audience: {
      type: [{ type: String, trim: true }],
      required: true,
      validate: {
        validator: (value: string[]) => value.length > 0,
        message: "audience must contain at least one item.",
      },
    },

    price: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    capacity: {
      type: Number,
      min: 5,
      validate: {
        validator: (value: number | undefined) => value === undefined || Number.isSafeInteger(value),
        message: "capacity must be a whole number of at least 5.",
      },
    },
    confirmedRegistrationCount: { type: Number, default: 0, min: 0 },
    reservedRegistrationCount: { type: Number, default: 0, min: 0 },

    // Sponsors — optional overall, but any entry that IS provided must have
    // a valid name + website. logo is never user-entered; it's filled in
    // later by the auto-detect system.
    sponsors: {
      type: [sponsorItemSchema],
      default: [],
    },
    // --- Agenda ---
    agenda: {
      type: [agendaItemSchema],
      required: true,
      validate: {
        validator: (value: IAgendaItem[]) => value.length > 0,
        message: "agenda must contain at least one item.",
      },
    },

    organizer: { type: String, required: true, trim: true },

    creatorClerkId: {
      type: String,
      required: true,
      trim: true,
      index: true,             // we'll query "events by this user" frequently
    },

    organizerEmails: {
      type: [{ type: String, trim: true, lowercase: true }],
      required: true,
      validate: {
        validator: (value: string[]) => value.length > 0,
        message: "organizerEmails must contain at least one item.",
      },
    },

    tags: {
      type: [{ type: String, trim: true }],
      required: true,
      validate: {
        validator: (value: string[]) => value.length > 0,
        message: "tags must contain at least one item.",
      },
    },

    tagSlugs: {
      type: [{ type: String, trim: true, lowercase: true }],
      default: [],
    },

    countrySlug: { type: String, trim: true, lowercase: true },
    stateSlug: { type: String, trim: true, lowercase: true },
    citySlug: { type: String, trim: true, lowercase: true },
    categorySlug: { type: String, trim: true, lowercase: true },
    timezone: {
      type: String,
      trim: true,
      validate: {
        validator: (value: string) => DateTime.local().setZone(value).isValid,
        message: "timezone must be a valid IANA timezone.",
      },
    },
    startAtUTC: { type: Date, index: true },
  },
  {
    timestamps: true,
  }
);

eventSchema.pre("validate", function validateAndNormalizeEvent(this: EventDocument) {
  for (const field of REQUIRED_STRING_FIELDS) {
    const value = this[field];

    // Special-case category because its type is a literal union (EventCategory)
    if (field === "category") {
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`${field} is required and cannot be empty.`);
      }
      const trimmed = value.trim();
      if (!EVENT_CATEGORIES.includes(trimmed as EventCategory)) {
        throw new Error(`Invalid category "${trimmed}".`);
      }
      this.category = trimmed as EventCategory;
      continue;
    }

    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`${field} is required and cannot be empty.`);
    }

    this.set(field, value.trim());
  }

  this.tagSlugs = Array.from(
    new Set((this.tags ?? []).map((tag) => createSlug(tag)).filter(Boolean))
  );
  this.slideshowImages = Array.from(
    new Set((this.slideshowImages ?? []).map((url) => url.trim()).filter(Boolean))
  );
  this.countrySlug = createSlug(this.country);
  this.stateSlug = createSlug(this.state);
  this.citySlug = createSlug(this.city);
  this.categorySlug = createSlug(this.category);

  // --- Agenda: structured validation + time normalization ---
  if (!Array.isArray(this.agenda) || this.agenda.length === 0) {
    throw new Error("agenda must contain at least one item.");
  }

  this.agenda = this.agenda
    .map((item) => ({
      startTime: item.startTime?.trim(),
      endTime: item.endTime?.trim(),
      keynote: item.keynote?.trim(),
    }))
    .filter((item) => item.startTime && item.endTime && item.keynote);

  if (this.agenda.length === 0) {
    throw new Error("agenda must contain valid items with startTime, endTime, and keynote.");
  }

  this.agenda = this.agenda.map((item) => {
    const normalizedStart = normalizeTime(item.startTime);
    const normalizedEnd = normalizeTime(item.endTime);

    if (normalizedEnd <= normalizedStart) {
      throw new Error(
        `Agenda item "${item.keynote}" has an end time that isn't after its start time.`
      );
    }

    return {
      startTime: normalizedStart,
      endTime: normalizedEnd,
      keynote: item.keynote,
    };
  });

  // --- Sponsors: drop any incomplete rows rather than failing the whole save ---
  if (Array.isArray(this.sponsors)) {
    this.sponsors = this.sponsors
      .map((s) => ({
        name: s.name?.trim(),
        website: s.website?.trim(),
        logo: s.logo?.trim(),
      }))
      .filter((s) => s.name && s.website) as ISponsorItem[];
  }

  // --- organizerEmails ---
  if (!Array.isArray(this.organizerEmails) || this.organizerEmails.length === 0) {
    throw new Error("organizerEmails must contain at least one item.");
  }

  this.organizerEmails = this.organizerEmails
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (this.organizerEmails.length === 0) {
    throw new Error("organizerEmails must contain non-empty items.");
  }

  // --- audience ---
  if (!Array.isArray(this.audience) || this.audience.length === 0) {
    throw new Error("audience must contain at least one item.");
  }

  this.audience = this.audience.map((item) => item.trim()).filter(Boolean);

  if (this.audience.length === 0) {
    throw new Error("audience must contain non-empty items.");
  }

  // --- tags ---
  if (!Array.isArray(this.tags) || this.tags.length === 0) {
    throw new Error("tags must contain at least one item.");
  }

  this.tags = this.tags.map((item) => item.trim()).filter(Boolean);

  if (this.tags.length === 0) {
    throw new Error("tags must contain non-empty items.");
  }

  // Keep URLs stable by regenerating slug only when title changes.
  if (this.isModified("title") || !this.slug) {
    this.slug = createSlug(this.title);
  }

  if (!this.slug) {
    throw new Error("Unable to generate a valid slug from title.");
  }

  // Normalize date/time for consistent persistence and querying.
  this.date = normalizeDateToIso(this.date);
  this.time = normalizeTime(this.time);

  // New events always get a complete canonical schedule. Existing legacy
  // documents remain readable without being rewritten unless their schedule
  // is explicitly changed.
  if (this.isNew && !this.timezone) {
    this.timezone = DEFAULT_EVENT_TIMEZONE;
  }
  if (
    this.timezone &&
    (this.isNew || this.isModified("date") || this.isModified("time") || this.isModified("timezone"))
  ) {
    this.startAtUTC = getEventStartUTC(this.date, this.time, this.timezone);
  }
});

eventSchema.index({ tags: 1 });
eventSchema.index({ tagSlugs: 1 });
eventSchema.index({ category: 1 });
eventSchema.index({ categorySlug: 1 });
eventSchema.index({ country: 1, state: 1, city: 1 });
eventSchema.index({ countrySlug: 1, stateSlug: 1, citySlug: 1 });
eventSchema.index({ mode: 1 });
eventSchema.index({ date: 1 });
eventSchema.index({ title: "text", description: "text", overview: "text", venue: "text" });

const Event = (models.Event as EventModel | undefined) ?? model<IEvent>("Event", eventSchema);

export { Event };
export default Event;
