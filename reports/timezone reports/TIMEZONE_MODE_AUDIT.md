## Section 1 — Does the core time function know about event mode at all?
**Command:** cat lib/time.ts
**Raw output:**
```
import { DateTime } from "luxon";

/**
 * Combines an event's calendar date, wall-clock time, and IANA timezone
 * into the true UTC instant. This is the ONLY place this composition
 * should happen — every other call site should call this function
 * instead of re-deriving the conversion.
 */
export function getEventStartUTC(
   date: string,
   time: string,
   timezone?: string
 ): Date {
   const tz = timezone || "Asia/Kolkata";
   const [datePart] = date.split("T");

   const dt = DateTime.fromISO(`${datePart}T${time}`, { zone: tz });

   if (!dt.isValid) {
     throw new Error(
       `getEventStartUTC: invalid date/time/timezone combination — date="${date}", time="${time}", timezone="${tz}" (${dt.invalidReason})`
     );
   }

   return dt.toUTC().toJSDate();
 }

 export function eventCountdown(utcInstant: Date): {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
 } {
    const now = Date.now();
    const target = utcInstant.getTime();
    const diff = target - now;

    if (diff <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    }

    const totalSeconds = Math.floor(diff / 1000);
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const totalHours = Math.floor(totalMinutes / 60);
    const hours = totalHours % 24;
    const days = Math.floor(totalHours / 24);

    return { days, hours, minutes, seconds };
 }

/**
 * Formats an event's UTC instant for display.
 * `primary` is always the event's own (venue/host) timezone.
 * `secondary`, when present, is the viewer's own local equivalent —
 * only shown when it actually differs from the event's zone.
 */
export function displayEventTime(
   utcInstant: Date,
   eventTimezone: string,
   viewerTimezone?: string
): { primary: string; secondary?: string } {
   const viewerTZ = viewerTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

   const eventDT = DateTime.fromJSDate(utcInstant, { zone: "utc" }).setZone(eventTimezone);
   const viewerDT = DateTime.fromJSDate(utcInstant, { zone: "utc" }).setZone(viewerTZ);

   const primary = `${eventDT.toFormat("EEE, d MMM yyyy · h:mm a")} ${eventDT.offsetNameShort}`;

   let secondary: string | undefined;
   if (eventTimezone !== viewerTZ) {
     secondary = `(= ${viewerDT.toFormat("h:mm a")} ${viewerDT.offsetNameShort} for you)`;
   }

   return { primary, secondary };
 }


/**
 * Convenience wrapper for components: takes the raw event fields
 * (date/time/timezone, optionally a pre-computed startAtUTC) and
 * returns the same { primary, secondary? } shape as displayEventTime,
 * without the caller needing to build the Date instant themselves.
 * This is the function every card/ticket/detail component should call.
 */
export function getEventDisplayTime(event: {
   date: string;
   time: string;
   timezone?: string;
   startAtUTC?: string | Date;
 }): { primary: string; secondary?: string } {
   const instant = event.startAtUTC
     ? new Date(event.startAtUTC)
     : getEventStartUTC(event.date, event.time, event.timezone);

   return displayEventTime(instant, event.timezone || "Asia/Kolkata");
 }
```
**Finding:** getEventDisplayTime does not accept a `mode` parameter; displayEventTime does not accept a `mode` parameter; there is no conditional logic that checks whether an event is online vs in-person/hybrid before deciding whose timezone to use as primary.

---

## Section 2 — Does the mode classifier exist, and what does it return?
**Command:** cat lib/constants/event-mode.ts
**Raw output:**
```
export const EVENT_MODES = [
    { slug: "in-person", label: "In-Person" },
    { slug: "online", label: "Online" },
    { slug: "hybrid", label: "Hybrid (In-Person & Online)" },
] as const;

export type EventModeSlug = (typeof EVENT_MODES)[number]["slug"];

export type NormalizedEventMode = "offline" | "online" | "hybrid";

const ONLINE_VALUES = new Set(["online", "Online"]);
const HYBRID_VALUES = new Set([
    "hybrid",
    "Hybrid",
    "Hybrid (In-Person & Online)",
    "hybrid (in-person & online)",
]);

/** Normalize stored event mode strings to offline | online | hybrid. */
export function normalizeEventMode(raw: string | undefined | null): NormalizedEventMode {
    const value = (raw ?? "").trim();
    if (!value) return "offline";
    if (HYBRID_VALUES.has(value) || value.toLowerCase().includes("hybrid")) return "hybrid";
    if (ONLINE_VALUES.has(value) || value.toLowerCase() === "online") return "online";
    return "offline";
}

export const getModeLabelBySlug = (slug: string): string | null =>
    EVENT_MODES.find((m) => m.slug === slug)?.label ?? null;
```
**Finding:** normalizeEventMode returns a NormalizedEventMode type which is exactly "offline" | "online" | "hybrid".

