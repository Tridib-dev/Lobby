'use client';

import React from "react";
import { toast } from "sonner";
import { EventDraft } from "../types";
import FreePaidToggle from "../fields/FreePaidToggle";

const MINIMUM_CAPACITY = 5;

interface Step5Props {
  draft: EventDraft;
  onUpdate: (patch: Partial<EventDraft>) => void;
}

const Step5Tickets = ({ draft, onUpdate }: Step5Props) => {
  const hasInvalidCapacity =
    draft.hasCapacityLimit &&
    (!Number.isSafeInteger(draft.capacity) || (draft.capacity ?? 0) < MINIMUM_CAPACITY);

  const showCapacityError = () => {
    if (hasInvalidCapacity) {
      toast.error(`Registration limit must be at least ${MINIMUM_CAPACITY}.`);
    }
  };

  return (
    <>
      <p className="cew-step-eyebrow">Step 5 of 7</p>
      <h1 className="cew-step-title">How does it get paid for?</h1>
      <p className="cew-step-subtitle">You can always adjust pricing later from event settings.</p>

      <div className="cew-step-body">
        <FreePaidToggle
          isFree={draft.isFree}
          price={draft.price}
          onChange={({ isFree, price }) => onUpdate({ isFree, price })}
        />
        <div className="mt-6 rounded-2xl border border-border/80 bg-card p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={draft.hasCapacityLimit}
              onChange={(event) => onUpdate({
                hasCapacityLimit: event.target.checked,
                capacity: event.target.checked ? Math.max(draft.capacity ?? MINIMUM_CAPACITY, MINIMUM_CAPACITY) : null,
              })}
              className="mt-1 h-4 w-4 radius-[15px]"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-900">Limit registrations</span>
              <span className="mt-1 block text-xs text-muted-foreground">One confirmed place per attendee across free and paid registrations.</span>
            </span>
          </label>
          {draft.hasCapacityLimit && (
            <div className="mt-4 max-w-xs">
              <label htmlFor="capacity" className="mb-1 block text-sm font-medium text-slate-800">Maximum participants</label>
              <input
                id="capacity"
                type="number"
                min={MINIMUM_CAPACITY}
                step={1}
                inputMode="numeric"
                value={draft.capacity ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  onUpdate({ capacity: value === "" ? null : Number(value) });
                }}
                onBlur={showCapacityError}
                aria-invalid={hasInvalidCapacity}
                aria-describedby={hasInvalidCapacity ? "capacity-error" : undefined}
                className={`w-full rounded-[8px] border text-slate-950 bg-grey px-3 py-2 text-sm ${hasInvalidCapacity ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "border-border"}`}
                required
              />
              {hasInvalidCapacity && (
                <p id="capacity-error" role="alert" className="mt-1 text-xs text-red-600">
                  Registration limit must be at least {MINIMUM_CAPACITY} participants.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Step5Tickets;
