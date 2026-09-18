// app/api/events/route.ts

import { Event } from "@/database/event.model";
import { User } from "@/database/User.model";
import connectToDatabase from "@/lib/mongodb";
import imagekit from "@/lib/imagekit";
import { type EventCategory } from "@/lib/constants/event-categories";
import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { validateEmails } from "@/lib/validateemail";
import { slugifySegment } from "@/lib/seo-events";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { notifyFollowersOfNewEvent } from "@/lib/notifications";
import { getEventStartUTC } from "@/lib/time";
import { sendCoOrganizerInvites } from "@/lib/co-organizer-invites";


type AgendaItem = {
    startTime: string;
    endTime: string;
    keynote: string;
};

type ImageKitUploadResult = {
    url: string;
    fileId?: string;
    file_id?: string;
    fileID?: string;
};

const MAX_IMAGE_FILE_SIZE = 3 * 1024 * 1024;
const MAX_SLIDESHOW_IMAGES = 3;
const MINIMUM_CAPACITY = 5;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

const isDuplicateKeyError = (error: unknown): boolean =>
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number }).code === 11000;

const getImageKitFileId = (uploadResult: ImageKitUploadResult): string | undefined =>
    uploadResult.fileId || uploadResult.file_id || uploadResult.fileID;

const validateImageFile = (file: File, label: string): string | null => {
    if (file.size > MAX_IMAGE_FILE_SIZE) {
        return `${label} size must be less than 3MB. Please upload a smaller image.`;
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        return `${label} must be a JPG, PNG, or WebP image.`;
    }

    return null;
};

const uploadEventImage = async ({
    file,
    title,
    folder,
    prefix,
}: {
    file: File;
    title: string;
    folder: string;
    prefix: string;
}): Promise<ImageKitUploadResult> => {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const extension = file.name.split('.').pop() || 'jpg';
    const cleanFileName = `${Date.now()}-${prefix}-${slugifySegment(title)}.${extension}`;

    const uploadResult = await imagekit.upload({
        file: buffer,
        fileName: cleanFileName,
        folder,
        useUniqueFileName: true,
    }) as ImageKitUploadResult;

    if (!uploadResult?.url) {
        throw new Error('Image upload failed. Please try again.');
    }

    return uploadResult;
};

/**
 * Normally the Clerk `user.created` webhook has already inserted this row.
 * If it hasn't yet (webhook not reachable in dev, a missed delivery, or a
 * race where the event fires but hasn't been processed), fetch the profile
 * straight from Clerk and create it here instead of failing the request.
 */
const getOrCreateUser = async (userId: string) => {
    let creator = await User.findOneAndUpdate(
        { clerkId: userId },
        { $inc: { eventsHostedCount: 1 } },
        { returnDocument: "after" }
    ).select("username firstName lastName photo eventsHostedCount");

    if (creator) return creator;

    const clerk = await clerkClient();
    const clerkUser = await clerk.users.getUser(userId);

    const email = clerkUser.emailAddresses?.[0]?.emailAddress;
    if (!email) {
        // Matches the same "no email yet" edge case the webhook already skips.
        return null;
    }

    try {
        creator = await User.create({
            clerkId: userId,
            email,
            username: clerkUser.username ?? email.split("@")[0],
            firstName: clerkUser.firstName || email.split("@")[0],
            lastName: clerkUser.lastName ?? "",
            photo: clerkUser.imageUrl ?? "",
            onboarded: false,
            onboardingStep: 0,
            eventsHostedCount: 1,
        });
    } catch (err) {
        // The webhook may have inserted the row in the split-second between
        // our findOneAndUpdate above and this create — re-fetch instead of failing.
        if (isDuplicateKeyError(err)) {
            creator = await User.findOneAndUpdate(
                { clerkId: userId },
                { $inc: { eventsHostedCount: 1 } },
                { returnDocument: "after" }
            ).select("username firstName lastName photo eventsHostedCount");
        } else {
            throw err;
        }
    }

    return creator;
};

