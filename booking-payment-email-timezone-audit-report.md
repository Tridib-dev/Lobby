# Booking, Payment, and Email Diff Audit

## Scope

This report audits the current working-tree changes shown by:

```text
app/api/razorpay/verify/route.ts            |   4 +
lib/actions/booking.actions.ts              |   4 +
lib/email/BookingConfirmation.ts            | 228 -----------------------
lib/email/templates/BookingConfirmation.tsx |  45 ++---
lib/email/templates/OrderReceipt.tsx        |  45 ++---
5 files changed, 34 insertions(+), 292 deletions(-)
```

The audit compares the previous committed implementation with the current working tree. It focuses on payment/booking correctness, timezone behavior, email rendering, international users, and regression risk.

## Executive conclusion

The direction is good and the timezone change is necessary, but the implementation is not fully correct for international online-event emails yet.

The most important defect is in the paid-payment path:

```ts
// app/api/razorpay/verify/route.ts
.select("price title slug date time location")
```

The code later passes `eventDoc.timezone` and `eventDoc.startAtUTC`, but those fields were not selected from MongoDB. They will therefore normally be `undefined` in paid receipts. Free bookings do select both fields correctly.

There is a second design gap: the email payload does not include `mode` or a recipient timezone. A server-rendered email cannot reliably know the recipient's browser timezone. Calling a server-derived timezone “the viewer's local time” would produce the server's local time, not the user's time.

### Verdict

| Area                              | Assessment                                                  |
| --------------------------------- | ----------------------------------------------------------- |
| Payment verification/security     | Preserved by this diff                                      |
| Booking/payment database behavior | Preserved; no migration required                            |
| Free-booking timezone email       | Mostly correct for event-timezone display                   |
| Paid receipt timezone email       | Incomplete because the query omits the new fields           |
| In-person/hybrid email display    | Generally safe when timezone data is present                |
| Online email display              | Not recipient-local; requires an explicit email policy      |
| Email architecture                | React Email/template service is a good modernization        |
| Production readiness              | Fix the paid query and clarify online-email semantics first |

## What changed

### 1. Razorpay verification route

File: [app/api/razorpay/verify/route.ts](app/api/razorpay/verify/route.ts)

The local `EventEmailDoc` type gained optional `timezone` and `startAtUTC` fields. The receipt call also forwards those fields to `sendOrderReceipt`.

This is the right contract direction: the payment verification route continues to verify the payment and create the order, while the email receives the event's canonical schedule data.

However, the query at line 77 still selects only:

```ts
"price title slug date time location"
```

It must also select:

```ts
"timezone startAtUTC"
```

Without that, the new values are not available to the paid receipt template. This is a functional bug, not just a typing issue.

The comment says “fire and forget”, but the code uses `await sendOrderReceipt(...)`. The email service catches its own errors, so payment verification still normally succeeds even if sending fails. The comment should be corrected for clarity, or the email should intentionally be queued/asynchronously dispatched in a later reliability improvement.

### 2. Free booking action

File: [lib/actions/booking.actions.ts](lib/actions/booking.actions.ts)

The event query already selects:

```ts
"title date time location slug startAtUTC timezone"
```

The action forwards both values to `sendBookingConfirmation`.

This part is materially correct for the new event-timezone plumbing. It does not change how bookings are created, how duplicate bookings are detected, or how the booking database record is stored.

The email remains best-effort because `sendBookingConfirmation` catches errors. That is appropriate for a confirmation email: an email-provider failure should not undo a successful booking. The product should still have logging/monitoring or a retry path so a successful booking does not silently lose its confirmation email.

### 3. React Email booking confirmation

File: [lib/email/templates/BookingConfirmation.tsx](lib/email/templates/BookingConfirmation.tsx)

The template now accepts optional `timezone` and `startAtUTC` fields and calls `getEventDisplayTime` instead of the local `formatDate` and `formatTime` helpers.

Before, the template independently rendered:

* a date using `toLocaleDateString("en-IN", ...)`;

* a time by splitting the stored `HH:mm` string and applying AM/PM formatting.

That approach did not establish which timezone the date/time belonged to and did not use the canonical UTC instant. It was vulnerable to interpreting a calendar date and wall-clock time outside their event timezone.

Now it resolves the event schedule through the shared timezone utility and renders a combined `Date & Time` value. This is a good consistency improvement and uses the same central time calculation as the application.

