import type { EventCategory } from "@/lib/constants/event-categories";
import type { AgendaItemInput } from "./fields/AgendaFields";
import type { SponsorItemInput } from "./fields/SponsorFields";
import type { LocationValue } from "./fields/LocationFields";
import { ProfileRowUser } from "../profileCard";
import { isValidEventCapacity } from "@/lib/constants/event-capacity";

export type EventMode = "In-Person" | "Online" | "Hybrid (In-Person & Online)";

/**
 * Everything the wizard collects across all 7 steps.
 * Mirrors IEvent (event.model.ts) minus server-derived fields
 * (slug, tagSlugs, creatorClerkId, timestamps, etc).
 */
export interface EventDraft {
  // Step 1 — Spark
  title: string;
  tagline: string; // maps to `description`
  category: EventCategory | "";

  // Step 2 — Time & place
  date: string;
  time: string;
  timezone: string;
  mode: EventMode | "";
  venue: string;
  address: string;
  location: LocationValue;

  // Step 3 — Story
  imageFile: File | null;
  imagePreviewUrl: string | null;
  slideshowImageFiles: File[];
  slideshowPreviewUrls: string[];
  overview: string;

  // Step 4 — Details
  audience: string[];
  tags: string[];
  agenda: AgendaItemInput[];

  // Step 5 — Tickets
  isFree: boolean;
  price: number;
  hasCapacityLimit: boolean;
  capacity: number | null;

  // Step 6 — Organizer
  organizer: string;
  organizerEmails: string[];
  sponsors: SponsorItemInput[];
  coOrganizers?: ProfileRowUser[];
}

export const emptyDraft: EventDraft = {
  title: "",
  tagline: "",
  category: "",

  date: "",
  time: "",
  timezone: "", 
  mode: "",
  venue: "",
  address: "",
  location: {
    country: "",
    countryCode: "",
    state: "",
    stateCode: "",
    city: "",
  },

  imageFile: null,
  imagePreviewUrl: null,
  slideshowImageFiles: [],
  slideshowPreviewUrls: [],
  overview: "",

  audience: [],
  tags: [],
  agenda: [],

  isFree: true,
  price: 0,
  hasCapacityLimit: false,
  capacity: null,

  organizer: "",
  organizerEmails: [],
  sponsors: [],
};

export const WIZARD_STEPS = [
  { key: "spark", label: "The spark" },
  { key: "time-place", label: "Time & place" },
  { key: "story", label: "The story" },
  { key: "details", label: "Details" },
  { key: "tickets", label: "Tickets" },
  { key: "organizer", label: "Organizer" },
  { key: "review", label: "Review" },
] as const;

export type WizardStepKey = (typeof WIZARD_STEPS)[number]["key"];

/** Per-step validity, computed from the draft. Drives the Continue button + progress rail. */
export interface StepValidity {
  spark: boolean;
  "time-place": boolean;
  story: boolean;
  details: boolean;
  tickets: boolean;
  organizer: boolean;
  review: boolean;
}

export const validateStep = (draft: EventDraft, step: WizardStepKey): boolean => {
  switch (step) {
    case "spark":
      return draft.title.trim().length > 2 && draft.tagline.trim().length > 0 && !!draft.category;
    case "time-place":
      return (
        !!draft.date &&
        !!draft.time &&
        !!draft.timezone && 
        !!draft.mode &&
        draft.venue.trim().length > 0 &&
        draft.address.trim().length > 0 &&
        !!draft.location.country &&
        !!draft.location.state &&
        !!draft.location.city
      );
    case "story":
      return !!draft.imageFile && draft.overview.trim().length > 10;
    case "details": {
      const validAgenda = draft.agenda.filter(
        (a) => a.startTime && a.endTime && a.keynote.trim() && a.endTime > a.startTime
      );
      return draft.audience.length > 0 && draft.tags.length > 0 && validAgenda.length > 0;
    }
    case "tickets":
      return (draft.isFree || draft.price > 0) && (!draft.hasCapacityLimit || isValidEventCapacity(draft.capacity));
    case "organizer":
      return draft.organizer.trim().length > 0 && draft.organizerEmails.length > 0;
    case "review":
      return true;
    default:
      return false;
  }
};
