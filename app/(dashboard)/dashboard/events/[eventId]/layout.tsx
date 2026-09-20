import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import EventDashboardShell from "@/components/event-dashboard/shell/EventDashboardShell";
import LoadingSkeleton from "@/components/event-dashboard/shared/LoadingSkeleton";
import {
    assertEventDashboardAccess,
    getAccessibleDashboardEvents,
} from "@/lib/event-dashboard/access";

export const metadata = {
    title: "Event Dashboard — DevEvent",
};

async function EventDashboardLayoutContent({
    eventId,
    children,
}: {
    eventId: string;
    children: React.ReactNode;
}) {
    const [context, accessibleEvents] = await Promise.all([
        assertEventDashboardAccess(eventId),
        getAccessibleDashboardEvents(),
    ]);

    if (!context) notFound();

    return (
        <EventDashboardShell context={context} accessibleEvents={accessibleEvents}>
            {children}
        </EventDashboardShell>
    );
}

export default async function EventDashboardLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ eventId: string }>;
}) {
    await connection();
    const { eventId } = await params;

    return (
        <Suspense fallback={<LoadingSkeleton />}>
            <EventDashboardLayoutContent eventId={eventId}>{children}</EventDashboardLayoutContent>
        </Suspense>
    );
}