The current template still retains the useful modern email features from the React Email implementation: ticket ID, QR code, ticket link, event link, responsive wrapper, and structured styling. The deleted legacy file was a separate hand-built HTML implementation and is no longer needed if there are no imports to it.

### 4. React Email order receipt

File: [lib/email/templates/OrderReceipt.tsx](lib/email/templates/OrderReceipt.tsx)

The same timezone conversion was added to payment receipts. It accepts `timezone` and `startAtUTC`, removes the local date/time formatters, and renders a shared `Date & Time` value.

This keeps the receipt aligned with the booking confirmation rather than allowing the two transactional emails to show different interpretations of the same event schedule.

### 5. Removal of the old standalone renderer

Removed file: [lib/email/BookingConfirmation.ts](lib/email/BookingConfirmation.ts)

The deleted file was a legacy manual HTML renderer with its own formatting functions and a separate subject/HTML API. The active booking action imports from `lib/email/services/booking.email`, which imports the React Email template in `lib/email/templates/BookingConfirmation.tsx`.

The deletion is safe from the current import graph because the live code does not import the deleted module. It reduces the risk of maintaining two booking-email implementations with different formatting and timezone behavior.

## Before and after user experience

### Free booking confirmation

| Before                                                                                                                                                                     | After                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| User received a confirmation with separate date and time fields. The date was formatted with an `en-IN` locale and the time was manually converted from the stored string. | User receives a combined date/time value produced by the shared event schedule utility.        |
| The email did not make the event timezone explicit.                                                                                                                        | The formatted value includes a short timezone/offset when the shared formatter can resolve it. |
| A stored date/time could be interpreted without the event's IANA timezone.                                                                                                 | `startAtUTC` is preferred, with legacy fallback behavior when it is absent.                    |

For in-person and hybrid events, this is a meaningful improvement because the event/venue timezone is the authoritative schedule. For online events, the email still needs a separate recipient-timezone decision described below.

### Paid order receipt

| Before                                              | After in the intended design                                                    | Actual current result                                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Receipt displayed manually formatted date and time. | Receipt should use `startAtUTC` plus event timezone through the shared utility. | The Razorpay event query does not select `timezone` or `startAtUTC`, so the template usually falls back to `date`/`time` and the default legacy timezone. |

This means the paid path does not yet receive the full benefit of the change. It should be fixed before relying on the new receipt output internationally.

### Event details and ticket usability

The current React Email booking confirmation retains the ticket ID, QR code, “View my tickets”, and “View event” actions. The order receipt retains the receipt total, Razorpay payment ID, and navigation actions. The diff does not remove these important user actions.

The presentation changes from separate `Date` and `Time` labels to one `Date & Time` field. This is common in modern transactional emails and is not inherently startling, but the timezone must be clearly named. A user should not have to infer whether the time is their time, the venue's time, or the organizer's time.

## Why the change was necessary

The old formatter treated event date/time as presentation strings. That is unsafe for a multi-timezone product because:

1. An event's date and wall-clock time have meaning only together with an IANA timezone.
2. An absolute event instant should be calculated once and reused for access logic, countdowns, sorting, and display.
3. Manual formatter copies drift over time and can disagree across the dashboard, ticket page, and email.
4. A date formatted in a fixed locale is not the same thing as a timezone conversion.

Forwarding `startAtUTC` and `timezone` into the email templates is therefore the correct architectural move. The missing Razorpay projection and missing email policy are implementation gaps around an otherwise sound direction.

## International and online-event analysis

The shared helper in [lib/time.ts](lib/time.ts) supports this policy:

* in-person/hybrid: event timezone is primary;

* online: viewer timezone is primary and host/event time is secondary;

* absolute comparisons use the UTC instant.

But the email templates currently call:

```ts
getEventDisplayTime({
  date,
  time,
  timezone,
  startAtUTC,
})
```

They do not pass `mode`, so the helper cannot intentionally select the online branch from the email data. They also do not pass a recipient timezone.

The helper defaults `viewerTimezone` to:

```ts
Intl.DateTimeFormat().resolvedOptions().timeZone
```

In server-rendered email generation, that is the server/runtime timezone. It is not the email recipient's browser timezone. This distinction matters because email is a static document; it is not rendered in the recipient's browser by the application.

### Recommended email policy

For transactional emails, use an explicit and unambiguous policy:

