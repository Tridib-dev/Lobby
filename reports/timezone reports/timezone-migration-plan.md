# Timezone & Time Handling — Migration Plan

**Purpose:** Move the whole application from ad-hoc/inconsistent date handling to a single, safe, universal system — without breaking existing events, orders, or subscriptions.

---

## 1. The Answer to "Where Is It Stored?" — In One Table

| Layer | What's stored / used | Format |
|---|---|---|
| **Database** | The absolute instant | UTC, `timestamptz` type — never a naive/local timestamp |
| **Database** | The event's "home" zone | IANA name (e.g. `Asia/Kolkata`) — never `IST` or `+05:30` |
| **API (backend → frontend)** | The instant | ISO 8601 UTC string, e.g. `2026-12-05T02:15:00.000Z` |
| **API (backend → frontend)** | The zone | IANA name, passed alongside the instant |
| **Frontend (display only)** | Local wall-clock time | Computed at render time from UTC + zone — never stored, never cached long-term |
| **Frontend (forms)** | Organizer's picked date/time/zone | Converted to UTC *before* it's sent to the backend |

**Rule of thumb:** UTC + IANA is the only thing that ever gets *written*. Everything else is a *derived view*, computed fresh every time it's shown.

This answers your direct question: **backend work is the storage and conversion contract; frontend work is display and input.** Neither layer should independently decide "what time is it" — the backend defines the instant, the frontend decides how to show it.

---

## 2. Where to Show the Converted Time, and in What Manner — Surface by Surface

This is the governing rule, applied consistently: **if the viewer must physically be somewhere, show that place's local time; if there's no physical requirement, show the viewer's own local time.** Below is that rule applied to every surface in the app, with the exact manner of display for each.

