# Event Dashboard Timezone Audit

**Audit date:** 2026-09-11\
**Scope:** `/dashboard/events/[eventId]` and its dashboard-only data providers, shared time utilities, event-start authorization paths, and dashboard event-switching/settings surfaces.\
**Objective:** Make the multi-viewer event dashboard correct and understandable for organizers/co-organizers and international users viewing the same event from different timezones.

## Executive conclusion

Yes, the event dashboard needs changes in the backend contracts, server-side date bucketing, and UI formatting. The database model and `lib/time.ts` already contain the beginnings of the intended design (`timezone` as an IANA zone plus `startAtUTC` as the absolute instant), but the dashboard does not consistently carry or use those values.

The highest-impact issue is the overview hero:

* `EventOverviewData.event` does not include `timezone` or `startAtUTC`.

* The overview page therefore calls `EventHero` with only `date` and `time`.

* `EventHero` falls back to the viewer's browser timezone while parsing the event wall-clock time, then formats the date in UTC and prints the raw wall-clock time. This can show an internally inconsistent date/time and can produce a different countdown for viewers in different zones.

The second major issue is calendar aggregation. Overview and event analytics use JavaScript server-local boundaries and `toLocaleDateString("en-IN")` for “today”, daily buckets, monthly buckets, and weekday buckets. A multi-viewer dashboard should define these buckets explicitly—normally in the event/organizer reporting zone—and not depend on the deployment machine's timezone.

Absolute audit timestamps such as registration time, invite time, and activity time are less dangerous: they are stored as `Date` values and are rendered in the browser's local zone. They still need an explicit timezone label or a consistent viewer-local convention so an international co-organizer can interpret them correctly.

## Timezone policy to implement

1. Store/return the event's IANA timezone and canonical UTC start instant together.
2. Use `startAtUTC` for countdowns, ordering, status, access windows, and comparisons.
3. For in-person and hybrid events, show the venue/event timezone as the primary event schedule.
4. For online events, show the viewer's local time as primary, with the host/event timezone as secondary context.
5. For audit timestamps (registered, invited, activity), show viewer-local time with an explicit “your time” affordance or a visible zone abbreviation.
6. Use one explicit reporting zone for dashboard aggregates. Recommended default: the event timezone, with an optional organizer timezone preference later. Do not let Node process timezone decide reporting boundaries.
7. Keep `en-IN` as a locale only where the product intentionally wants Indian formatting; it is not a timezone solution. Money formatting and time formatting should be separate concerns.

## Findings by severity

| Severity | Finding                                                                                                                                   | Impact                                                                                                                   |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **P0**   | `EventHero` does not receive `timezone`/`startAtUTC`; it parses with the viewer zone and formats the date in UTC.                         | Wrong schedule presentation and potentially wrong countdown for international viewers.                                   |
| **P0**   | `lib/actions/gate.actions.ts` still parses event date/time as UTC by calling `setUTCHours`, ignoring the event timezone and `startAtUTC`. | Check-in/expiry windows can be wrong for events outside the legacy UTC/India assumption.                                 |
| **P1**   | Overview “today”, last-7-day windows, and daily chart buckets use server-local calendar boundaries.                                       | Counts and chart labels differ by deployment timezone and do not necessarily match the event's local calendar.           |
| **P1**   | Event analytics monthly/daily/weekday buckets use server-local `Date` methods and return no timezone metadata.                            | International organizers can see misleading period grouping and cannot tell which zone the report represents.            |
| **P1**   | Dashboard context, overview data, analytics data, and settings summary omit timezone/startAtUTC.                                          | UI components cannot implement a consistent display contract.                                                            |
| **P1**   | Event switcher sorts/formats from `date` rather than the canonical start instant and hides the timezone.                                  | Events can be ordered incorrectly around timezone boundaries and the selected schedule is ambiguous.                     |
| **P2**   | Applicant, organizer, activity, and analytics timestamps use browser-local output but no zone label; locale is hardcoded to `en-IN`.      | Timestamps are readable but ambiguous for international co-organizers and inconsistent with product locale expectations. |
| **P2**   | `database/event.model.ts` allows arbitrary/empty timezone strings and does not visibly enforce the `startAtUTC` invariant on updates.     | Invalid or stale timezone data can reintroduce fallback behavior.                                                        |
| **P2**   | Dashboard sorting in `lib/actions/dashboard.actions.ts` uses `date` in places where `startAtUTC` should be authoritative.                 | Event lists can be misordered for legacy or cross-zone records.                                                          |