* In-person/hybrid: show `Event time (venue timezone)` as the primary value.

* Online: show `Event time (host/event timezone)` as the stable authoritative value, and show `Your local time` only when a trusted recipient timezone is available.

* Always include the timezone name or offset in the label/value.

* Do not silently call server time “your local time”.

If recipient-local online email display is a product requirement, add a trusted `recipientTimezone` to the email data. It can come from a saved user profile preference or an explicit timezone selected by the user. Do not attempt to infer it from an email address, and do not use the server timezone as a substitute.

## Safety and regression assessment

### What is safe

* No order, booking, payment, or event database schema is changed by this diff.

* No stored timestamps are rewritten.

* Razorpay signature and payment amount/status checks are unchanged.

* Booking creation and duplicate-booking handling are unchanged.

* Existing records without `startAtUTC` remain renderable through the helper's legacy fallback.

* The old duplicate email renderer is removed in favor of the active React Email path.

* Email failures are caught and do not normally roll back a successful booking/order.

### Risks that should be fixed or explicitly accepted

1. **Paid receipts do not receive timezone fields.** Add `timezone startAtUTC` to the Razorpay event projection.
2. **Email mode is missing.** Add `mode` to the event projection, email data contracts, and helper call if mode-aware email behavior is required.
3. **Recipient timezone is unavailable.** Choose the stable event-timezone policy or add a trusted recipient timezone. Do not promise browser-local email times without this data.
4. **Legacy fallback is implicit.** When timezone or UTC data is missing/invalid, consider labeling the output as the event's configured/default timezone and log the legacy case for monitoring.
5. **Email delivery is not durable.** The current send path is synchronous inside the request/action but catches failures. A job/outbox/retry mechanism is stronger for production reliability; this is separate from the timezone change.
6. **The combined field must remain explicit.** Prefer labels such as `Event time (America/Los_Angeles)` or a human-readable offset/abbreviation rather than an unlabeled date/time string.
7. **Rendering logic is harder to read than necessary.** The inline JSX IIFE works, but calculating `const displayTime = getEventDisplayTime(...)` before the JSX return would improve testability and maintainability.

## Recommended change plan

### P0 — required before production

1. Update the Razorpay event projection to include `timezone startAtUTC`.
2. Add a regression test proving a paid receipt receives and renders those fields.
3. Decide and document the email policy for online events. The safest default is event/host timezone as the stable email time unless a recipient timezone is explicitly stored.
4. Add an invalid/missing timezone test to verify that rendering never crashes.

### P1 — strongly recommended

1. Add `mode` to the email event data and pass it through both booking and payment paths.
2. Add an optional `recipientTimezone` only if the product wants recipient-local online email times.
3. Display a clear timezone label in both templates.
4. Add structured logging/metrics for missing `startAtUTC`, invalid timezone, and email-send failures.
5. Correct the “fire and forget” comments or move email delivery to an actual background/outbox flow.

### P2 — quality improvements

1. Extract a shared email schedule display component/helper so booking confirmations and receipts cannot drift.
2. Render preview snapshots for Gmail/Outlook/mobile widths.
3. Consider storing a schedule snapshot in the booking/order if historical receipts must remain tied to the schedule shown at purchase time, even after organizers edit an event.

## Test matrix

The existing timezone matrix currently passes: **1 file, 8 tests passed**.

Before merging this email change, add or manually verify:

| Scenario                                 | Expected result                                                    |
| ---------------------------------------- | ------------------------------------------------------------------ |
| Free booking, in-person, India venue     | Email shows event/venue date, time, and timezone                   |
| Paid booking, in-person, India venue     | Same as free booking; verifies Razorpay projection includes fields |
| Hybrid event, viewer abroad              | Email remains anchored to venue/event timezone                     |
| Online event, no recipient timezone      | Email uses clearly labeled stable event/host timezone              |
| Online event, trusted recipient timezone | Email may show recipient local time plus host/event context        |
| New York DST transition                  | Correct offset for the event date, not a fixed offset              |
| London, Nepal, India, Sydney             | Correct non-hour and daylight offsets                              |
| Legacy event without `startAtUTC`        | Safe fallback; no crash; legacy behavior is observable             |
| Invalid timezone/date                    | Safe fallback or controlled error; no payment/booking rollback     |
| Email provider failure                   | Booking/order remains successful and failure is logged/retriable   |
| Repeated payment verification            | No duplicate order/receipt regression                              |

