export type CapacitySnapshot = {
  capacity?: number;
  confirmedRegistrationCount?: number;
  reservedRegistrationCount?: number;
};

/** Pure, shared display calculation. Allocation is always enforced server-side. */
export function calculateAvailability(event: CapacitySnapshot) {
  const capacity = event.capacity;
  const confirmed = event.confirmedRegistrationCount ?? 0;
  const reserved = event.reservedRegistrationCount ?? 0;
  return {
    capacity: capacity ?? null,
    confirmed,
    reserved,
    isLimited: typeof capacity === "number",
    remaining: typeof capacity === "number" ? Math.max(0, capacity - confirmed - reserved) : null,
  };
}