## File-by-file audit and recommended changes

### Core contracts and data layer

| File                                                           | Current state                                                                                                                                                                   | Recommended change                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `database/event.model.ts`                                      | Has optional `timezone` and indexed `startAtUTC`; `date` remains a normalized ISO string and timezone has no IANA validation.                                                   | Add a validator for valid IANA zones (with a deliberate legacy fallback). Define and enforce the invariant that every new event has `timezone` and `startAtUTC`. On schedule edits, recompute `startAtUTC` from date + wall-clock time + timezone. Add a migration strategy for legacy records rather than silently guessing. |
| `lib/time.ts`                                                  | Correctly centralizes date/time composition and has mode-aware `displayEventTime`; `getEventDisplayTime` does not accept an explicit viewer zone or return structured metadata. | Make this the only dashboard display entry point. Add typed helpers for `eventInstant`, event schedule display, viewer-zone detection, and explicit reporting-zone calendar keys. Return the IANA/offset label separately where UI needs it. Handle invalid legacy data without rendering `Invalid Date`.                     |
| `lib/event-dashboard/types.ts`                                 | Only activity item types exist.                                                                                                                                                 | Add shared dashboard schedule/reporting types, e.g. `{ startAtUTC, timezone, mode }` and `{ reportingTimezone }`, so pages do not create incompatible local contracts.                                                                                                                                                        |
| `lib/event-dashboard/access.ts`                                | Event query selects no `timezone` or `startAtUTC`; context omits both; accessible-event sort uses `date`.                                                                       | Select and return both fields. Sort accessible events by `startAtUTC`, with a legacy fallback through `getEventStartUTC`. Pass the schedule through the provider to every dashboard surface.                                                                                                                                  |
| `lib/actions/dashboard.actions.ts`                             | Organized event items return timezone/startAtUTC, but list ordering still uses `date` in places and status logic has mixed legacy fallbacks.                                    | Sort by canonical instant. Make the legacy fallback use the event timezone, and expose a clear `scheduleSource`/legacy flag if records are incomplete so the UI can warn rather than silently mislead.                                                                                                                        |
| `lib/event-dashboard/settings.schema.ts`                       | Settings summary/query omits timezone and startAtUTC; update patch has no timezone.                                                                                             | Include `timezone` and `startAtUTC` in the read model. When editing is implemented, require an IANA timezone and recompute the UTC instant atomically with date/time changes. Do not allow independently editing only one side of the schedule.                                                                               |
| `app/(dashboard)/dashboard/events/[eventId]/settings/page.tsx` | Schedule shows raw date and time only.                                                                                                                                          | Render a localized schedule through the shared formatter and show the event timezone (e.g. `America/New_York`, or a clear zone abbreviation plus city). For online events, optionally show the viewer-local equivalent.                                                                                                       |

### Overview page