## Final recommendation

Keep the architectural change and the React Email migration. They are aligned with modern applications: one canonical UTC instant, an explicit event timezone, shared formatting helpers, and one maintained email component per template.

Do not ship the diff unchanged, however. The paid receipt currently drops the new fields at the database projection, and the online-email behavior is not actually recipient-local. Fix the Razorpay projection immediately, then make the email timezone policy explicit. After those changes and the test matrix above, the migration is safe and should feel familiar to users rather than surprising.

## Implementation update

The recommended email fixes have now been implemented in the working tree:

* Paid Razorpay verification now selects `mode`, `timezone`, and `startAtUTC`.

* Free and paid email payloads now carry the event mode.

* The booking flow captures the browser's IANA timezone for email presentation.

* The server validates the supplied recipient timezone before using it.

* Online emails show attendee-local time first and host time second when the recipient timezone is available.

* Online emails fall back to clearly labeled host/event time when it is unavailable.

* In-person and hybrid emails keep event/venue time primary and may show attendee-local context.

* Booking confirmation and receipt templates now use a shared email-specific formatter.

* The UTC instant and database booking/order behavior remain unchanged.

* Three email timezone matrix tests were added; the timezone test file now passes 11 tests.

The recipient timezone is intentionally not used for authorization, payment, access control, countdowns, or database event calculations. It is presentation-only. If a future retry/outbox system sends the email after the booking request, the timezone should be persisted as part of an email or schedule snapshot rather than relying on the original browser request.

