// app/api/events/[slug]/route.ts

import mongoose, { type HydratedDocument } from "mongoose";
import { NextResponse } from "next/server";

import { Event, type IEvent } from "@/database/event.model";
import connectToDatabase from "@/lib/mongodb";

type RouteParams = Promise<{ slug?: string }>;
type RouteContext = { params: RouteParams };

type EventPayload = IEvent & { _id: string };

type SuccessResponse = {
  message: string;
  event: EventPayload;
};

type ErrorResponse = {
  message: string;
  error?: string;
};

type ApiResponse = SuccessResponse | ErrorResponse;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const jsonResponse = (body: ApiResponse, status: number): NextResponse<ApiResponse> =>
  NextResponse.json(body, { status });

const toEventPayload = (eventDocument: HydratedDocument<IEvent>): EventPayload => ({
  _id: eventDocument._id.toString(),
  title: eventDocument.title,
  slug: eventDocument.slug,
  description: eventDocument.description,
  overview: eventDocument.overview,
  image: eventDocument.image,
  slideshowImages: eventDocument.slideshowImages ?? [],
  venue: eventDocument.venue,
  location: eventDocument.location,
  address: eventDocument.address,
  city: eventDocument.city,
  state: eventDocument.state,
  country: eventDocument.country,
  category: eventDocument.category,
  date: eventDocument.date,
  time: eventDocument.time,
  mode: eventDocument.mode,
  audience: eventDocument.audience,
  agenda: eventDocument.agenda,
  organizer: eventDocument.organizer,
  creatorClerkId: eventDocument.creatorClerkId,
  organizerEmails: eventDocument.organizerEmails,
  tags: eventDocument.tags,
  tagSlugs: eventDocument.tagSlugs,
  countrySlug: eventDocument.countrySlug,
  stateSlug: eventDocument.stateSlug,
  citySlug: eventDocument.citySlug,
  categorySlug: eventDocument.categorySlug,
  price: eventDocument.price,           // ← Add this
  capacity: eventDocument.capacity,
  confirmedRegistrationCount: eventDocument.confirmedRegistrationCount ?? 0,
  reservedRegistrationCount: eventDocument.reservedRegistrationCount ?? 0,
  sponsors: eventDocument.sponsors || [], // ← Add this
  createdAt: eventDocument.createdAt,
  updatedAt: eventDocument.updatedAt,
  timezone: eventDocument.timezone,
  startAtUTC: eventDocument.startAtUTC,
});

export async function GET(
  _request: Request,
  { params }: RouteContext
): Promise<NextResponse<ApiResponse>> {
  try {
    const { slug } = await params;

    if (typeof slug !== "string") {
      return jsonResponse({ message: "Missing event slug." }, 400);
    }

    const normalizedSlug = slug.trim().toLowerCase();

    if (normalizedSlug.length === 0) {
      return jsonResponse({ message: "Slug cannot be empty." }, 400);
    }

    // Keep slug format aligned with model-generated URLs.
    if (!SLUG_PATTERN.test(normalizedSlug)) {
      return jsonResponse(
        {
          message: "Invalid slug format.",
          error: "Use lowercase letters, numbers, and hyphens only.",
        },
        400
      );
    }

    await connectToDatabase();

    const eventDocument = await Event.findOne({ slug: normalizedSlug }).exec();

    if (!eventDocument) {
      return jsonResponse({ message: "Event not found." }, 404);
    }

    return jsonResponse(
      {
        message: "Event fetched successfully.",
        event: toEventPayload(eventDocument),
      },
      200
    );
  } catch (error: unknown) {
    if (
      error instanceof mongoose.Error.ValidationError ||
      error instanceof mongoose.Error.CastError
    ) {
      return jsonResponse(
        {
          message: "Invalid request data.",
          error: error.message,
        },
        400
      );
    }

    // Avoid leaking internals while still logging for observability.
    console.error("Failed to fetch event by slug:", error);

    return jsonResponse({ message: "Failed to fetch event." }, 500);
  }
}
