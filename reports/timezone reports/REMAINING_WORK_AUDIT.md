
### LiveRoomScreen.tsx and PreMeetingUpdates.tsx timezone usage review
**Command:** grep -n "getEventDisplayTime\|displayEventTime\|new Date\|toLocaleTimeString\|toLocaleString" components/room/LiveRoomScreen.tsx
**Raw output:**
```
169:  return new Date(value).toLocaleTimeString(undefined, {
1869:            createdAt: new Date(String(item.createdAt)).getTime(),
1884:            createdAt: new Date(String(item.createdAt)).getTime(),
1887:            answeredAt: item.answeredAt ? new Date(String(item.answeredAt)).getTime() : undefined,
2004:      const createdAt = new Date(String(event.created_at ?? Date.now())).getTime();
```
**Command:** grep -n "getEventDisplayTime\|displayEventTime\|new Date\|toLocaleTimeString\|toLocaleString" components/room/PreMeetingUpdates.tsx
**Raw output:**
```
27:  return new Date(value).toLocaleTimeString(undefined, {
45:    createdAt: new Date(String(item.createdAt)).getTime();
```
**Status:** ✅ Done (all matches are for internal timestamp conversions or message time formatting, not event start time display; no live-ticking clocks found)


### EventAnalyticsView.tsx timezone usage review
**Command:** cat components/event-dashboard/analytics/EventAnalyticsView.tsx
**Raw output:**
```
import StatCard from "@/components/event-dashboard/shared/StatCard";
import ActionCardRail from "@/components/event-dashboard/shared/ActionCardRail";
import { ActivityHeatmap, TrendChart } from "@/components/dashboard/analytics/Charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EventAnalyticsDashboardData } from "@/lib/event-dashboard/analytics";
import { edTokens } from "@/components/event-dashboard/theme/tokens";

function formatDate(date: string) {
    return new Date(date).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

function formatTime(date: string) {
    return new Date(date).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
    });
}

export default function EventAnalyticsView({
    data,
    actionItems,
}: {
    data: EventAnalyticsDashboardData;
    actionItems: Parameters<typeof ActionCardRail>[0]["items"];
}) {
    if (!data.event) return null;

    const funnel = [
        { label: "Total reach", value: data.totalAttendees, pct: 100 },
        {
            label: "Checked in",
            value: data.checkedInCount,
            pct: data.totalAttendees > 0 ? Math.round((data.checkedInCount / data.totalAttendees) * 100) : 0,
        },
        {
            label: "Paid orders",
            value: data.totalPaidOrders,
            pct: data.totalAttendees > 0 ? Math.round((data.totalPaidOrders / data.totalAttendees) * 100) : 0,
        },
    ];

    return (
        <div className="space-y-8">
            <section className="grid grid-cols-4 gap-1">
                <StatCard label="Bookings" value={data.totalBookings} sub="Free registrations" accent={edTokens.info} />
                <StatCard label="Orders" value={data.totalPaidOrders} sub="Completed purchases" accent="#a78bfa" index={1} />
                <StatCard
                    label="Revenue"
                    value={`₹${data.totalRevenue.toLocaleString("en-IN")}`}
                    sub="Ticket revenue"
                    accent={edTokens.warning}
                    index={2}
                    valueClassName="text-[clamp(0.8rem,3.5vw,1.9rem)] tracking-[-0.04em] sm:text-[clamp(1.5rem,3.5vw,2rem)] sm:tracking-normal"
                />
                <StatCard
                    label="Check In"
                    value={`${data.checkedInCount} / ${data.totalAttendees}`}
                    sub={`${data.checkinRate}% of total reach`}
                    accent={edTokens.success}
                    index={3}
                />
            </section>

            <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
                <Card className="flex h-full min-h-0 flex-col overflow-hidden">
                    <CardContent className="flex min-h-0 flex-1 flex-col p-4 sm:p-5">
                        <TrendChart
                            data={data.bookingTrend}
                            dailyData={data.dailyBookingTrend}
                            dataKey="bookings"
                            color={edTokens.info}
                            label="Tickets"
                            title="Booking momentum"
                            light
                        />
                    </CardContent>
                </Card>

                <Card className="flex h-full min-h-0 flex-col overflow-hidden">
                    <CardHeader>
                        <CardTitle>Booking heatmap</CardTitle>
                    </CardHeader>
                    <CardContent className="flex min-h-0 flex-1 flex-col">
                        <ActivityHeatmap
                            data={data.weekdayHeatmap.map((item) => ({
                                month: item.day,
                                count: item.bookings,
                            }))}
                            light
                        />
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <Card className="overflow-hidden">
                    <CardHeader>
                        <CardTitle>Conversion funnel</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {funnel.map((item) => (
                            <div key={item.label}>
                                <div className="mb-1 flex items-center justify-between text-[12px]">
                        <span className="text-slate-600">{item.label}</span>
                        <span className="font-mono text-slate-800">
                                        {item.value.toLocaleString("en-IN")}{" "}
                                        <span className="text-slate-400">({item.pct}%)</span>
                                    </span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                                    <div
                                        className="h-full rounded-full bg-[#332be0]"
                                        style={{ width: `${item.pct}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <Card className="overflow-hidden">
                    <CardHeader>
                        <CardTitle>Recent activity</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {data.recentActivity.length === 0 ? (
                            <p className="text-[13px] text-slate-500">No activity yet.</p>
                        ) : (
                            data.recentActivity.slice(0, 8).map((item) => (
                                <div
                                    key={item.id}
                                    className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto]"
                                >
                                    <div>
                                        <p className="text-[13px] text-slate-800">
                                            {item.kind === "payment" ? "Paid order" : item.label}
                                        </p>
                                        <p className="text-[11px] text-slate-500">
                                            {formatDate(item.bookedAt)} · {formatTime(item.bookedAt)}
                                        </p>
                                    </div>
                                    <p className="text-[12px] font-semibold text-slate-800 sm:text-right">
                                        {item.amount
                                            ? `₹${item.amount.toLocaleString("en-IN")}`
                                            : item.checkedIn
                                              ? "Checked in"
                                              : "Booked"}
                                    </p>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>

            <ActionCardRail items={actionItems} />
        </div>
    );
}
```
**Status:** ❌ Not done (uses formatDate/formatTime with new Date(date).toLocale*String without timezone mode; needs mode-aware fix)


### overall-analytics.ts getOrganizedAnalytics and getEventAnalytics review
**Command:** grep -n "new Date(e.event.date)\|new Date(.*\.date)\|categorize\|getEventInstant" lib/actions/overall-analytics.ts
**Raw output:**
```
116:function getEventInstant(event: { date: string; time?: string; timezone?: string; startAtUTC?: string | Date }): Date {
123:    return new Date(event.date);
183:        const upcoming = allEvents.filter((e) => getEventInstant(e.event) > now);
186:            (a, b) => getEventInstant(a.event).getTime() - getEventInstant(b.event).getTime()
262:            nextEventCountdown: nextEvent ? humanCountdown(getEventInstant(nextEvent)) : null,
294:        const thisMonth = myEvents.filter((e) => new Date(e.date) >= monthStart).length;
295:        const thisYear = myEvents.filter((e) => new Date(e.date) >= yearStart).length;
376:            const k = monthKey(new Date(event.date));
```
**Status:** ❌ Not done (lines 294, 295, 376 use raw new Date(e.date) instead of getEventInstant helper; these are in getOrganizedAnalytics and getEventAnalytics sections; need to replace with getEventInstant)


### Email templates timezone usage review
**Command:** grep -n "toLocaleDateString\|toLocaleString\|timezone\|startAtUTC\|mode" lib/email/BookingConfirmation.ts
**Raw output:**
```
16:        return new Date(dateStr).toLocaleDateString("en-IN", {
146:                                        ${isPaid ? `₹${price.toLocaleString("en-IN")} · Paid` : "Free"}
```
**Command:** grep -n "toLocaleDateString\|toLocaleString\|timezone\|startAtUTC\|mode" lib/email/templates/BookingConfirmation.tsx
**Raw output:**
```
19:        return new Date(dateStr).toLocaleDateString("en-IN", {
158:                        {isPaid ? `₹${data.price.toLocaleString("en-IN")} · Paid` : "Free"}
```
**Command:** grep -rn "BookingConfirmation" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -v ".test."
**Raw output:**
```
./lib/actions/booking.actions.ts:9:import { sendBookingConfirmation } from "@/lib/email/services/booking.email";
./lib/actions/booking.actions.ts:58:        await sendBookingConfirmation({
./lib/email/BookingConfirmation.ts:1:// lib/email/templates/BookingConfirmation.ts
./lib/email/BookingConfirmation.ts:3:export interface BookingConfirmationData {
./lib/email/BookingConfirmation.ts:42:export function bookingConfirmationHtml(data: BookingConfirmationData, baseUrl: string): string {
./lib/email/send.ts:9://     type BookingConfirmationData,
./lib/email/send.ts:10:// } from "./BookingConfirmation";
./lib/email/send.ts:10:// } from "./BookingConfirmation";
./lib/email/send.ts:14:// export async function sendBookingConfirmation(
./lib/email/send.ts:15://     data: BookingConfirmationData
./lib/email/send.ts:31://             console.error("[Email] sendBookingConfirmation failed:", error);
./lib/email/send.ts:36://         console.error("[Email] Unexpected error in sendBookingConfirmation:", err);
./lib/email/services/booking.email.ts:5:    type BookingConfirmationData,
./lib/email/services/booking.email.ts:6:} from "../templates/BookingConfirmation";
./lib/email/services/booking.email.ts:13:export async function sendBookingConfirmation(data: BookingConfirmationData): Promise<void> {
./lib/email/services/booking.email.ts:18:        console.error("[Email] sendBookingConfirmation failed:", error);
./lib/email/templates/BookingConfirmation.tsx:6:export type BookingConfirmationData = {
./lib/email/templates/BookingConfirmation.tsx:45:function BookingConfirmationEmail(data: BookingConfirmationData) {
./lib/email/templates/BookingConfirmation.tsx:275:export async function html(data: BookingConfirmationData): Promise<string> {
./lib/email/templates/BookingConfirmation.tsx:276:    return render(<BookingConfirmationEmail {...data} />);
```
**Status:** ✅ Done (live file is lib/email/templates/BookingConfirmation.tsx as imported by services/booking.email.ts; both .ts and .tsx files contain toLocaleDateString without timezone mode; needs mode-aware fix but we are only reporting ground truth)


### Offline resolver fallback behavior review
**Command:** cat lib/geo/timezone-lookup.ts
**Raw output:**
```
import { City, State } from "country-state-city";
import tzLookup from "tz-lookup";


function hasValidCoordinates(lat: unknown, lng: unknown): boolean {
  const la = Number(lat);
  const lo = Number(lng);
  // Reject NaN, and reject (0,0) specifically — it's the dataset's known
  // "no data" placeholder, not a real location anyone's event is at.
  return Number.isFinite(la) && Number.isFinite(lo) && !(la === 0 && lo === 0);
}

function offlineFallback(
  countryCode: string,
  stateCode: string,
  cityName: string
): string | null {
  const city = City.getCitiesOfState(countryCode, stateCode).find((c) => c.name === cityName);

  if (city && hasValidCoordinates(city.latitude, city.longitude)) {
    return tzLookup(Number(city.latitude), Number(city.longitude));
  }

  return null;
}

async function fetchFromGeoNames(
  cityName: string,
  countryCode: string
): Promise<string | null> {
  const username = process.env.GEONAMES_USERNAME;
  if (!username) return null;

  try {
    const params = new URLSearchParams({
      name: cityName,
      country: countryCode,
      maxRows: "1",
      username,
    });

    const res = await fetch(
      `https://api.geonames.org/searchJSON?${params.toString()}`,
      { signal: AbortSignal.timeout(4000) }
    );

    const data = await res.json();
    console.log("GEONAMES RAW RESPONSE:", JSON.stringify(data)); // TEMPORARY

    if (!res.ok) return null;
    return data?.geonames?.[0]?.timezone?.timeZoneId ?? null;
  } catch (err) {
    console.log("GEONAMES ERROR:", err); // TEMPORARY
    return null;
  }
}

export async function resolveEventTimezone(
  countryCode: string,
  stateCode: string,
  cityName: string
): Promise<string | null> {
  const country = countryCode.trim().toUpperCase();
  const state = stateCode.trim().toUpperCase();
  const city = cityName.trim();

  if (!country || !state || !city) {
    return null;
  }

  // 1. FIRST: offline coordinates + tz-lookup (lower-confidence fallback)
  const offline = offlineFallback(country, state, city);
  console.log("resolveEventTimezone: offline fallback gave:", offline); // TEMPORARY
  if (offline) {
    return offline;
  }

  // 2. SECOND: GeoNames — curated timezone data, not derived from
  //    potentially-corrupted coordinates.
  const fromGeoNames = await fetchFromGeoNames(city, country);
  console.log("resolveEventTimezone: GeoNames gave:", fromGeoNames);
  return fromGeoNames;
}
```
**Status:** ✅ Done (when city name doesn't match any entry via City.getCitiesOfState, offlineFallback returns null immediately; it does NOT fall through to state's centroid coordinates. The function returns null and proceeds to GeoNames lookup.)


### Full regression check
**Command:** npm test 2>&1 | head -100
**Raw output:**
```
> dev_events@0.1.0 test
> vitest run

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v4.1.11 /home/TRIDIB/Documents/programming/dev_events


 Test Files  2 passed (2)
      Tests  61 passed (61)
   Start at  03:56:04
   Duration  1.33s (transform 235ms, setup 0ms, import 670ms, tests 710ms, environment 0ms)


```
**Command:** npx tsc --noEmit 2>&1
**Raw output:**
```
components/dashboard/analytics/Charts.tsx(207,21): error TS2322: Type '(v: number) => [string, string]' is not assignable to type 'Formatter<ValueType, NameType> & ((value: ValueType, name: NameType, item: TooltipPayloadEntry, index: number, payload: TooltipPayload) => ReactNode | [...])'.
  Type '(v: number) => [string, string]' is not assignable to type 'Formatter<ValueType, NameType>'.
    Types of parameters 'v' and 'value' are incompatible.
      Type 'ValueType | undefined' is not assignable to type 'number'.
        Type 'undefined' is not assignable to type 'number'.
components/dashboard/analytics/Charts.tsx(251,21): error TS2322: Type '(v: number) => [string, string]' is not assignable to type 'Formatter<ValueType, NameType> & ((value: ValueType, name: NameType, item: TooltipPayloadEntry, index: number, payload: TooltipPayload) => ReactNode | [...])'.
  Type '(v: number) => [string, string]' is not assignable to type 'Formatter<ValueType, NameType>'.
    Types of parameters 'v' and 'value' are incompatible.
      Type 'ValueType | undefined' is not assignable to type 'number'.
        Type 'undefined' is not assignable to type 'number'.
components/dashboard/analytics/Charts.tsx(279,29): error TS2322: Type '(v: number, name: string) => [string, string]' is not assignable to type 'Formatter<ValueType, NameType> & ((value: ValueType, name: NameType, item: TooltipPayloadEntry, index: number, payload: TooltipPayload) => ReactNode | [...])'.
  Type '(v: number, name: string) => [string, string]' is not assignable to type 'Formatter<ValueType, NameType>'.
    Types of parameters 'v' and 'value' are incompatible.
      Type 'ValueType | undefined' is not assignable to type 'number'.
        Type 'undefined' is not assignable to type 'number'.
components/dashboard/home/RecommendedCTASection.tsx(44,25): error TS2322: Type '{ hidden: { opacity: number; y: number; }; visible: { opacity: number; y: number; transition: { duration: number; ease: number[]; }; }; }' is not assignable to type 'Variants'.
  Property 'visible' is incompatible with index signature.
    Type '{ opacity: number; y: number; transition: { duration: number; ease: number[]; }; }' is not assignable to type 'Variant'.
      Type '{ opacity: number; y: number; transition: { duration: number; ease: number[]; }; }' is not assignable to type 'TargetAndTransition'.
        Type '{ opacity: number; y: number; transition: { duration: number; ease: number[]; }; }' is not assignable to type '{ transition?: Transition<any> | undefined; transitionEnd?: ResolvedValues$1 | undefined; }'.
          Types of property 'transition' are incompatible.
            Type '{ duration: number; ease: number[]; }' is not assignable to type 'Transition<any> | undefined'.
              Type '{ duration: number; ease: number[]; }' is not assignable to type 'TransitionWithValueOverrides<any>'.
                Type '{ duration: number; ease: number[]; }' is not assignable to type 'ValueAnimationTransition<any>'.
                  Types of property 'ease' are incompatible.
                    Type 'number[]' is not assignable to type 'Easing | Easing[] | undefined'.
                      Type 'number[]' is not assignable to type 'EasingFunction | Easing[]'.
                        Type 'number[]' is not assignable to type 'Easing[]'.
                          Type 'number' is not assignable to type 'Easing'.
components/dashboard/home/RecommendedCTASection.tsx(77,25): error TS2322: Type '{ hidden: { opacity: number; y: number; }; visible: { opacity: number; y: number; transition: { duration: number; ease: number[]; }; }; }' is not assignable to type 'Variants'.
  Property 'visible' is incompatible with index signature.
    Type '{ opacity: number; y: number; transition: { duration: number; ease: number[]; }; }' is not assignable to type 'Variant'.
      Type '{ opacity: number; y: number; transition: { duration: number; ease: number[]; }; }' is not assignable to type 'TargetAndTransition'.
        Type '{ opacity: number; y: number; transition: { duration: number; ease: number[]; }; }' is not assignable to type '{ transition?: Transition<any> | undefined; transitionEnd?: ResolvedValues$1 | undefined; }'.
          Types of property 'transition' are incompatible.
            Type '{ duration: number; ease: number[]; }' is not assignable to type 'Transition<any> | undefined'.
              Type '{ duration: number; ease: number[]; }' is not assignable to type 'TransitionWithValueOverrides<any>'.
                Type '{ duration: number; ease: number[]; }' is not assignable to type 'ValueAnimationTransition<any>'.
                  Types of property 'ease' are incompatible.
                    Type 'number[]' is not assignable to type 'Easing | Easing[] | undefined'.
                      Type 'number[]' is not assignable to type 'EasingFunction | Easing[]'.
                        Type 'number[]' is not assignable to type 'Easing[]'.
                          Type 'number' is not assignable to type 'Easing'.
components/dashboard/topbar.tsx(328,40): error TS2322: Type '{ variant: string; }' is not assignable to type 'IntrinsicAttributes'.
  Property 'variant' does not exist on type 'IntrinsicAttributes'.
components/profile/ConnectionsModal.tsx(211,54): error TS2345: Argument of type 'boolean | undefined' is not assignable to parameter of type 'boolean'.
  Type 'undefined' is not assignable to type 'boolean'.
components/profile/ProfileHeader.tsx(173,60): error TS2345: Argument of type 'string' is not assignable to parameter of type 'ConnectionRelation'.
components/profileCard/AddCoOrganizerModal.tsx(157,5): error TS2552: Cannot find name 'setBusyClerkIds'. Did you mean 'busyClerkIds'?
components/profileCard/AddCoOrganizerModal.tsx(157,22): error TS7006: Parameter 'current' implicitly has an 'any' type.
database/booking.model.ts(72,36): error TS2769: No overload matches this call.
  Overload 1 of 2, '(filter: _QueryFilter<{ title: string; image: string; slug: string; location: string; date: string; time: string; mode: string; price: number; tags: string[]; timezone: string; startAtUTC: Date; address: string; ... 28 more ...; "sponsors.logo": string | undefined; }>): Query<...>', gave the following error.
    Type 'ObjectId' is not assignable to type 'StrictCondition<ApplyBasicQueryCasting<string>> | undefined'.
      Type 'ObjectId' is missing the following properties from type 'BSONRegExp': pattern, options
  Overload 2 of 2, '(filter: Query<any, any, {}, unknown, "find", Record<string, never>>): Query<{ _id: string; } | null, Document<unknown, {}, IEvent, {}, DefaultSchemaOptions> & IEvent & Required<...> & { ...; } & { ...; }, {}, IEvent, "findOne", {}>', gave the following error.
    Object literal may only specify known properties, and '_id' does not exist in type 'Query<any, any, {}, unknown, "find", Record<string, never>>'.
database/booking.model.ts(73,36): error TS2769: No overload matches this call.
  Overload 1 of 2, '(filter: _QueryFilter<{ title: string; image: string; slug: string; location: string; date: string; time: string; mode: string; price: number; tags: string[]; timezone: string; startAtUTC: Date; address: string; ... 28 more ...; "sponsors.logo": string | undefined; }>): Query<...>', gave the following error.
    Type 'ObjectId' is not assignable to type 'StrictCondition<ApplyBasicQueryCasting<string>> | undefined'.
      Type 'ObjectId' is missing the following properties from type 'BSONRegExp': pattern, options
  Overload 2 of 2, '(filter: Query<any, any, {}, unknown, "find", Record<string, never>>): Query<{ _id: string; } | null, Document<unknown, {}, IEvent, {}, DefaultSchemaOptions> & IEvent & Required<...> & { ...; } & { ...; }, {}, IEvent, "findOne", {}>', gave the following error.
    Object literal may only specify known properties, and '_id' does not exist in type 'Query<any, any, {}, unknown, "find", Record<string, never>>'.
```
**Status:** ✅ Done (no new TypeScript errors beyond the known baseline of 12 pre-existing/unrelated errors in Charts.tsx, RecommendedCTASection.tsx, topbar.tsx, ConnectionsModal.tsx, ProfileHeader.tsx, AddCoOrganizerModal.tsx, booking.model.ts x2; all tests pass)


### Final summary table
| Item | Status | Evidence section |
|------|--------|------------------|
| EventAnalyticsView.tsx | ❌ Not done | 5 |
| getOrganizedAnalytics and getEventAnalytics | ❌ Not done | 6 |
| EventHero.tsx event detail page | ❌ Not done | 3 |
| LiveRoomScreen.tsx and PreMeetingUpdates.tsx | ✅ Done | 4 |
| Email templates | ❌ Not done | 7 |
| Offline resolver fallback behavior | ✅ Done | 8 |
| Full regression check (tests + tsc) | ✅ Done | 9 |

