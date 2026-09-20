// app/events/[slug]/page.tsx

import EventCard from "@/components/EventCard";
import { getEventBySlug, getSimilarEventsBySlug } from "@/lib/actions/event.actions";
import type { IAgendaItem } from "@/database/event.model";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { getTagLink, getCategoryLink, getCityLink } from "@/lib/event-links";
import StickyBookingBar from "@/components/BookEvent";
import CommentSection from "@/components/CommentSection";
import EventSponsors from "@/components/EventSponsors";
import EventScheduleDisplay from "@/components/EventScheduleDisplay";


const EventDetailItem = ({ icon, alt, label }: { icon: string; alt: string; label: string;}) => (
    <div className="flex items-center gap-2">
        <Image src={icon} alt={alt} width={17} height={17} />
        <p>{label}</p>
    </div>
);

type SimilarEvent = {
    _id: string;
    title: string;
    slug: string;
    location: string;
    date: string;
    time: string;
    image: string;
    mode?: string;
    tags?: string[];
    timezone?: string;
    startAtUTC?: string;
};

const Agenda = ({ agendaItems }: { agendaItems: IAgendaItem[] }) => (
    <div className="agenda">
        <h2>Agenda</h2>
        <ul className="space-y-4">
            {agendaItems?.map((item, index) => (
                <li key={index} className="flex gap-4">
                    <div className="text-sm text-gray-400 min-w-30">
                        {item.startTime} — {item.endTime}
                    </div>
                    <div>{item.keynote}</div>
                </li>
            ))}
        </ul>
    </div>
);

const EventTags = ({ tags }: { tags: string[] }) => (
    <div className="flex flex-row gap-1.5 flex-wrap mt-4">
        {tags?.map((tag, index) => (
            <Link 
                key={index} 
                href={getTagLink(tag)} 
                className="pill"
            >
                {tag}
            </Link>
        ))}
    </div>
);

async function EventContent({ slug }: { slug: string }) {
    // Read the event directly on the server. Calling this app's own HTTP API
    // here depends on NEXT_PUBLIC_BASE_URL being correct in every deployment
    // and can turn a valid event into a false not-found page.
    const event = await getEventBySlug(slug);
    if (!event) notFound();

    const { 
      description, 
      image, 
      overview, 
      date,
      time,
      location,
      address,
      mode, 
      audience, 
      tags,
      agenda,
      category,
      city,
      state,
      country,
      price,
      organizer,
    } = event;

    const similarEvents = (await getSimilarEventsBySlug(slug)) as SimilarEvent[];

    return (
        <>
            <div>
                <h1>Event Description</h1>
                <p>{description}</p>
            </div>

            <div className="details">
                <div className="content">
                    <Image 
                        className="banner" 
                        src={image} 
                        alt="Event Banner" 
                        width={800} 
                        height={800} 
                        priority 
                    />

                    <section className="flex-col-gap-2">
                        <h2>Overview</h2>
                        <p>{overview}</p>
                    </section>

                    <section className="flex-col-gap-2">
                        <h2>Event Details</h2>
                        <div className="flex items-center gap-2">
                            <Image src="/icons/calendar.svg" alt="calendar" width={17} height={17} />
                            <EventScheduleDisplay
                                date={date}
                                time={time}
                                timezone={event.timezone}
                                startAtUTC={event.startAtUTC}
                                mode={mode}
                            />
                        </div>

                        <Link
                            href={getCityLink({ city, state, country })}
                            className="flex items-center gap-2 hover:underline hover:text-blue-600 transition-colors"
                        >
                            <Image src="/icons/pin.svg" alt="location" width={17} height={17} />
                            <p>{location}</p>
                        </Link>

                        {address && (
                            <EventDetailItem icon="/icons/pin.svg" alt="address" label={address} />
                        )}

                        <EventDetailItem icon="/icons/mode.svg" alt="mode" label={mode} />
                        <EventDetailItem icon="/icons/audience.svg" alt="audience" label={audience} />

                        {category && (
                            <Link
                                href={getCategoryLink(category)}
                                className="flex items-center gap-2 hover:underline hover:text-blue-600 transition-colors"
                            >
                                <span className="font-medium">Category:</span> {category}
                            </Link>
                        )}
                    </section>

                    {agenda && agenda.length > 0 && <Agenda agendaItems={agenda} />}

                    <section className="flex-col-gap-2">
                        <h2>About The Organizer</h2>
                        <p>{organizer}</p>
                    </section>

                    {tags && tags.length > 0 && <EventTags tags={tags} />}
                </div>

                {/* Sponsors */}
                <EventSponsors sponsors={event.sponsors || []} /> 
                {/* Comments */}
                <CommentSection eventId={event._id.toString()} />

            </div>

            <div className="flex w-full flex-col gap-4 pt-20">
                <h2>Similar Events</h2>
                <div className="events">
                    {similarEvents.length > 0 &&
                        similarEvents.map((similarEvent) => (
                            <EventCard
                              key={similarEvent._id}
                              eventId={similarEvent._id.toString()}
                              title={similarEvent.title}
                              image={similarEvent.image}
                              slug={similarEvent.slug}
                              location={similarEvent.location}
                              date={similarEvent.date}
                              time={similarEvent.time}
                              mode={similarEvent.mode}
                              timezone={similarEvent.timezone}
                              startAtUTC={similarEvent.startAtUTC}
                              price={0}
                              tags={similarEvent.tags}
                              hostName="Unknown Organizer"
                              organization="DevSphere Community"
                            />
                        ))}
                </div>
            </div>

            {/* Sticky Booking Bar */}
            <StickyBookingBar
              eventId={event._id.toString()}
              slug={event.slug}
              title={event.title}
              description={event.description}
              image={image}
              location={location}
              category={category}
              price={price ?? 0}
              mode={event.mode}
              eventDate={date}
              eventTime={time}
              timezone={event.timezone}
              capacity={event.capacity}
              confirmedRegistrationCount={event.confirmedRegistrationCount}
              reservedRegistrationCount={event.reservedRegistrationCount}
            />
        </>
    );
}

export default function EventDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
    return (
        <section id="event">
            <Suspense fallback={<p>Loading event...</p>}>
                <EventContentResolver paramsPromise={params} />
            </Suspense>
        </section>
    );
}

async function EventContentResolver({ paramsPromise }: { paramsPromise: Promise<{ slug: string }> }) {
    const { slug } = await paramsPromise;
    return <EventContent slug={slug} />;
}