export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        await connectToDatabase();

        // ==================== CREATOR PROFILE (self-healing) ====================
        const creator = await getOrCreateUser(userId);
        if (!creator) {
            return NextResponse.json(
                { message: "We couldn't find an email on your account yet. Please finish signing up and try again." },
                { status: 404 }
            );
        }
        const isFirstEvent = (creator.eventsHostedCount ?? 1) === 1;
        // ==========================================================================

        const formData = await req.formData();

        const eventFields = Object.fromEntries(formData.entries()) as Record<string, FormDataEntryValue>;

        const title = String(eventFields.title ?? "").trim();
        if (!title) {
            return NextResponse.json({ message: "Title is required" }, { status: 400 });
        }

        const slug = slugifySegment(title);
        const rawCapacity = String(eventFields.capacity ?? "").trim();
        const capacity = rawCapacity ? Number(rawCapacity) : undefined;
        if (capacity !== undefined && (!Number.isSafeInteger(capacity) || capacity < MINIMUM_CAPACITY)) {
            return NextResponse.json({ message: `Capacity must be a whole number of at least ${MINIMUM_CAPACITY}.` }, { status: 400 });
        }

        const organizerEmails = formData.getAll("organizerEmails") as string[];
        const emailCheck = await validateEmails(organizerEmails);
        if (!emailCheck.valid) {
            return Response.json({ error: emailCheck.reason }, { status: 400 });
        }

        // ==================== IMAGE VALIDATION ====================
        const fileEntry = formData.get("image");
        if (!(fileEntry instanceof File) || fileEntry.size === 0) {
            return NextResponse.json({ message: 'Image File is required' }, { status: 400 });
        }

        const file = fileEntry;

        const imageValidationError = validateImageFile(file, "Banner image");
        if (imageValidationError) {
            return NextResponse.json({ message: imageValidationError }, { status: 400 });
        }

        const slideshowEntries = formData.getAll("slideshowImages");
        if (slideshowEntries.length > MAX_SLIDESHOW_IMAGES) {
            return NextResponse.json({ message: `You can upload at most ${MAX_SLIDESHOW_IMAGES} slideshow photos.` }, { status: 400 });
        }

        const slideshowFiles: File[] = [];
        for (const entry of slideshowEntries) {
            if (!(entry instanceof File) || entry.size === 0) {
                return NextResponse.json({ message: 'Each slideshow photo must be a valid image file.' }, { status: 400 });
            }

            const slideshowValidationError = validateImageFile(entry, "Slideshow photo");
            if (slideshowValidationError) {
                return NextResponse.json({ message: slideshowValidationError }, { status: 400 });
            }

            slideshowFiles.push(entry);
        }
        // ========================================================

        const tags = formData.getAll('tags').map((t) => String(t)) as string[];
        const audience = formData.getAll('audience') as string[];

        let agenda: AgendaItem[];
        try {
            agenda = JSON.parse(formData.get('agenda') as string);
            if (!Array.isArray(agenda) || agenda.length === 0) {
                throw new Error("Agenda must be a non-empty array.");
            }
        } catch {
            return NextResponse.json({ message: "Invalid agenda data." }, { status: 400 });
        }

        // Co-organizers are optional — invalid/missing JSON just means none
        // were selected, not a request failure.
        let coOrganizerClerkIds: string[] = [];
        try {
            const parsed = JSON.parse(formData.get('coOrganizerClerkIds') as string || '[]');
            if (Array.isArray(parsed)) {
                coOrganizerClerkIds = parsed.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
            }
        } catch {
            coOrganizerClerkIds = [];
        }
        // Dedupe and never let the creator co-organize with themselves.
        coOrganizerClerkIds = Array.from(new Set(coOrganizerClerkIds)).filter((id) => id !== userId);

        const existingEvent = await Event.findOne({ slug });
        if (existingEvent) {
            return NextResponse.json({ message: "An event with this slug already exists" }, { status: 409 });
        }

        const uploadedFileIds: string[] = [];

        try {
            const uploadResult = await uploadEventImage({
                file,
                title,
                folder: "/DevEvent",
                prefix: "banner",
            });
            const imageFileId = getImageKitFileId(uploadResult);
            if (imageFileId) uploadedFileIds.push(imageFileId);

            const slideshowImages: string[] = [];
            for (const [index, slideshowFile] of slideshowFiles.entries()) {
                const slideshowUploadResult = await uploadEventImage({
                    file: slideshowFile,
                    title,
                    folder: "/DevEvent/slideshows",
                    prefix: `slideshow-${index + 1}`,
                });
                const slideshowFileId = getImageKitFileId(slideshowUploadResult);
                if (slideshowFileId) uploadedFileIds.push(slideshowFileId);
                slideshowImages.push(slideshowUploadResult.url);
            }

            // Compute these ONCE, as plain strings — reused for both the
            // stored date/time fields AND the startAtUTC derivation, so
            // there's exactly one source of these values (avoids the
            // duplicate-property mistake and the FormDataEntryValue type
            // error at the same time).
            const eventDateField = String(eventFields.date ?? "");
            const eventTimeField = String(eventFields.time ?? "");
            const eventTimezoneField = String(eventFields.timezone ?? "Asia/Kolkata");

            const create_event = await Event.create({
                title: String(eventFields.title ?? ""),
                slug,
                description: String(eventFields.description ?? ""),
                overview: String(eventFields.overview ?? ""),
                image: uploadResult.url,
                slideshowImages,
                venue: String(eventFields.venue ?? ""),
                location: String(eventFields.location ?? ""),
                address: String(eventFields.address ?? ""),
                city: String(eventFields.city ?? ""),
                state: String(eventFields.state ?? ""),
                country: String(eventFields.country ?? ""),
                category: String(eventFields.category ?? "") as EventCategory,
                date: eventDateField,
                time: eventTimeField,
                mode: String(eventFields.mode ?? ""),
                audience,
                price: Number(eventFields.price ?? 0),
                capacity,
                sponsors: JSON.parse(formData.get('sponsors') as string || '[]'),
                organizer: String(eventFields.organizer ?? ""),
                timezone: eventTimezoneField,
                startAtUTC: getEventStartUTC(eventDateField, eventTimeField, eventTimezoneField),
                tags,
                agenda,
                organizerEmails,
                creatorClerkId: userId,
            });

            // Co-organizer invites: pending until the invitee accepts. Only
            // accepted co-organizers are written to CoOrganizer (what
            // isGateAuthorized reads). Failures here shouldn't undo event
            // creation — log and let the organizer re-invite from settings.
            if (coOrganizerClerkIds.length > 0) {
                try {
                    await sendCoOrganizerInvites(create_event._id, coOrganizerClerkIds, userId);
                } catch (coOrganizerErr) {
                    console.error("Co-organizer invite failed:", coOrganizerErr);
                }
            }

            await notifyFollowersOfNewEvent({
                creatorClerkId: userId,
                eventId: create_event._id.toString(),
                eventSlug: create_event.slug,
                eventTitle: create_event.title,
            });

            revalidateTag("events", "default");
            if (creator.username) {
                revalidatePath(`/profile/${creator.username}`);
            }
            return NextResponse.json({
                message: 'Event Created Successfully',
                event: create_event,
                isFirstEvent,
            }, { status: 201 });

        } catch (createErr: unknown) {
            for (const fileId of uploadedFileIds) {
                try {
                    await imagekit.deleteFile(fileId);
                } catch (deleteErr) {
                    console.error('ImageKit cleanup failed:', deleteErr);
                }
            }

            if (isDuplicateKeyError(createErr)) {
                return NextResponse.json({ message: "An event with this slug already exists" }, { status: 409 });
            }

            console.error('Event creation failed:', createErr);
            return NextResponse.json({
                message: 'Event Creation failed',
                error: createErr instanceof Error ? createErr.message : 'Unknown error',
            }, { status: 500 });
        }

    } catch (err: unknown) {
        if (isDuplicateKeyError(err)) {
            return NextResponse.json({ message: "An event with this slug already exists" }, { status: 409 });
        }
        console.error(err);
        return NextResponse.json({
            message: 'Event Creation failed',
            error: err instanceof Error ? err.message : 'Unknown error'
        }, { status: 500 });
    }
}

export async function GET() {
    try {
        await connectToDatabase();

        // .lean() returns plain JS objects instead of typed Mongoose
        // Documents — this lets us add the computed `utc` field to a NEW
        // object below without TypeScript rejecting an unknown property
        // on a Document type.
        const events = await Event.find().sort({ createdAt: -1 }).lean();

        const response = events.map((event) => ({
            ...event,
            utc: event.startAtUTC ? new Date(event.startAtUTC).toISOString() : null,
            timezone: event.timezone ?? null,
        }));

        return NextResponse.json({ message: 'Event Fetched Successfully', events: response }, { status: 200 });
    } catch (err) {
        console.error('Event fetching failed:', err);
        return NextResponse.json({ message: 'Event Fetching Failed', error: err }, { status: 500 });
    }
}
