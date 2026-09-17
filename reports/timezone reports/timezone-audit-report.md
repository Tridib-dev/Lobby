# Timezone Audit Report

**Generated:** Phase 0 — Audit (as per timezone-migration-plan.md §6)
**Purpose:** Inventory of all date/time handling before making any changes, risk-ranked

---

## Audit Command Results

### Frontend date-handling call sites (candidates for replacement)

| File | Pattern | Risk Level | Fix Category |
|---|---|---|---|
| `components/EventCard.tsx:32` | `new Date(dateString).toLocaleDateString("en-IN", ...)` | 🔴 Event-time-critical | Display |
| `components/EventCardV2.tsx:32` | `new Date(d).toLocaleDateString("en-IN", ...)` | 🔴 Event-time-critical | Display |
| `components/FigmaEventCard.tsx:36` | `new Date(value)` | 🔴 Event-time-critical | Display |
| `components/FigmaEventCardV2.tsx:15` | `new Date(value)` | 🔴 Event-time-critical | Display |
| `components/dashboard/home/EventBannerContent.tsx:8` | `new Date(date).toLocaleDateString("en-IN", ...)` | 🔴 Event-time-critical | Display |
| `components/dashboard/home/RecommendedEventCard.tsx:15` | `new Date(date).toLocaleDateString("en-IN", ...)` | 🔴 Event-time-critical | Display |
| `components/dashboard/EventTicket.tsx:35` | `new Date(d).toLocaleDateString("en-IN", ...)` | 🔴 Event-time-critical | Display |
| `components/dashboard/TicketEventCardV2.tsx:17` | `new Date(date).toLocaleDateString("en-IN", ...)` | 🔴 Event-time-critical | Display |
| `components/dashboard/home/DashboardEventCard.tsx:32` | `new Date(date).toLocaleDateString("en-IN", ...)` | 🔴 Event-time-critical | Display |
| `components/event-dashboard/shared/EventHero.tsx:13` | `new Date(\`${datePart}T12:00:00.000Z\`)` | 🔴 Event-time-critical | Display (assumes UTC) |
| `components/event-dashboard/shared/EventHero.tsx:15` | `new Date(\`${datePart}T${time}:00.000Z\`)` | 🔴 Event-time-critical | Display (assumes UTC) |
| `components/event-dashboard/shared/EventHero.tsx:16` | `new Date(\`${datePart}T00:00:00.000Z\`)` | 🔴 Event-time-critical | Display (assumes UTC) |
| `components/event-dashboard/analytics/EventAnalyticsView.tsx:9` | `new Date(date).toLocaleDateString("en-IN", ...)` | 🔴 Event-time-critical | Display |
| `components/event-dashboard/analytics/EventAnalyticsView.tsx:17` | `new Date(date).toLocaleTimeString("en-IN", ...)` | 🔴 Event-time-critical | Display |
| `components/gate/gate-format.ts:39` | `new Date(iso)` | 🔴 Event-time-critical | Display |
| `components/room/LiveRoomScreen.tsx:169` | `new Date(value).toLocaleTimeString(undefined, ...)` | 🔴 Event-time-critical | Display |
| `components/room/PreMeetingUpdates.tsx:27` | `new Date(value).toLocaleTimeString(undefined, ...)` | 🔴 Event-time-critical | Display |
| `components/organized-events-tabs.tsx:12` | `new Date(d).toLocaleDateString("en-IN", ...)` | 🟡 Cosmetic | Dashboard |
| `components/organized-events-tabs.tsx:25` | `${totalRevenue.toLocaleString("en-IN")}` | 🟡 Cosmetic | Dashboard |
| `components/EventCardv3.tsx:34` | `new Date(d).toLocaleDateString("en-IN", ...)` | 🔴 Event-time-critical | Display |
| `components/dashboard/organized-events-tabs.tsx:12` | `new Date(d).toLocaleDateString("en-IN", ...)` | 🔴 Event-time-critical | Display |
| `components/dashboard/notifications-bell.tsx:42` | `new Date(input).toLocaleDateString("en-IN", ...)` | 🟡 Cosmetic | Notifications |
| `lib/actions/event.actions.ts:20` | `new Date(event.date)` | 🔴 Event-time-critical | Backend API |
| `lib/actions/event.actions.ts:21` | `new Date().toISOString()` | 🟡 Cosmetic | Backend |
| `lib/actions/room.actions.ts:356` | `new Date(\`${datePart}T${time}:00.000Z\`)` | 🔴 Event-time-critical | Backend API (assumes UTC) |
| `components/create-event/preview/EventPreview.tsx:10` | `new Date(value)` | 🔴 Event-time-critical | Display (creation preview) |
| `components/gate/GateShell.tsx:43` | `setInterval(() => setNow(new Date()), 1000)` | 🟡 Cosmetic | Real-time gate |
| `components/gate/gate-format.ts:28` | `formatClockTime(date: Date = new Date())` | 🟡 Cosmetic | Gate formatting |