| Surface | Which zone wins | Primary display format | Secondary line (when to add it) |
|---|---|---|---|
| **Event card** (grid/list view) | In-person or hybrid → **venue's** zone. Fully online → **viewer's** zone. | `Sat, 5 Dec 2026 · 7:45 AM` (zone implicit, card is compact) | None — cards stay compact; full context lives on the detail page. |
| **Event detail page — header** | Same as card, but made explicit | `Saturday, 5 December 2026 · 7:45 AM IST` (always show the zone abbreviation here — this is the page people plan travel/time-off around) | `(= 9:15 PM PST for you)` — add only if viewer's zone differs from the event's zone, and only on this page, not on cards. |
| **Countdown / timer widget** | N/A — always computed from the UTC instant | `91 Days · 18 Hours · 40 Minutes · 08 Seconds` | None needed — a correctly-computed countdown is identical and correct for every viewer worldwide by construction. |
| **Online room / join page** | **Viewer's** zone, always (no physical location involved) | `Starts at 9:15 PM your time` | `(Host's time: 7:45 AM IST)` — small, secondary, purely for coordination context. |
| **"Join Now" / "Register" button activation** | N/A — gate on UTC epoch comparison | No time shown on the button itself | N/A |
| **Registration / ticket confirmation (in-app + email)** | Same rule as the event: in-person → venue zone; online → recipient's zone at send time | `Your event: Sat, 5 Dec 2026, 7:45 AM IST` | Add viewer's local equivalent only for online events, same as the join page. |
| **Reminder notifications** ("Starts in 1 hour") | Trigger time computed from UTC epoch diff; displayed time follows the same in-person/online rule as the event itself | `Your event starts in 1 hour (7:45 AM IST)` | Same optional secondary line as above for online events. |
| **Organizer dashboard** (registered-at, created-at, "Applicants/Analytics" timestamps) | **Organizer's own** local zone, auto-detected | `Registered 17 Jul, 09:38 PM` | None — this is an internal, single-viewer context, not something attendees see. |
| **Recurring event instances** | Re-derived per occurrence from the event's home zone + wall-clock rule (e.g. "every Tuesday 7 PM Asia/Kolkata") | Same format as a single event, computed fresh for each occurrence | None additional — but never pre-cache a list of UTC instants across DST boundaries (see Failure Mode #2 below). |
| **Payment/subscription deadlines** ("Registration closes," billing renewal date) | Backend UTC cutoff is authoritative; displayed in the same zone as the parent event (in-person/online rule) or the organizer's zone for billing | `Registration closes Fri, 4 Dec, 11:59 PM IST` | Never show a countdown here that doesn't match the exact backend cutoff — see checklist item on payment-adjacent screens. |

**Manner, consistently applied:**
- The **primary** line is always the "authoritative" zone per the in-person/online rule — never the viewer's guess dressed up as fact.
- The **secondary** line, when present, is small, parenthetical, and additive — it's context, never the thing the user has to resolve themselves.
- Every one of these rows is rendered by calling the *same two shared functions* (`displayEventTime`, `eventCountdown` from Section 5) with different inputs — the surface never re-implements the conversion itself. That's what keeps 10+ surfaces consistent instead of silently drifting apart from each other over time.

---

## 3. Drawbacks & Failure Modes — What Actually Breaks, and Why

These are listed in order of how expensive they are to fix *after* the fact vs. now.

| # | Failure mode | Why it happens | Cost if caught late |
|---|---|---|---|
| 1 | **Ambiguous historical data.** Old records stored as naive local time with no zone attached. | Nobody recorded which zone "7:00 PM" meant at write time. | High — becomes a guessing exercise; some records may be unrecoverable with certainty. |
| 2 | **DST silently shifts recurring events by an hour.** | Pre-computing UTC instants once and caching them, instead of re-deriving per occurrence. | Medium — visible bug, embarrassing, but fixable without data loss. |
| 3 | **Countdown/timer computed from a re-parsed display string** instead of the UTC instant. | Treating `"7:45 AM"` as if it were in the *viewer's* zone when it re-enters JS `Date()`. | Medium — wrong countdown per-viewer, hard to notice in your own timezone during testing. |
| 4 | **Server not running in UTC.** Cron jobs / reminder emails fire at the wrong real-world time. | OS/process timezone defaults to local server region instead of UTC. | Medium–High — silently wrong for months if nobody's watching. |
| 5 | **Fixed offset stored instead of IANA name** (`+05:30` instead of `Asia/Kolkata`). | Looks equivalent today, breaks the moment that country's DST rule changes. | Low probability, high blast radius — every stored record using that offset needs reinterpretation. |
| 6 | **Half-hour/45-minute offset zones mishandled** (India, Nepal, parts of Australia). | Library or manual math assumes whole-hour offsets. | Low — but real, and easy to miss if you only test with US/UK data. |
| 7 | **Browser auto-detection wrong under VPN.** | `Intl.DateTimeFormat` reads OS/browser setting, which a VPN can distort. | Low — rare, needs a manual override escape hatch, not a redesign. |
| 8 | **Payment/subscription period boundaries computed inconsistently** (Razorpay billing cycles vs. your own "days remaining" logic). | Two different code paths computing "when does this period end" without a shared UTC-based source. | High — this touches money and refund eligibility, not just display. |
| 9 | **CI/test environment timezone differs from production**, so tests pass locally but fail (or falsely pass) in prod. | Dev machine's local timezone leaks into date logic that isn't zone-explicit. | Medium — false confidence, bugs ship despite "passing tests." |

**The one meta-drawback:** this migration adds real, permanent complexity — every date field now needs an accompanying timezone field, every new feature needs to go through the shared utilities, and testing needs multiple timezone fixtures instead of one. That's a real cost. It's just cheaper than the alternative.

---

## 4. Backend Work Required

- [ ] Audit every table with a date/time column; confirm each is `timestamptz` (Postgres) or equivalent — not a naive `timestamp`.
- [ ] Add an `event_timezone` (IANA string) column wherever an event, session, or scheduled item exists.
- [ ] Set `TZ=UTC` at the process level for: app servers, background workers, cron runners, and CI test runners. This single setting prevents an entire category of "works on my machine" bugs.
- [ ] Update every API response serializer to emit UTC ISO 8601 + the relevant IANA zone as separate fields — never a pre-formatted local string.
- [ ] Update scheduled jobs (reminder emails, "event starting soon" triggers, subscription renewal checks) to compute trigger times off UTC instants, not server-local wall time.
- [ ] Confirm Razorpay webhook timestamps are being read as Unix epoch (they are, by default) and not re-interpreted through any local-time logic on your side.
- [ ] Write a single backend utility module (equivalent to the frontend `lib/time.ts`) so every service/job/serializer calls the same conversion logic — no duplicated date math across the codebase.

## 5. Frontend Work Required

- [ ] Build (or finalize) the shared `lib/time.ts` utilities: `toUTCInstant`, `displayEventTime`, `eventCountdown` — as discussed earlier in this conversation.
- [ ] Grep the codebase for every ad-hoc date call and route it through the shared utilities (see audit command in Section 6).
- [ ] Event creation/edit forms: timezone must be an explicit field (defaulted to detected zone, overridable), never assumed.
- [ ] Auto-detect viewer timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone`; add a rare manual-override link for the VPN edge case — never a default manual picker.
- [ ] Countdown components and "Join Now" activation logic must diff against the UTC instant, never a parsed display string.
- [ ] Add timezone-forcing to your test setup (Playwright/Cypress support emulating a browser timezone) so tests run against at least 3 distinct zones, not just the developer's own.

---

## 6. Audit — Do This First, Before Writing Any Fix

Before changing anything, find out how bad the current state actually is. Run these searches and turn the output into an inventory:

