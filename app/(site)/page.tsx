import EventCard from '@/components/EventCard';
import Explore from '@/components/Explore';
import { getDiscoverEvents } from '@/lib/discover-events';
import { cacheLife, cacheTag } from 'next/cache';



const Page = async () => {
  'use cache';
  cacheTag('events');
  cacheLife('hours')

  // This is already a server component, so query the cached data loader
  // directly instead of making a server-to-server request to our own API.
  // The old request could hit localhost during build/deploy and produce
  // ECONNREFUSED even though the deployed app itself was healthy.
  let events: Awaited<ReturnType<typeof getDiscoverEvents>>["events"] = [];
  try {
    ({ events } = await getDiscoverEvents({ limit: 8 }));
  } catch (error) {
    // The landing page is still useful without featured events. Preserve the
    // previous graceful-degradation behavior if MongoDB or the loader fails.
    console.error("[Home] Failed to load featured events:", error);
  }
 
  return (
    <section>
      <h1 className='text-center mt-30'>The Hub for Every Dev <br /> Events You Cant Miss</h1>
      <p className='text-center mt-5'>Hackathons, Meetups, and Conferences , All in one place </p>

      <Explore />

      <div className='mt-20 space-y-7'>
        <h3>Featured Events</h3>
        
        <ul className='events'>
          {events.length > 0 && events.map((event) =>(
            <li key={event.title}>
            <EventCard
                eventId={event._id?.toString() || ''}
                title={event.title}
                image={event.image}
                slug={event.slug}
                location={event.location}
                date={event.date}
                time={event.time}
                mode={event.mode}
                price={event.price ?? 0}
                tags={event.tags}
                hostName={event.organizer || "Unknown"}
                organization="DevSphere Community"
                timezone={event.timezone ?? undefined}
                startAtUTC={event.startAtUTC ?? undefined}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default Page;