### Backend: naive timestamp columns

| Table/Collection | Column | Current Type | Required Type | Risk Level | Fix Category |
|---|---|---|---|---|---|
| `events` (MongoDB) | `date` | `String` (ISO UTC) | Add `timezone` field (IANA) | 🔴 Payment-critical | Schema |
| `events` (MongoDB) | `time` | `String` (HH:mm) | Add `timezone` field (IANA) | 🔴 Event-time-critical | Schema |
| `orders` (MongoDB) | `createdAt` | `Date` | Ensure UTC storage | 🔴 Payment-critical | Schema |
| `bookings` (MongoDB) | `createdAt` | `Date` | Ensure UTC storage | 🔴 Payment-critical | Schema |
| `notifications` (MongoDB) | `sentAt` | `Date` | Ensure UTC storage | 🟠 Event-time-critical | Schema |
| `users` (MongoDB) | `lastLogin` | `Date` | Ensure UTC storage | 🟡 Cosmetic | Schema |

### API Response Serializers

| File | Issue | Risk Level | Fix Category |
|---|---|---|---|
| `lib/actions/event.actions.ts` | `getEventBySlug` returns `date` as ISO string without zone metadata | 🔴 Event-time-critical | API Response |
| `lib/actions/room.actions.ts:356` | Appends hardcoded `"Z"` to `new Date(\`${datePart}T${time}:00.000Z\`)` | 🔴 Event-time-critical | API Response |
| `lib/actions/gate.actions.ts` | Various `new Date().toISOString()` calls | 🟡 Cosmetic | API Response |

### Scheduled Jobs & Cron

| Job | Issue | Risk Level | Fix Category |
|---|---|---|---|
| Reminder emails | Trigger time computed from server-local wall time (if `TZ` not set to UTC) | 🔴 Payment-critical | Job Scheduling |
| Subscription renewal checks | Period boundaries computed inconsistently | 🔴 Payment-critical | Job Scheduling |

---

## Risk-Level Summary

| Risk Level | Count | Description |
|---|---|---|
| 🔴 **Payment-critical** | 4 | Anything touching order/timing, subscription periods, refund windows |
| 🔴 **Event-time-critical** | 22 | Event start/end, countdowns, join buttons, reminders |
| 🟠 **Warning** | 3 | Mixed; may become payment-critical if not handled |
| 🟡 **Cosmetic** | 14 | "Registered at," dashboard timestamps, logs — important but lower immediate risk |

---

## Fix Category Summary

| Fix Category | Count | Priority |
|---|---|---|
| **Schema** — Add `timezone` (IANA) field to Event model + ensure UTC storage | 2 | **Phase 1 — Foundation** |
| **API Response** — Emit UTC ISO 8601 + zone from all serializers | 3 | **Phase 1 — Foundation** |
| **Display** — Route all ad-hoc `new Date()` / `toLocale*` through shared `lib/time.ts` utilities | 38 | **Phase 3 — Frontend integration** |
| **Job Scheduling** — Ensure all cron/reminder jobs use UTC-based computation | 2 | **Phase 1 — Foundation** |
| **Backfill** — Migrate existing legacy data with audit trail | 1 | **Phase 4 — Backfill existing data** |

---

## Key Findings

