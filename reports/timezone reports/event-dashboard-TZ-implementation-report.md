# Event Dashboard UTC and Multi-Viewer Timezone Implementation Report

**Date:** 2026-09-11  
**Source:** Working-tree implementation diff and verification commands  
**Related audit:** [event-dashboard-TZ-audit.md](/home/TRIDIB/Documents/programming/dev_events/event-dashboard-TZ-audit.md)

## Executive summary

The timezone migration was implemented as an additive change. The system now separates:

- Absolute event/activity instants, stored and compared as UTC-compatible `Date`/ISO values.
- Display representation, calculated from event mode, event timezone, and viewer timezone.

The event dashboard and attendee-facing event schedule now use the shared timezone contract. Main dashboard layouts, booking flow, payment flow, navigation, and ticket validation flow were preserved.

| Event type/data | Primary display | Secondary context |
|---|---|---|
| Online schedule | Viewer local timezone | Host/event timezone |
| In-person schedule | Event/venue timezone | Viewer local equivalent |
| Hybrid schedule | Event/venue timezone | Viewer local equivalent |
| Registration/activity timestamp | Viewer local timezone | Timezone abbreviation |
| Analytics periods | Event timezone | Reporting timezone shown |

## Diff scope

The implementation diff changes 19 tracked files and adds two reusable components. The working tree also contains the previously created audit report.

| Resource | Purpose |
|---|---|
| [components/EventScheduleDisplay.tsx](/home/TRIDIB/Documents/programming/dev_events/components/EventScheduleDisplay.tsx) | Hydration-safe event schedule display for public and attendee-facing pages. |
| [components/ViewerTimestamp.tsx](/home/TRIDIB/Documents/programming/dev_events/components/ViewerTimestamp.tsx) | Hydration-safe viewer-local rendering for absolute timestamps. |

The tracked diff is approximately **421 additions and 192 removals**. `git diff --check` passes.

## Shared time foundation

### [lib/time.ts](/home/TRIDIB/Documents/programming/dev_events/lib/time.ts:3)

### What changed

- Added `DEFAULT_EVENT_TIMEZONE` with the existing legacy fallback of `Asia/Kolkata`.
- Added `EventScheduleInput` and `ResolvedEventSchedule` contracts.
- Added IANA validation through `isValidEventTimezone()`.
- Added `resolveEventSchedule()`.
- Updated `getEventDisplayTime()` with an optional explicit viewer timezone while preserving existing callers.
- Added `formatViewerTimestamp()` for absolute audit timestamps.
- Added `reportingDateKey()` and `formatReportingDateKey()` for explicit calendar-zone grouping.

### Why

Previously, individual surfaces could independently interpret `date` and `time` as browser-local time, UTC, or event-local time. The resolver now follows one order:

1. Use valid stored `startAtUTC`.
2. Otherwise derive from `date + time + timezone`.
3. Use the legacy Asia/Kolkata fallback when timezone data is missing or invalid.
4. Mark the result as legacy so the dashboard can warn without blocking users.

## Database and event write behavior

### [database/event.model.ts](/home/TRIDIB/Documents/programming/dev_events/database/event.model.ts:270)

### What changed

- Added validation for non-empty IANA timezone values.
- Preserved the existing `timezone` and `startAtUTC` fields.
- New events receive the default timezone only when none is supplied.
- New events calculate `startAtUTC` after date/time normalization.
- Existing records are not rewritten simply because they are read.
- Explicit date/time/timezone changes recalculate `startAtUTC`.

### Why

The database already had the correct fields, so no collection redesign was needed. The missing guarantee was that new events receive a complete canonical schedule while legacy records remain readable.

## Gate, access, and operations

### [lib/actions/gate.actions.ts](/home/TRIDIB/Documents/programming/dev_events/lib/actions/gate.actions.ts:133)