| File                                                           | Current state                                                                                                                                                                                            | Recommended change                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/event-dashboard/overview.ts`                              | Event result omits timezone/startAtUTC. `todayStart`, `last7Start`, and `buildDailySeries` use server-local dates; `new Date(event.date)` treats the date-only part as UTC midnight.                     | Select/return schedule metadata. Create reporting boundaries from an explicit zone, preferably `event.timezone`, using Luxon. Define “today” and daily buckets in that zone, while comparing stored booking/order timestamps as UTC instants. Use the event start instant to cap event-period charts. Return `reportingTimezone` with aggregate data.                                                         |
| `app/(dashboard)/dashboard/events/[eventId]/overview/page.tsx` | Passes only raw date/time to `EventHero`.                                                                                                                                                                | Pass `timezone`, `startAtUTC`, and normalized mode. Render any secondary viewer/host time line returned by the shared formatter.                                                                                                                                                                                                                                                                              |
| `components/event-dashboard/shared/EventHero.tsx`              | `parseEventDate` defaults to the viewer timezone, ignores `startAtUTC`, and `formatEventDate` forces `UTC`; `hasTimePart` is unused; `useMemo` does not include timezone because timezone is not a prop. | Accept the full schedule contract. Prefer `startAtUTC`; otherwise call `getEventStartUTC` with the stored event timezone, never the viewer zone. Use `displayEventTime` for the visible schedule and `eventCountdown` for the countdown. Show the event/venue zone for physical events and viewer + host context for online events. Add tests for New York/London/India and dates crossing the date boundary. |
| `components/event-dashboard/shared/ActivityFeed.tsx`           | Activity `Date` values are rendered in browser-local time with `en-IN`, without a zone label.                                                                                                            | Keep UTC-based sorting, but use a shared timestamp formatter. Add a “your time” label or zone abbreviation and a tooltip/full ISO value. Do not reinterpret activity timestamps as event-local time.                                                                                                                                                                                                          |
| `components/event-dashboard/shared/DailyApplicationsChart.tsx` | Chart accepts preformatted `day` strings and groups months by string splitting.                                                                                                                          | Keep formatting server-side, but make the input structured (`dateKey`, display label, reportingTimezone) so month grouping is timezone-safe and not dependent on English string parsing. Include the reporting zone in the chart caption/tooltip.                                                                                                                                                             |

### Event switcher and shell

| File                                                            | Current state                                                                                                                                         | Recommended change                                                                                                                                                                                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/event-dashboard/shell/EventSwitcher.tsx`            | Formats `event.date` with browser-local `toLocaleDateString`; does not show timezone or time; accessible event data can be sorted by the wrong field. | Use `startAtUTC` plus event timezone through the shared schedule formatter. Show date/time and zone in the active event and menu rows, or at least the date plus zone. Preserve compactness but avoid an ambiguous date-only label. |
| `components/event-dashboard/shell/EventDashboardProvider.tsx`   | Correctly transports context but context lacks schedule metadata.                                                                                     | No major UI change after `EventDashboardContext` is extended; ensure all schedule consumers use the same provider contract.                                                                                                         |
| `components/event-dashboard/shell/EventDashboardShell.tsx`      | Composition only.                                                                                                                                     | No direct timezone logic required. Keep it logic-free; it will automatically receive the extended context.                                                                                                                          |
| `components/event-dashboard/shell/EventDashboardShellInner.tsx` | Layout only.                                                                                                                                          | No direct timezone logic required. Consider a persistent small reporting-zone indicator in the shell/topbar once the reporting-zone contract exists.                                                                                |
| `components/event-dashboard/shell/EventTopbar.tsx`              | Navigation only.                                                                                                                                      | Optional P2 UI: add a dashboard timezone/reporting-zone indicator or access to a viewer/reporting timezone preference. Do not calculate time here.                                                                                  |

### Applicants and organizers

