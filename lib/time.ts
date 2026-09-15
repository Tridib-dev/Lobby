import { DateTime } from "luxon";

export const DEFAULT_EVENT_TIMEZONE = "Asia/Kolkata";

export interface EventScheduleInput {
  date: string;
  time: string;
  timezone?: string;
  startAtUTC?: string | Date;
  mode?: string;
}

export interface ResolvedEventSchedule {
  instant: Date;
  timezone: string;
  isLegacy: boolean;
}

export interface EmailEventDisplayTime {
  primaryLabel: string;
  primary: string;
  secondaryLabel?: string;
  secondary?: string;
  isLegacy: boolean;
}

export function isValidEventTimezone(timezone?: string): boolean {
  return Boolean(timezone && DateTime.local().setZone(timezone).isValid);
}

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
  const tz = timezone || DEFAULT_EVENT_TIMEZONE;
  const [datePart] = date.split("T");

  const dt = DateTime.fromISO(`${datePart}T${time}`, { zone: tz });

  if (!dt.isValid) {
    throw new Error(
      `getEventStartUTC: invalid date/time/timezone combination — date="${date}", time="${time}", timezone="${tz}" (${dt.invalidReason})`
    );
  }

  return dt.toUTC().toJSDate();
}

/**
 * Resolves the one absolute instant used by event state and display code.
 * Existing records without the new fields remain readable and are marked
 * legacy so callers can surface/observe the fallback without blocking them.
 */