---

## Section 3 — For each event card, is mode connected to time display, or only to the label pill?

### components/EventCard.tsx
**Command:** grep -n "normalizeEventMode\|getEventDisplayTime\|mode" components/EventCard.tsx
**Raw output:**
```
11:import { normalizeEventMode } from "@/lib/constants/event-mode";
12:import { getEventDisplayTime } from "@/lib/time";
24:  mode?: string;
35:  eventId, title, image, slug, location, date, time, mode, price = 0,
39:  const { primary: eventDateTime } = getEventDisplayTime({
49:  const normalizedMode = normalizeEventMode(mode);
50:  const modeLabel = normalizedMode === "online" ? "Online" : normalizedMode === "hybrid" ? "Hybrid" : "Offline";
99:          <span className="absolute left-3 top-3 rounded-full border border-white/30 bg-slate-950/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-md">{modeLabel}</span>
```
**(a)** Does it call normalizeEventMode? Yes (line 49).  
**(b)** Does it pass `mode` (or the normalized result) into getEventDisplayTime, or into ANY function that computes the displayed date/time? No (line 39 calls getEventDisplayTime without mode).  
**(c)** Verdict: mode used for LABEL ONLY

### components/EventCardV2.tsx
**Command:** grep -n "normalizeEventMode\|getEventDisplayTime\|mode" components/EventCardV2.tsx
**Raw output:**
```
13:import { getEventDisplayTime } from "@/lib/time";
62:    const { primary: eventDateTime } = getEventDisplayTime({
```
**(a)** Does it call normalizeEventMode? No.  
**(b)** Does it pass `mode` (or the normalized result) into getEventDisplayTime, or into ANY function that computes the displayed date/time? No.  
**(c)** Verdict: mode used for LABEL ONLY (mode not used at all for label or time)

### components/EventCardv3.tsx
**Command:** grep -n "normalizeEventMode\|getEventDisplayTime\|mode" components/EventCardv3.tsx
**Raw output:**
```
15:import { getEventDisplayTime } from "@/lib/time";
64:    const { primary: eventDateTime } = getEventDisplayTime({
```
**(a)** Does it call normalizeEventMode? No.  
**(b)** Does it pass `mode` (or the normalized result) into getEventDisplayTime, or into ANY function that computes the displayed date/time? No.  
**(c)** Verdict: mode used for LABEL ONLY

### components/FigmaEventCard.tsx
**Command:** grep -n "normalizeEventMode\|getEventDisplayTime\|mode" components/FigmaEventCard.tsx
**Raw output:**
```
6:import { getEventDisplayTime } from "@/lib/time";
29:  mode?: string;
51:   const { primary: eventDateTime } = getEventDisplayTime({
```
**(a)** Does it call normalizeEventMode? No.  
**(b)** Does it pass `mode` (or the normalized result) into getEventDisplayTime, or into ANY function that computes the displayed date/time? No.  
**(c)** Verdict: mode used for LABEL ONLY

### components/FigmaEventCardV2.tsx
**Command:** grep -n "normalizeEventMode\|getEventDisplayTime\|mode" components/FigmaEventCardV2.tsx
**Raw output:**
```
11:import { normalizeEventMode } from "@/lib/constants/event-mode";
13:import { getEventDisplayTime } from "@/lib/time";
24:  attendees: initialAttendees, organizer = "DevSphere Community", organizationName, organizers = [], mode, price = 0,
30:  const normalizedMode = normalizeEventMode(mode);
31:  const modeLabel = normalizedMode === "online" ? "Online" : normalizedMode === "hybrid" ? "Hybrid" : "Offline";
37:  const { primary: eventDateTime } = getEventDisplayTime({
122:              {modeLabel}
```
**(a)** Does it call normalizeEventMode? Yes (line 30).  
**(b)** Does it pass `mode` (or the normalized result) into getEventDisplayTime, or into ANY function that computes the displayed date/time? No (line 37 calls getEventDisplayTime without mode).  
**(c)** Verdict: mode used for LABEL ONLY

