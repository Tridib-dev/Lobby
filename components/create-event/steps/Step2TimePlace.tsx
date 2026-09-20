'use client';

import React, { useEffect, useMemo, useRef, useState } from "react";
import { EventDraft } from "../types";
import ModeCards from "../fields/ModeCards";
import LocationFields from "../fields/LocationFields";
import { resolveEventTimezoneAction } from "@/lib/actions/geo.actions";

interface Step2Props {
  draft: EventDraft;
  onUpdate: (patch: Partial<EventDraft>) => void;
}

const Step2TimePlace = ({ draft, onUpdate }: Step2Props) => {
  const requestIdRef = useRef(0);
  const [isResolvingTimezone, setIsResolvingTimezone] = useState(false);
  const [timezoneLookupFailed, setTimezoneLookupFailed] = useState(false);
  const { countryCode, stateCode, city } = draft.location;

  const timezoneOptions = useMemo(() => {
    const supported = Intl.supportedValuesOf("timeZone");
    if (draft.timezone && !supported.includes(draft.timezone)) {
      return [draft.timezone, ...supported];
    }
    return supported;
  }, [draft.timezone]);

useEffect(() => {
      // Invalidate any in-flight lookup before checking whether the new
      // location is complete. Otherwise a response for the previous
      // location could still pass the stale-response check.
      const currentRequestId = ++requestIdRef.current;

      if (!countryCode || !stateCode || !city) {
        onUpdate({ timezone: "" });
        return;
      }

      // Clear any previous/default timezone immediately when location changes.
      onUpdate({ timezone: "" });

      const timeout = setTimeout(async () => {
        setIsResolvingTimezone(true);
        setTimezoneLookupFailed(false);
        try {
          const resolved = await resolveEventTimezoneAction(
            countryCode,
            stateCode,
            city
          );

          // Ignore stale responses.
          if (currentRequestId !== requestIdRef.current) {
            return;
          }

          console.log("TIMEZONE DEBUG:", {
            countryCode,
            stateCode,
            city,
            resolved,
          });

          onUpdate({
            timezone: resolved ?? "",
          });
          setIsResolvingTimezone(false);
          setTimezoneLookupFailed(!resolved);
        } catch (error) {
          if (currentRequestId !== requestIdRef.current) {
            return;
          }

          console.error("TIMEZONE RESOLUTION FAILED:", error);
          onUpdate({ timezone: "" });
          setIsResolvingTimezone(false);
          setTimezoneLookupFailed(true);
        }
      }, 600);

      return () => {
        clearTimeout(timeout);
      };
    }, [
      countryCode,
      stateCode,
      city,
      onUpdate,
    ]);

  console.log("RENDER TIMEZONE:", {
    draftTimezone: draft.timezone,
    city,
    countryCode,
    stateCode,
  });

  // Treat an incomplete location as having no active lookup. This also
  // hides any stale pending/error state while the user is selecting again.
  const hasLocation = Boolean(countryCode && stateCode && city);
  const isTimezonePending = hasLocation && isResolvingTimezone;
  const hasTimezoneLookupFailed = hasLocation && timezoneLookupFailed;

  return (
    <>
      <p className="cew-step-eyebrow">Step 2 of 7</p>
      <h1 className="cew-step-title">When and where does it happen?</h1>
      <p className="cew-step-subtitle">Pin down the logistics — attendees plan around this first.</p>

      <div className="cew-step-body">
        <div className="field-row">
          <div className="field">
            <label htmlFor="date">Date</label>
            <input id="date" name="date" type="date" value={draft.date} onChange={(e) => onUpdate({ date: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="time">Time</label>
            <input id="time" name="time" type="time" value={draft.time} onChange={(e) => onUpdate({ time: e.target.value })} />
          </div>
        </div>

        <ModeCards value={draft.mode} onChange={(mode) => onUpdate({ mode })} />

        <div className="field-row">
          <div className="field">
            <label htmlFor="venue">Venue</label>
            <input id="venue" name="venue" type="text" value={draft.venue} onChange={(e) => onUpdate({ venue: e.target.value })} placeholder="Moscone Center" />
          </div>
          <div className="field">
            <label htmlFor="address">Address</label>
            <input id="address" name="address" type="text" value={draft.address} onChange={(e) => onUpdate({ address: e.target.value })} placeholder="747 Howard St" />
          </div>
        </div>

        <LocationFields onChange={(location) => onUpdate({ location })} />

        <div className="field">
          <label htmlFor="timezone">Event timezone</label>
          <select
            id="timezone"
            value={draft.timezone}
            onChange={(e) => onUpdate({ timezone: e.target.value })}
            required
            disabled={!draft.location.city}
          >
            <option value="" disabled>
              {!draft.location.city
                ? "Select a location first"
                : isTimezonePending
                  ? "Detecting…"
                  : "Select a timezone"}
            </option>
            {timezoneOptions.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
          {hasTimezoneLookupFailed && (
            <p className="field-hint">Timezone could not be detected. Please select it manually.</p>
          )}
        </div>
      </div>
    </>
  );
};

export default Step2TimePlace;
