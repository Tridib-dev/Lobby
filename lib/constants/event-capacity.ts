/**
 * The minimum number of participants allowed when an organizer limits
 * registrations. This module is client-safe, so the UI, API, and schema
 * always enforce the same policy.
 */
export const MIN_EVENT_CAPACITY = 2;

export const isValidEventCapacity = (capacity: number | null | undefined): boolean =>
  Number.isSafeInteger(capacity) && (capacity ?? 0) >= MIN_EVENT_CAPACITY;