| File                                                        | Current state                                                                                                     | Recommended change                                                                                                                                                   |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/event-dashboard/applicants.ts`                         | `todaySignups` uses server-local midnight; applicant timestamps are returned as ISO-like values.                  | Compute today’s boundary in the explicit reporting zone, then compare `bookedAt` as UTC. Return `reportingTimezone` and optionally `todayStartUTC` for transparency. |
| `components/event-dashboard/applicants/ApplicantsPanel.tsx` | Registered time uses browser-local `toLocaleDateString("en-IN")`, despite including hours/minutes; no zone shown. | Use shared audit-timestamp formatting, show the viewer zone/“your time”, and provide an absolute/ISO tooltip. Keep this separate from event schedule formatting.     |
| `lib/event-dashboard/organizers.ts`                         | Data plumbing only; timestamps originate from invite/co-organizer actions.                                        | Preserve ISO UTC values and document them as absolute instants. No event-time conversion is needed.                                                                  |
| `components/event-dashboard/organizers/OrganizersPanel.tsx` | Invite/add/respond timestamps use browser-local date-only formatting with no zone.                                | Use the shared audit-timestamp formatter with zone context. This is not the event’s venue timezone unless explicitly selected as the reporting zone.                 |
| `lib/event-dashboard/activity.ts`                           | Correctly converts activity timestamps to ISO UTC and sorts by UTC epoch.                                         | Keep this behavior. Add an explicit contract comment/type that timestamps are UTC instants. Any future server-side formatted label should carry its zone.            |

### Analytics

| File                                                            | Current state                                                                                                                    | Recommended change                                                                                                                                                                                                                                      |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/actions/overall-analytics.ts`                              | Event analytics event payload omits timezone/startAtUTC. Month/day/weekday trend keys are made with server-local `Date` methods. | Add schedule metadata and `reportingTimezone`. Build all calendar keys with Luxon in the chosen reporting zone; compare booking/order `createdAt` as UTC. Keep event start/status comparisons on `startAtUTC`. Return structured date keys plus labels. |
| `lib/event-dashboard/analytics.ts`                              | Thin wrapper around overall analytics.                                                                                           | Preserve as the server boundary, but expose the expanded typed contract. Add tests at this layer for reporting-zone behavior.                                                                                                                           |
| `components/event-dashboard/analytics/EventAnalyticsView.tsx`   | Recent activity uses browser-local date/time format with no zone; event schedule is not displayed.                               | Use the shared audit timestamp formatter and zone label. If schedule metadata is shown here, use `displayEventTime`, not `new Date(...).toLocale*`. Make chart labels/tooltips consume structured zone-safe labels.                                     |
| `app/(dashboard)/dashboard/events/[eventId]/analytics/page.tsx` | Fetches context and analytics independently; neither currently carries schedule timezone to the client view.                     | Ensure the analytics data contract includes event timezone/startAtUTC and reporting zone. Avoid a second independent schedule query with different fallback rules.                                                                                      |

### Gate/operations dependency