```bash
# Frontend date-handling call sites (candidates for replacement)
grep -rn "new Date(" --include="*.ts" --include="*.tsx" src/
grep -rn "toLocaleDateString\|toLocaleTimeString\|toLocaleString" --include="*.tsx" src/
grep -rn "getTimezoneOffset\|getHours()\|getMinutes()" --include="*.ts" --include="*.tsx" src/

# Backend: naive timestamp columns (Postgres example)
# Run against your schema — flags any column NOT using timestamptz
psql -c "\d+ *" | grep -i "timestamp without time zone"
```

Produce an **Audit Report** with three columns: `file/table`, `risk level`, `fix category`. Risk levels:

- 🔴 **Payment-critical** — anything touching Razorpay order timing, subscription periods, refund windows.
- 🟠 **Event-time-critical** — event start/end, countdowns, join buttons, reminders.
- 🟡 **Cosmetic** — "registered at," dashboard timestamps, logs.

Fix payment-critical items first, regardless of how small they look — that's where a timezone bug becomes a money bug.

---

## 7. Migration Strategy — Phased, in Order

Do not attempt this in one pass. Each phase should be shippable and safe on its own.

**Phase 0 — Audit** *(Section 6 above)*
Produce the inventory. No code changes yet.

**Phase 1 — Foundation (backend, non-breaking)**
- Add the new `timezone` columns (nullable, backward-compatible).
- Set `TZ=UTC` across all environments including CI.
- Build and unit-test the shared time utilities in isolation, with no UI wired to them yet.

**Phase 2 — Backend integration**
- Update serializers and write-paths to require/store UTC + IANA zone for all *new* records.
- Update scheduled jobs to the new UTC-based logic.
- Test matrix: seed fixture events across India (+5:30), Nepal (+5:45), US Eastern (has DST), UTC, and Australia (Southern Hemisphere DST) — confirm correct round-trip storage and retrieval for each.

**Phase 3 — Frontend integration, ordered by risk**
1. Event creation/edit forms (this is where new correct data originates — fix the source first)
2. Event detail page + countdown (highest visibility, already identified as a common trap)
3. Event cards
4. Online room / join-button logic
5. Dashboards and analytics displays
6. Email/notification templates

At each step, QA side-by-side against at least 3 timezones plus one date near a DST transition.

**Phase 4 — Backfill existing data**
- For events created under the old system, determine the best-effort original intended zone (organizer's account setting, or the venue's geocoded location if you have an address on file).
- Run a one-time backfill migration. Log every touched record — old value, new value, and a confidence flag (`certain` vs. `inferred`) — into an audit table. Don't silently overwrite without a trail.
- Manually spot-check a sample of high-value (paid/large) events after backfill — don't trust the migration script blindly on money-adjacent data.

**Phase 5 — Verification**
- Automated regression tests: table-driven "created in zone X, viewed from zone Y, displays Z" cases.
- Add error-tracking alerts for any date-parsing failure or `Invalid Date` occurrence in production.
- Run the go-live checklist (Section 8) before flipping each surface live.

**Phase 6 — Cutover & monitor**
- Keep old code paths available (behind a flag) for a short overlap window rather than deleting immediately.
- Watch support tickets/bug reports specifically for "wrong time" complaints for 2–4 weeks post-launch before considering this closed.

---

## 8. Go-Live Checklist (run before each surface ships)

- [ ] All timestamps on this screen pass through the shared `lib/time.ts` functions — no direct `new Date().toLocaleString()` calls.
- [ ] In-person/hybrid content shows the **venue's** zone; fully online content shows the **viewer's** zone.
- [ ] Countdown/timer (if present) is diffed from the UTC instant, verified correct in at least 2 non-local browser timezones.
- [ ] Tested against a date within 2 weeks of a DST transition in at least one relevant region.
- [ ] Tested against a half-hour-offset zone (India or Nepal).
- [ ] No manual timezone picker required for a normal viewing flow — auto-detected, override optional.
- [ ] For payment-adjacent screens: confirmed the displayed deadline matches the actual UTC cutoff used by the backend logic, not just visually plausible.

---

## 9. Reports to Produce Along the Way

1. **Audit Report** (Phase 0) — full inventory, risk-ranked.
2. **Test Matrix Report** (Phase 2/3) — timezones × surfaces × event types, pass/fail per cell.
3. **Backfill Report** (Phase 4) — every legacy record touched, old → new value, confidence level.
4. **Go-Live Checklist** (per surface, Section 8) — signed off before each screen ships.
5. **Post-Launch Monitoring Report** — track and log any timezone-related support tickets for 2–4 weeks after full rollout, as the real-world confirmation that the migration held.

---

## Summary

- **Storage:** UTC instant + IANA zone name. Nothing else, ever, in the database.
- **Backend:** owns the contract — UTC everywhere internally, explicit zone on every API response, UTC-based job scheduling.
- **Frontend:** owns display and input only — converts UTC → local for viewing, converts local input → UTC before sending, through one shared utility module.
- **Migration:** audit first, fix backend foundations before frontend surfaces, backfill last and with an audit trail, verify with a real timezone test matrix — not just "does it look right on my machine."