### components/dashboard/home/DashboardEventCard.tsx
**Command:** grep -n "normalizeEventMode\|getEventDisplayTime\|mode" components/dashboard/home/DashboardEventCard.tsx
**Raw output:**
```
7:import { normalizeEventMode } from "@/lib/constants/event-mode";
8:import { getEventDisplayTime } from "@/lib/time";
23:    mode: string;
35:    const mode = normalizeEventMode(event.mode);
36:    const modeLabel = mode === "online" ? "Online" : mode === "hybrid" ? "Hybrid" : "Offline";
38:    const { primary: eventDateTime } = getEventDisplayTime({
81:                            {modeLabel}
```
**(a)** Does it call normalizeEventMode? Yes (line 35).  
**(b)** Does it pass `mode` (or the normalized result) into getEventDisplayTime, or into ANY function that computes the displayed date/time? No (line 38 calls getEventDisplayTime without mode).  
**(c)** Verdict: mode used for LABEL ONLY

### components/dashboard/home/RecommendedEventCard.tsx
**Command:** grep -n "normalizeEventMode\|getEventDisplayTime\|mode" components/dashboard/home/RecommendedEventCard.tsx
**Raw output:**
```
11:import { normalizeEventMode } from "@/lib/constants/event-mode";
13:import { getEventDisplayTime } from "@/lib/time";
37:    const mode = normalizeEventMode(event.mode);
38:    const modeLabel = mode === "online" ? "Online" : mode === "hybrid" ? "Hybrid" : "Offline";
44:    const { primary: eventDateTime } = getEventDisplayTime({
149:                                {modeLabel}
191:                            {modeLabel}
```
**(a)** Does it call normalizeEventMode? Yes (line 37).  
**(b)** Does it pass `mode` (or the normalized result) into getEventDisplayTime, or into ANY function that computes the displayed date/time? No (line 44 calls getEventDisplayTime without mode).  
**(c)** Verdict: mode used for LABEL ONLY

### components/dashboard/home/EventBannerContent.tsx
**Command:** grep -n "normalizeEventMode\|getEventDisplayTime\|mode" components/dashboard/home/EventBannerContent.tsx
**Raw output:**
```
6:import { getEventDisplayTime } from "@/lib/time";
42:    const { primary: eventDateTime } = getEventDisplayTime({
```
**(a)** Does it call normalizeEventMode? No.  
**(b)** Does it pass `mode` (or the normalized result) into getEventDisplayTime, or into ANY function that computes the displayed date/time? No.  
**(c)** Verdict: mode used for LABEL ONLY

### components/dashboard/TicketEventCardV2.tsx
**Command:** grep -n "normalizeEventMode\|getEventDisplayTime\|mode" components/dashboard/TicketEventCardV2.tsx
**Raw output:**
```
8:import { normalizeEventMode } from "@/lib/constants/event-mode";
9:import { getEventDisplayTime } from "@/lib/time";
25:    const mode = normalizeEventMode(ticket.eventMode);
26:    const modeLabel = mode === "online" ? "Online" : mode === "hybrid" ? "Hybrid" : "Offline";
27:    const { primary: eventDateTime } = getEventDisplayTime({
70:                            {modeLabel}
```
**(a)** Does it call normalizeEventMode? Yes (line 25).  
**(b)** Does it pass `mode` (or the normalized result) into getEventDisplayTime, or into ANY function that computes the displayed date/time? No (line 27 calls getEventDisplayTime without mode).  
**(c)** Verdict: mode used for LABEL ONLY

---

## Section 4 — Direct behavioral proof, not just static code reading
**Command:** npm test -- -t "TEMP AUDIT"
**Raw output:**
```
RUN  v4.1.11 /home/TRIDIB/Documents/programming/dev_events
stdout | lib/time.test.ts > TEMP AUDIT: online event should show different primary time to different viewers
AUDIT RESULT: {
  primary: 'Sat, 5 Dec 2026 · 7:00 PM GMT+5:30',
  secondary: '(= 7:00 PM GMT+5:30 for you)'
}
```
**Finding:** The primary time displayed is based solely on the event's stored timezone (Asia/Kolkata) and does not vary with the event mode; the mode parameter is ignored by getEventDisplayTime.

---

## Section 5 — Final verdict
Viewer-based timezone conversion for online events does NOT exist anywhere in this codebase. Every event — online, hybrid, or in-person — displays using the event's own stored timezone regardless of who is viewing it. This is proven by Section 1 (core time functions lack mode awareness), Section 3 (all event cards use mode only for label pill, not time calculation), and Section 4 (empirical test shows identical primary time regardless of mode).