- Removed the old `setUTCHours()` event-start calculation.
- Gate parsing prefers stored `startAtUTC`.
- Legacy fallback uses `getEventStartUTC(date, time, timezone)`.
- Ticket expiry and online/hybrid automatic check-in windows use the canonical event instant.
- Timing queries now select `timezone` and `startAtUTC`.

The old implementation treated an event wall-clock time as UTC. The new implementation keeps gate verification, manual check-in, room auto-check-in, and displayed event time aligned worldwide.

### [lib/event-dashboard/access.ts](/home/TRIDIB/Documents/programming/dev_events/lib/event-dashboard/access.ts:26)

- Dashboard context now includes `timezone`, `startAtUTC`, and `isLegacySchedule`.
- Accessible event sorting prefers `startAtUTC`.
- Event queries select the complete schedule contract.

This was necessary because child dashboard components previously received only raw `date` and `time`.

## Overview and reporting periods

### [lib/event-dashboard/overview.ts](/home/TRIDIB/Documents/programming/dev_events/lib/event-dashboard/overview.ts:25)

- Overview data now includes timezone, canonical UTC start, and legacy status.
- Daily application series uses Luxon and the event timezone.
- “Today”, last-7-day, and prior-7-day boundaries use event-local midnight.
- Booking/order instants remain absolute and are grouped into event-local calendar days.
- Chart periods are capped using the canonical event instant.

### [app/(dashboard)/dashboard/events/[eventId]/overview/page.tsx](/home/TRIDIB/Documents/programming/dev_events/app/(dashboard)/dashboard/events/[eventId]/overview/page.tsx:28)

- Passes timezone, `startAtUTC`, and mode into `EventHero`.
- Shows a non-blocking legacy schedule warning.
- Displays the reporting timezone with the applications chart.

The reason is consistency: all organizers and co-organizers should see the same event reporting day regardless of their browser or server timezone.

## Dashboard UI changes

### [components/event-dashboard/shared/EventHero.tsx](/home/TRIDIB/Documents/programming/dev_events/components/event-dashboard/shared/EventHero.tsx:25)

- Removed viewer-timezone parsing of raw event wall-clock values.
- Uses `resolveEventSchedule()` and `displayEventTime()`.
- Countdown uses the canonical UTC instant.
- Online events show viewer time with host context.
- Physical/hybrid events show event time with viewer context.
- Invalid dates safely render “Date not set”.
- `useSyncExternalStore` prevents server/client timezone hydration mismatch.

### [components/event-dashboard/shell/EventSwitcher.tsx](/home/TRIDIB/Documents/programming/dev_events/components/event-dashboard/shell/EventSwitcher.tsx:20)

Event switcher labels now use the shared schedule formatter instead of formatting only the raw date. This prevents ambiguous date-only labels and keeps online event labels viewer-aware.

### [components/event-dashboard/shared/DailyApplicationsChart.tsx](/home/TRIDIB/Documents/programming/dev_events/components/event-dashboard/shared/DailyApplicationsChart.tsx:14)

The chart now accepts and displays the reporting timezone so users know which calendar generated the buckets.

## Applicants, organizers, activity, and analytics

### [lib/event-dashboard/applicants.ts](/home/TRIDIB/Documents/programming/dev_events/lib/event-dashboard/applicants.ts:18)

“Today’s signups” now uses event-local midnight and returns `reportingTimezone`.

### [components/event-dashboard/applicants/ApplicantsPanel.tsx](/home/TRIDIB/Documents/programming/dev_events/components/event-dashboard/applicants/ApplicantsPanel.tsx:18)  
### [components/event-dashboard/organizers/OrganizersPanel.tsx](/home/TRIDIB/Documents/programming/dev_events/components/event-dashboard/organizers/OrganizersPanel.tsx:28)  
### [components/event-dashboard/shared/ActivityFeed.tsx](/home/TRIDIB/Documents/programming/dev_events/components/event-dashboard/shared/ActivityFeed.tsx:8)

Registration, invite, response, and activity timestamps now render in each viewer’s local timezone with a timezone abbreviation. UTC ordering remains unchanged because these values represent absolute moments, not event schedule times.