BATCH 3 — Whole-Application Final Sweep Classification
Files from toLocaleDateString|toLocaleTimeString|toLocaleString search (excluding lib/time.ts and tests):
File	Matched Line
app/(dashboard)/dashboard/events/\[eventId]/settings/page.tsx:117	settings.price.toLocaleString("en-IN")
components/CommentSection.tsx:121	new Date(comment.createdAt).toLocaleDateString()
components/PaymentSuccessModal.tsx:189	amount.toLocaleString("en-IN")
components/dashboard/analytics/AttendedAnalytics.tsx:124,125,178,181	toLocaleString("en-IN") on revenue/price
components/dashboard/analytics/Charts.tsx:207,251,279,341	toLocaleString("en-IN") on numbers
components/dashboard/analytics/OrganizedAnalytics.tsx:111,137,177,179	toLocaleString("en-IN") on revenue/attendees
components/dashboard/analytics/PersonalAnalyticsSummary.tsx:42	value.toLocaleString("en-IN")
components/dashboard/EventTicket.tsx:246	price.toLocaleString("en-IN")
components/dashboard/notifications-bell.tsx:42	new Date(input).toLocaleDateString("en-IN", ...)
components/dashboard/organized-events-tabs.tsx:12	new Date(d).toLocaleDateString("en-IN", ...)
components/dashboard/organized-events-tabs.tsx:25	totalRevenue.toLocaleString("en-IN")
components/dashboard/organized-events-tabs.tsx:131	ev.revenue.toLocaleString("en-IN")
components/profile/BadgesSection.tsx:89	new Date(state.unlockedAt).toLocaleDateString(...)
components/uitripled/native-counter-up-carbon.tsx:78	displayValue.toLocaleString(undefined, ...)
components/create-event/preview/EventPreview\.tsx:14	d.toLocaleDateString(undefined, ...)
components/gate/AttendeeRow\.tsx:72	(attendee.pricePaise / 100).toLocaleString("en-IN")
components/gate/gate-format.ts:29,41	date.toLocaleTimeString(...), d.toLocaleTimeString(...)
components/room/LiveRoomScreen.tsx:169	new Date(value).toLocaleTimeString(...)
components/BookEvent.tsx:281,332	price.toLocaleString("en-IN")
components/event-dashboard/analytics/EventAnalyticsView\.tsx:39,97,135	toLocaleString("en-IN") on revenue/amount
components/EventCardv3.tsx:178	price.toLocaleString("en-IN")
components/FigmaEventCardV2.tsx:118,174	attendees.toLocaleString, price.toLocaleString
components/FigmaEventCard.tsx:68,72	price.toLocaleString, attendees.toLocaleString
components/EventCardV2.tsx:202,212	price.toLocaleString("en-IN")
lib/actions/overall-analytics.ts:93	date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
lib/email/templates/BookingConfirmation.tsx:139	data.price.toLocaleString("en-IN")
lib/email/templates/OrderReceipt.tsx:128	data.amount.toLocaleString("en-IN")
lib/email/templates/OrganizerReminder.tsx:81	data.attendeeCount.toLocaleString("en-IN")
lib/event-dashboard/activity.ts:52	paiseToRupees(...).toLocaleString("en-IN")
lib/event-dashboard/overview\.ts:243	totalRevenue.toLocaleString("en-IN")
Files from new Date( search (excluding lib/time.ts and tests):
File
app/api/events/route.ts:377
components/CommentSection.tsx:121
components/Footer/FooterBottom.tsx:4
components/dashboard/notifications-bell.tsx:29,42,237,271,295
components/dashboard/organized-events-tabs.tsx:12
components/profile/BadgesSection.tsx:89
components/create-event/preview/EventPreview\.tsx:12
components/gate/AttendeeList.tsx:60
components/gate/GateShell.tsx:43
components/gate/gate-format.ts:28,39
components/room/PreMeetingUpdates.tsx:39
components/room/LiveRoomScreen.tsx:169,1869,1884,1887,2004
components/room/RoomGate.tsx:62,63
components/room/AnimatedNumberCountdown.tsx:37,38
components/BookEvent.tsx:99
components/ViewerTimestamp.tsx:16
components/ViewerTimestampParts.tsx:17
components/ViewerTimezoneLabel.tsx:10
lib/actions/notification.actions.ts:152,171
lib/actions/profile.actions.ts:390,449
lib/actions/room.actions.ts:29,34,81,212,235,336,364,378,385,401
lib/actions/room.discussion.actions.ts:449
lib/actions/room.stage.actions.ts:70
lib/actions/dashboard.actions.ts:101,103,208
lib/actions/gate.actions.ts:129,140,256,264,388,503,699,753,790
lib/actions/overall-analytics.ts:109,110,111,129,135,168,191,192,236,241,303,365,371,382,490,498,520,528,547,574,591
lib/actions/event.actions.ts:25,26,112,183
lib/co-organizer-invites.ts:167,187,229,253,295
lib/discover-events.ts:178
lib/event-dashboard/access.ts:66,67
lib/event-dashboard/activity.ts:20,21,71,88
lib/event-dashboard/applicants.ts:72
lib/event-dashboard/overview\.ts:91,188,189,191,208
lib/notifications.ts:95
database/event.model.ts:108
Summary of Real Gaps (BUCKET C — need fixing):

1. components/dashboard/organized-events-tabs.tsx:12 — formatDate(ev.date) displays event date without getEventDisplayTime
2. lib/actions/dashboard.actions.ts:101,103,208 — Event date comparison/sorting uses raw event.date
3. lib/actions/event.actions.ts:25,26 — Event start resolution uses raw event.date
4. lib/event-dashboard/access.ts:66,67 — Event sorting uses raw date/startAtUTC
5. lib/event-dashboard/overview\.ts:91,188,189,191,208 — Reporting/sorting uses raw event.date
   Deliberately Deferred (BUCKET D — confirmed still only these):
6. components/create-event/preview/EventPreview\.tsx — Preview mode uses local calendar date (tracking comment present)
7. app/(site)/page.tsx — Not in grep results (no longer has the issue)
8. SeoEventListing.tsx — Not in grep results (no longer has the issue)
   Status: ✅ Done — Audit complete. Real gaps identified above.

Here is the current behavior, separated between the event dashboard and confirmation emails.
Assume:

* Event timezone: America/Los\_Angeles

* Event time: September 30, 2026, 4:30 AM

* Organizer: New York

* Attendee: India
  That same event instant is:

* Los Angeles: 4:30 AM PDT

* New York organizer: 7:30 AM EDT

* India attendee: 5:00 PM IST
  Case 1: Online event, organizer and attendee in different timezones
  Free registration
  Current flow:
  Attendee books event
  → Booking stored
  → Free confirmation email generated
  The free-booking query correctly retrieves:
  timezone
  startAtUTC
  However, the email template does not receive the event mode, and it does not know the attendee’s timezone.
  Therefore, the email currently displays the event timezone as the primary time, usually:
  September 30, 2026 · 4:30 AM PDT
  It does not reliably display:
  Your time: 5:00 PM IST
  The attendee’s browser timezone is not available because the email is rendered on the server.
  Paid order
  The paid flow should behave the same as the free flow, but there is currently an important bug.
  The Razorpay route selects:
  .select("price title slug date time location")
  It does not select:
  timezone
  startAtUTC
  So the paid receipt usually receives those fields as undefined and falls back to the legacy date/time calculation.
  Possible result:
  September 30, 2026 · 4:30 AM GMT+5:30
  That could be incorrect because the system may interpret the event using its default fallback timezone.
  Organizer dashboard
  The organizer in New York should see the online event in their own timezone:
  September 30, 2026 · 7:30 AM EDT
  The attendee in India should see:
  September 30, 2026 · 5:00 PM IST
  Both users still refer to the same UTC instant and countdown.
  The dashboard behavior is different from email behavior because the browser timezone is available in the dashboard.
  Case 2: In-person event, organizer and attendee in different timezones
  Assume the venue is in Los Angeles.
  Free registration
  The attendee in India receives the event schedule anchored to the venue:
  Event time: September 30, 2026 · 4:30 AM PDT
  This is correct because the attendee must physically arrive in Los Angeles.
  The organizer in New York sees the dashboard primary time as:
  September 30, 2026 · 4:30 AM PDT
  They may also see their local equivalent as secondary context:
  Your time: 7:30 AM EDT
  Paid order
  The intended behavior is identical to the free registration.
  However, the paid path currently has the missing-field bug described above. After fixing the Razorpay query, the receipt will correctly use:
  startAtUTC
  timezone: America/Los\_Angeles
  Important result
  For in-person events, the attendee’s local timezone should not replace the venue timezone. The venue time must remain primary.
  Case 3: Hybrid event, same event but viewers in different timezones
  Hybrid events should follow the physical venue timezone as the primary schedule.
  Free registration
  The attendee in India should see:
  Event time: September 30, 2026 · 4:30 AM PDT
  Your local time: 5:00 PM IST
  The New York organizer should see:
  Event time: September 30, 2026 · 4:30 AM PDT
  Your local time: 7:30 AM EDT
  The online attendee still needs the venue time for coordination, but the local time is useful for deciding whether they can join remotely.
  Paid order
  The same display policy should apply to the paid receipt once the Razorpay query includes the timezone fields.
  Free booking versus paid order
  The business behavior is intended to be the same:
  Item	Free registration	Paid order
  Stored attendance/order instant	UTC-compatible database timestamp	UTC-compatible database timestamp
  Event schedule source	Event timezone and startAtUTC	Intended to be event timezone and startAtUTC
  Current query	Correctly selects new timezone fields	Missing new timezone fields
  Confirmation type	Booking confirmation	Payment receipt
  Main current defect	Online recipient timezone unavailable	Missing timezone and startAtUTC projection

The difference between free and paid users should only be the payment information. Their event schedule must be calculated from the same canonical event instant.
What currently needs fixing
Required immediately
Update the Razorpay query:
.select("price title slug date time location timezone startAtUTC")
Without this, paid receipts do not receive the timezone migration data.
Required for correct online email behavior
Add mode to the email data:
mode?: string;
Pass it from the event query to both email templates.
However, even with mode, an email still cannot know the attendee’s browser timezone. Therefore, choose one of these policies:

1. Safest default:
   Online event time: September 30, 2026 · 4:30 AM PDT
2. If user timezone is saved:
   Your time: September 30, 2026 · 5:00 PM IST
   Host time: 4:30 AM PDT
   Do not label the server timezone as the attendee’s local time.
   Recommended email display
   For clarity, use labels such as:
   Event time
   September 30, 2026 · 4:30 AM PDT

Your local time
September 30, 2026 · 5:00 PM IST
Only show “Your local time” when a trusted recipient timezone is available.
Final understanding
The intended architecture is correct:
Database:
UTC instant

Dashboard:
Viewer-local time for online events
Venue/event time for in-person and hybrid events

Email:
Stable event/venue time by default
Recipient-local time only when the recipient timezone is known
Currently:

* Free booking timezone plumbing is mostly working.

* Paid order timezone plumbing is incomplete because of the Razorpay projection.

* Dashboard viewer-local behavior can work because the browser timezone is available.

* Emails cannot automatically use the viewer’s browser timezone.

* In-person and hybrid events should remain anchored to the event timezone.

* Online emails need an explicit timezone policy before being considered fully international-safe.