| File                                                                                                    | Current state                                                                                          | Recommended change                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/actions/gate.actions.ts`                                                                           | `parseEventStart` uses `new Date(eventDate)` and `setUTCHours`, and its callers accept only date/time. | Replace with `getEventStartUTC(date, time, timezone)` or use stored `startAtUTC`. Select `timezone`/`startAtUTC` when loading the event/ticket. This is required for correct check-in grace/expiry windows, not just display. Add DST and non-hour-offset tests. |
| `app/(dashboard)/dashboard/events/[eventId]/operations/gate/page.tsx`                                   | Gate UI is a dashboard child and depends on the gate actions for timing.                               | Audit any displayed “started/expired” or current-time labels against the corrected action result. Use event instant for behavior; use event/viewer zone only for labels.                                                                                         |
| `app/(dashboard)/dashboard/events/[eventId]/operations/room/page.tsx` and `lib/actions/room.actions.ts` | Room action path already uses `getEventStartUTC` in the inspected code.                                | Verify every query/serializer also selects and returns `startAtUTC` where available. Keep this path aligned with gate and hero behavior; add regression tests rather than creating another parser.                                                               |

## What does not need a timezone conversion

* `createdAt`, `addedAt`, `invitedAt`, `respondedAt`, and notification timestamps represent absolute instants. They should not be converted into the event's venue timezone automatically.

* Revenue, counts, check-in totals, and status labels are not timezone-sensitive by themselves, but any period boundary (“today”, “this month”, trends) is timezone-sensitive.

* The dashboard shell/navigation components do not need time logic; they need access to a complete context and should remain presentation-only.

## Recommended implementation order

### Phase 1 — Correct the canonical contract

1. Extend `EventDashboardContext`, `EventOverviewData`, `EventAnalyticsData`, and settings summaries with `timezone` and `startAtUTC`.
2. Update `access.ts`, `overview.ts`, `overall-analytics.ts`, and settings selection/serialization.
3. Make `startAtUTC` authoritative for sorting/status/countdown, with one documented legacy fallback.
4. Fix `gate.actions.ts` so operational authorization and expiry use the same instant as the dashboard.

### Phase 2 — Fix the visible schedule

1. Refactor `EventHero.tsx` to use the canonical instant and shared formatter.
2. Update the overview page, event switcher, and settings page to show zone-aware schedule text.
3. Add online versus in-person/hybrid behavior consistently.

### Phase 3 — Fix reporting periods and timestamp clarity

1. Make overview and analytics aggregation zone-explicit.
2. Add `reportingTimezone` to charts and period metrics.
3. Standardize applicant, organizer, and activity timestamp formatting with viewer-zone labels.

### Phase 4 — Data integrity and legacy records

1. Validate IANA timezone values on new/updated events.
2. Backfill missing `timezone`/`startAtUTC` records using the strongest available evidence (organizer profile, geocoded location, or an explicitly recorded fallback). Log confidence; do not silently rewrite paid/high-value events.
3. Add monitoring for invalid timezone values, missing start instants, and fallback usage.

## Required test matrix

Add/extend tests for:

| Event zone         | Viewer zone           | Event type            | Assertions                                                                           |
| ------------------ | --------------------- | --------------------- | ------------------------------------------------------------------------------------ |
| `Asia/Kolkata`     | `America/New_York`    | In-person             | Venue time is primary; viewer equivalent is secondary; countdown is identical.       |
| `Asia/Kolkata`     | `America/New_York`    | Online                | Viewer time is primary; host time is secondary.                                      |
| `America/New_York` | `Europe/London`       | In-person             | DST offset and date boundary are correct.                                            |
| `Asia/Kathmandu`   | `UTC`                 | Hybrid                | 45-minute offset is preserved.                                                       |
| `Australia/Sydney` | `America/Los_Angeles` | Online                | Southern Hemisphere DST is correct.                                                  |
| Any zone           | Any zone              | Legacy missing fields | Documented fallback is used, surfaced/observable, and never produces `Invalid Date`. |

Also test the reporting calendar around midnight in two different process/browser zones. The same stored booking instant must land in the same selected reporting day regardless of where the dashboard server runs.

## Acceptance checklist

* [ ] Overview hero receives and uses `startAtUTC`, event `timezone`, and mode.

* [ ] Countdown is based only on the UTC instant.

* [ ] Physical/hybrid schedule shows the event/venue zone; online schedule shows viewer-local time with host context.

* [ ] Gate check-in and expiry windows use the same canonical event instant.

* [ ] “Today”, daily, monthly, and weekday analytics are based on an explicit reporting timezone.

* [ ] Dashboard event switching is ordered by canonical instant and displays a zone-aware schedule.

* [ ] Applicant/organizer/activity timestamps clearly indicate viewer-local or reporting-zone interpretation.

* [ ] No event-dashboard schedule path directly parses `date + time` outside `lib/time.ts`.

* [ ] Tests cover DST, India/Nepal offsets, date-boundary changes, and online versus physical mode.

## Final answer to the request

The changes are needed in all three areas: backend data contracts and time calculations, server-side analytics bucketing, and UI formatting. The most urgent files are `components/event-dashboard/shared/EventHero.tsx`, `app/(dashboard)/dashboard/events/[eventId]/overview/page.tsx`, `lib/event-dashboard/overview.ts`, `lib/event-dashboard/access.ts`, `lib/actions/overall-analytics.ts`, and `lib/actions/gate.actions.ts`. The remaining dashboard timestamp components should then be standardized so international co-organizers see unambiguous times rather than silently relying on the browser or server timezone.