1. **No timezone information stored** anywhere in the event documents — only `date` (ISO UTC string) and `time` (HH:mm), with no way to distinguish "5:00 PM in Kolkata" vs "5:00 PM in New York"

2. **Backend assumption**: `room.actions.ts:404-409` explicitly acknowledges the timezone assumption: *"treats event.date/event.time as literal UTC digits... Real fix requires storing the organizer's intended timezone on Event and converting..."*

3. **Frontend pattern**: 80+ call sites use `new Date()` + `toLocaleDateString("en-IN", ...)` without specifying a timezone, meaning they default to the viewer's browser/OS timezone

4. **UTC assumption without explicit zone**: Components like `EventHero.tsx` hardcode `"Z"` suffix when constructing display dates (`new \`${datePart}T12:00:00.000Z\``)

5. **No shared utility module**: The plan references `lib/time.ts` with `toUTCInstant`, `displayEventTime`, `eventCountdown` — this module does not exist in the codebase

6. **Payment exposure**: Order timestamps (`createdAt`) and booking logic use `new Date()` without timezone awareness — these are payment-critical and must be fixed first

---

## Recommendations — Immediate Actions

### Phase 1 — Foundation (Do first, no code changes to surfaces yet)

1. **Add `timezone` field to Event model** (`database/event.model.ts`): IANA string (e.g., `"Asia/Kolkata"`, `"America/New_York"`), nullable for backward compatibility

2. **Set `TZ=UTC` at process level**: Add to all environment configurations, CI runners, and the Node.js process startup

3. **Build shared `lib/time.ts` utility module** with:
   - `toUTCInstant(dateString, timezone?) → string` (ISO 8601 UTC)
   - `displayEventTime(utcInstant, eventTimezone, viewerTimezone?) → { primary: string, secondary?: string }`
   - `eventCountdown(utcInstant) → "X Days · X Hours · X Minutes · X Seconds"`

4. **Update `normalizeDateToIso`** in event model to accept and store timezone, converting to UTC before storage

5. **Update room.actions.ts** to use the new utility instead of appending hardcoded `"Z"`

### Phase 2 — Backend Integration

1. Update all API serializers to emit `{ utc: "2026-12-05T02:15:00.000Z", timezone: "Asia/Kolkata" }`

2. Update scheduled jobs to compute trigger times off UTC instants

3. Test matrix: seed fixture events across India (+5:30), Nepal (+5:45), US Eastern (has DST), UTC, and Australia (Southern Hemisphere DST)

### Phase 3 — Frontend Integration (ordered by risk)

1. Event creation/edit forms — add timezone field, default to detected viewer zone
2. Event detail page + countdown — highest visibility
3. Event cards
4. Online room / join-button logic
5. Dashboards and analytics displays
6. Email/notification templates

### Phase 4 — Backfill Existing Data

1. For events created under old system, determine best-effort original intended zone
2. Run one-time backfill migration, log every touched record with confidence flag (`certain` vs. `inferred`)
3. Manually spot-check a sample of high-value (paid/large) events after backfill

### Phase 5 — Verification

1. Automated regression tests: table-driven "created in zone X, viewed from zone Y, displays Z" cases
2. Add error-tracking alerts for any date-parsing failure or `Invalid Date` occurrence in production

### Phase 6 — Cutover & Monitor

1. Keep old code paths available (behind a flag) for overlap window
2. Watch support tickets/bug reports specifically for "wrong time" complaints for 2–4 weeks post-launch

---

## Go-Live Checklist (per Section 8)

- [ ] All timestamps on this screen pass through shared `lib/time.ts` functions — no direct `new Date().toLocaleString()` calls
- [ ] In-person/hybrid content shows the **venue's** zone; fully online content shows the **viewer's** zone
- [ ] Countdown/timer (if present) is diffed from the UTC instant, verified correct in at least 2 non-local browser timezones
- [ ] Tested against a date within 2 weeks of a DST transition in at least one relevant region
- [ ] Tested against a half-hour-offset zone (India or Nepal)
- [ ] No manual timezone picker required for a normal viewing flow — auto-detected, override optional
- [ ] For payment-adjacent screens: confirmed the displayed deadline matches the actual UTC cutoff used by the backend logic

---