export function resolveEventSchedule(event: EventScheduleInput): ResolvedEventSchedule {
  const timezone = isValidEventTimezone(event.timezone)
    ? event.timezone!
    : DEFAULT_EVENT_TIMEZONE;

  if (event.startAtUTC) {
    const instant = new Date(event.startAtUTC);
    if (!Number.isNaN(instant.getTime())) {
      return { instant, timezone, isLegacy: !event.timezone || timezone !== event.timezone };
    }
  }

  try {
    return {
      instant: getEventStartUTC(event.date, event.time, timezone),
      timezone,
      isLegacy: true,
    };
  } catch {
    const fallback = new Date(event.date);
    if (!Number.isNaN(fallback.getTime())) {
      return { instant: fallback, timezone, isLegacy: true };
    }
    return { instant: new Date(0), timezone, isLegacy: true };
  }
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
 * Two IANA zone strings can represent the exact same real-world
 * timezone under different names (e.g. "Asia/Kolkata" and its legacy
 * alias "Asia/Calcutta"). A naive string comparison treats these as
 * different, producing a redundant secondary line that shows the same
 * time twice under different labels. Compare by actual computed
 * offset name instead of raw string identity.
 */
function isSameRealZone(zoneA: string, zoneB: string, at: Date): boolean {
  if (zoneA === zoneB) return true;
  const a = DateTime.fromJSDate(at, { zone: "utc" }).setZone(zoneA);
  const b = DateTime.fromJSDate(at, { zone: "utc" }).setZone(zoneB);
  return a.offset === b.offset && a.offsetNameShort === b.offsetNameShort;
}

/**
 * Formats an event's UTC instant for display.
 *
 * For in-person or hybrid events: `primary` is always the event's own
 * (venue/host) timezone — the physical place is what matters, no
 * matter where the viewer is browsing from.
 *
 * For fully online events: `primary` is the VIEWER's own local time —
 * there's no physical place to anchor to, so each viewer sees the
 * event converted into their own clock. `secondary`, when shown, is
 * the host's own time, for coordination context.
 */
export function displayEventTime(
  utcInstant: Date,
  eventTimezone: string,
  viewerTimezone?: string,
  mode?: string
): { primary: string; secondary?: string } {
  const viewerTZ = viewerTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const isOnline = normalizeEventModeInline(mode) === "online";

  const eventDT = DateTime.fromJSDate(utcInstant, { zone: "utc" }).setZone(eventTimezone);
  const viewerDT = DateTime.fromJSDate(utcInstant, { zone: "utc" }).setZone(viewerTZ);

  const sameZone = isSameRealZone(eventTimezone, viewerTZ, utcInstant);

  if (isOnline) {
    // Viewer's own time is the headline; host's time is secondary context.
    const primary = `${viewerDT.toFormat("EEE, d MMM yyyy · h:mm a")} ${viewerDT.offsetNameShort}`;
    const secondary = sameZone
      ? undefined
      : `(host's time: ${eventDT.toFormat("h:mm a")} ${eventDT.offsetNameShort})`;
    return { primary, secondary };
  }

  // In-person / hybrid — venue's time is the headline, unchanged behavior.
  const primary = `${eventDT.toFormat("EEE, d MMM yyyy · h:mm a")} ${eventDT.offsetNameShort}`;
  const secondary = sameZone
    ? undefined
    : `(= ${viewerDT.toFormat("h:mm a")} ${viewerDT.offsetNameShort} for you)`;
  return { primary, secondary };
}

// Local, dependency-free copy of the same normalization used in
// lib/constants/event-mode.ts — kept intentionally minimal here so
// lib/time.ts doesn't need to import from constants. Only "online"
// needs to be distinguished at this layer.
function normalizeEventModeInline(raw: string | undefined | null): "online" | "other" {
  const value = (raw ?? "").trim().toLowerCase();
  return value === "online" ? "online" : "other";
}

/**
 * Convenience wrapper for components: takes the raw event fields
 * (date/time/timezone, optionally a pre-computed startAtUTC, and the
 * event's mode) and returns the same { primary, secondary? } shape as
 * displayEventTime, without the caller needing to build the Date
 * instant themselves. This is the function every card/ticket/detail
 * component should call.
 */
export function getEventDisplayTime(
  event: EventScheduleInput,
  mode?: string,
  viewerTimezone?: string
): { primary: string; secondary?: string } {
  const { instant, timezone } = resolveEventSchedule(event);
  const effectiveMode = mode ?? event.mode;
  return displayEventTime(instant, timezone, viewerTimezone, effectiveMode);
}

function formatZonedEventTime(instant: Date, timezone: string): string {
  const dateTime = DateTime.fromJSDate(instant, { zone: "utc" }).setZone(timezone);
  return `${dateTime.toFormat("EEEE, d MMMM yyyy · h:mm a")} ${dateTime.offsetNameShort}`;
}

/**
 * Formats a transactional-email schedule without ever treating the server's
 * timezone as the recipient's timezone. Email is rendered on the server, so a
 * recipient timezone must be supplied explicitly to show a local online time.
 */
export function getEmailEventDisplayTime(
  event: EventScheduleInput,
  recipientTimezone?: string
): EmailEventDisplayTime {
  const { instant, timezone, isLegacy } = resolveEventSchedule(event);
  const eventTime = formatZonedEventTime(instant, timezone);
  const viewerTimezone = isValidEventTimezone(recipientTimezone) ? recipientTimezone : undefined;
  const isOnline = normalizeEventModeInline(event.mode) === "online";

  if (!viewerTimezone) {
    return {
      primaryLabel: isOnline ? "Event time (host timezone)" : "Event time",
      primary: eventTime,
      isLegacy,
    };
  }

  const viewerTime = formatZonedEventTime(instant, viewerTimezone);
  const sameZone = isSameRealZone(timezone, viewerTimezone, instant);

  if (isOnline) {
    return {
      primaryLabel: "Your local time",
      primary: viewerTime,
      secondaryLabel: sameZone ? undefined : "Host time",
      secondary: sameZone ? undefined : eventTime,
      isLegacy,
    };
  }

  return {
    primaryLabel: "Event time",
    primary: eventTime,
    secondaryLabel: sameZone ? undefined : "Your local time",
    secondary: sameZone ? undefined : viewerTime,
    isLegacy,
  };
}

/** Formats an absolute audit timestamp in the current viewer's local zone. */
export function formatViewerTimestamp(value: string | Date, includeDate = true): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(undefined, {
    ...(includeDate ? { day: "numeric", month: "short", year: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

/** Returns a stable calendar key in an explicit IANA reporting zone. */
export function reportingDateKey(value: Date | string, timezone: string): string {
  const date = value instanceof Date ? value : new Date(value);
  return DateTime.fromJSDate(date, { zone: "utc" }).setZone(timezone).toISODate() ?? "invalid";
}

export function formatReportingDateKey(key: string, timezone: string): string {
  const date = DateTime.fromISO(key, { zone: timezone });
  return date.isValid ? date.toFormat("d LLL") : "—";
}
