import { describe, expect, it } from "vitest";
import { calculateAvailability } from "../lib/capacity";

describe("registration inventory availability", () => {
  it("keeps legacy events unlimited", () => {
    expect(calculateAvailability({ confirmedRegistrationCount: 500, reservedRegistrationCount: 10 })).toEqual({
      capacity: null,
      confirmed: 500,
      reserved: 10,
      isLimited: false,
      remaining: null,
    });
  });

  it("subtracts both confirmed registrations and payment holds", () => {
    expect(calculateAvailability({ capacity: 10, confirmedRegistrationCount: 6, reservedRegistrationCount: 3 })).toMatchObject({
      capacity: 10,
      confirmed: 6,
      reserved: 3,
      isLimited: true,
      remaining: 1,
    });
  });

  it("never exposes a negative public availability", () => {
    expect(calculateAvailability({ capacity: 3, confirmedRegistrationCount: 3, reservedRegistrationCount: 2 }).remaining).toBe(0);
  });

  it("handles older documents that do not yet have inventory counters", () => {
    expect(calculateAvailability({ capacity: 2 })).toMatchObject({ confirmed: 0, reserved: 0, remaining: 2 });
  });
});
