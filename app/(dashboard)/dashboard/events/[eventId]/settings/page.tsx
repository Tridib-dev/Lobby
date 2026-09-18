import Link from "next/link";
import { notFound } from "next/navigation";
import PageSection from "@/components/event-dashboard/shared/PageSection";
import ActionCardRail from "@/components/event-dashboard/shared/ActionCardRail";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEventSettings } from "@/lib/event-dashboard/settings.schema";
import { getEventDashboardContext } from "@/lib/event-dashboard/access";
import { getActionRailItems } from "@/lib/event-dashboard/navigation";
import { getModeLabel } from "@/lib/event-dashboard/mode";
import EventScheduleDisplay from "@/components/EventScheduleDisplay";

export const metadata = { title: "Settings — Event Dashboard" };

function SettingsSection({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <Card className="overflow-hidden">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>{title}</CardTitle>
                <button
                    type="button"
                    disabled
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] text-slate-400"
                    title="Coming soon"
                >
                    Edit — Coming soon
                </button>
            </CardHeader>
            <CardContent className="space-y-3">{children}</CardContent>
        </Card>
    );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{label}</p>
            <p className="mt-1 text-[13px] text-slate-800">{value || "—"}</p>
        </div>
    );
}

export default async function EventSettingsPage({
    params,
}: {
    params: Promise<{ eventId: string }>;
}) {
    const { eventId } = await params;
    const context = await getEventDashboardContext(eventId);
    if (!context) notFound();

    const settings = await getEventSettings(eventId);
    if (!settings) notFound();

    const actionItems = getActionRailItems(eventId, context.normalizedMode, "settings");

    return (
        <div className="space-y-8">
            <PageSection
                title="Settings"
                description="Read-only event configuration. Full editing is coming in a future release."
                action={
                    <Link
                        href={`/events/${settings.slug}`}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                    >
                        View public event
                    </Link>
                }
            />
            {context.isLegacySchedule && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-700">
                    This event is using a legacy timezone fallback. Editing its schedule will establish a canonical timezone and UTC start instant.
                </p>
            )}

            <div className="grid gap-4 xl:grid-cols-2">
                <SettingsSection title="General">
                    <Field label="Title" value={settings.title} />
                    <Field label="Category" value={settings.category} />
                    <Field label="Mode" value={getModeLabel(context.normalizedMode)} />
                    <Field label="Description" value={settings.description} />
                    <Field label="Overview" value={settings.overview} />
                </SettingsSection>

                <SettingsSection title="Schedule">
                    <Field
                        label="Schedule"
                        value={
                            <EventScheduleDisplay
                                date={settings.date}
                                time={settings.time}
                                timezone={settings.timezone}
                                startAtUTC={settings.startAtUTC}
                                mode={settings.mode}
                            />
                        }
                    />
                    <Field label="Timezone" value={settings.timezone} />
                </SettingsSection>

                <SettingsSection title="Location">
                    <Field label="Venue" value={settings.venue} />
                    <Field label="Location" value={settings.location} />
                    <Field label="Address" value={settings.address} />
                    <Field label="City" value={settings.city} />
                    <Field label="State" value={settings.state} />
                    <Field label="Country" value={settings.country} />
                </SettingsSection>

                <SettingsSection title="Tickets">
                    <Field label="Price" value={settings.isFree ? "Free" : `₹${settings.price.toLocaleString("en-IN")}`} />
                    <Field label="Type" value={settings.isFree ? "Free event" : "Paid event"} />
                    <Field label="Registration limit" value={settings.capacity === null ? "Unlimited" : `${settings.capacity.toLocaleString("en-IN")} participants`} />
                </SettingsSection>
            </div>

            <ActionCardRail items={actionItems} />
        </div>
    );
}