### [lib/actions/overall-analytics.ts](/home/TRIDIB/Documents/programming/dev_events/lib/actions/overall-analytics.ts:50)

- Event analytics now returns `timezone`, `startAtUTC`, and `reportingTimezone`.
- Event-specific monthly, daily, and weekday grouping uses the event timezone.
- Booking/order instants are converted only for calendar grouping.
- Event schedule output uses the canonical instant with legacy fallback.

This makes analytics stable for every co-organizer. A pre-existing working-tree modification in this file was present before the timezone implementation and was preserved; the timezone-specific changes were added alongside it.

### [components/event-dashboard/analytics/EventAnalyticsView.tsx](/home/TRIDIB/Documents/programming/dev_events/components/event-dashboard/analytics/EventAnalyticsView.tsx:1)

Recent activity uses viewer-local timestamp rendering, while the booking heatmap identifies its event reporting timezone.

## Settings and attendee-facing display

### [lib/event-dashboard/settings.schema.ts](/home/TRIDIB/Documents/programming/dev_events/lib/event-dashboard/settings.schema.ts:53)  
### [app/(dashboard)/dashboard/events/[eventId]/settings/page.tsx](/home/TRIDIB/Documents/programming/dev_events/app/(dashboard)/dashboard/events/[eventId]/settings/page.tsx:85)

Settings now reads and displays timezone plus `startAtUTC`, uses the shared schedule display, and warns when the event is using legacy fallback data. This gives organizers a place to verify the event’s authoritative timezone.

### [components/EventScheduleDisplay.tsx](/home/TRIDIB/Documents/programming/dev_events/components/EventScheduleDisplay.tsx:6)

This client component detects the browser timezone after hydration. It uses a stable event-zone fallback during server rendering, then updates online-event display to the attendee’s local time.

### [app/(site)/events/[slug]/page.tsx](/home/TRIDIB/Documents/programming/dev_events/app/(site)/events/[slug]/page.tsx:120)

Public event details now use the shared mode-aware schedule. Similar event data also receives timezone/start-instant fields where available, so attendees see the same interpretation before booking.

### [components/ViewerTimestamp.tsx](/home/TRIDIB/Documents/programming/dev_events/components/ViewerTimestamp.tsx:6)

This component prevents server/client markup differences while rendering booking, invite, and activity timestamps in the current viewer’s local timezone.

## Compatibility decisions

- No new database collection or destructive schema migration was introduced.
- No automatic legacy backfill was run.
- Existing incomplete events remain usable through fallback behavior and are marked in the dashboard.
- Existing shared time consumers remain compatible because new parameters are optional.
- Main dashboard layouts and booking/payment business workflows were not redesigned.
- Order, booking, payment, join, and check-in timestamps remain absolute UTC instants.

## Verification

### Passed

- `npm test -- --run`: **64 tests passed**.
- Tests cover India, Nepal, US DST, UTC, Australia DST, mode-aware display, reporting-zone grouping, and invalid legacy timezone fallback.
- Targeted TypeScript check for changed timezone/dashboard paths: no errors.
- Targeted ESLint for migration paths: no errors; only the existing unused `_patch` warning remains in the read-only settings action.
- `git diff --check`: passed.

### Known repository conditions

- Full repository TypeScript checking still reports unrelated pre-existing errors in dashboard charts, motion variants, profile components, and booking model typing.
- `npm run build` was started but stalled in Next.js/Turbopack without producing a diagnostic; it was stopped after no progress was reported.
- The settings update action remains intentionally read-only/not implemented.
- No legacy database backfill has been run.

## Recommended follow-up

1. Investigate the Next.js/Turbopack build stall independently.
2. Add a controlled legacy backfill script with confidence and audit logging.
3. Add browser-level tests with emulated timezones for online attendees and organizers.
4. If email-local time is required, store or capture a user timezone preference; email generation has no browser timezone by default.
