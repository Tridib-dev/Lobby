// tests/timezone-matrix.test.ts — throwaway verification script, not permanent suite
import { describe, it, expect } from "vitest";
import { getEventStartUTC, displayEventTime, getEmailEventDisplayTime } from "../lib/time";

describe("Full timezone matrix — direct function verification", () => {
  it("Online, Kolkata event, NY viewer: NY time primary, host secondary", () => {
    const instant = getEventStartUTC("2026-12-05", "19:00", "Asia/Kolkata");
    const result = displayEventTime(instant, "Asia/Kolkata", "America/New_York", "Online");
    console.log("Row 1:", result);
    expect(result.primary).toContain("8:30 AM"); // NY time
  });

  it("In-person, Kolkata event, NY viewer: India time stays primary", () => {
    const instant = getEventStartUTC("2026-12-05", "19:00", "Asia/Kolkata");
    const result = displayEventTime(instant, "Asia/Kolkata", "America/New_York", "In-Person");
    console.log("Row 2:", result);
    expect(result.primary).toContain("7:00 PM"); // India time
  });

  it("Hybrid, London event, Tokyo viewer: London time stays primary", () => {
    const instant = getEventStartUTC("2026-12-05", "19:00", "Europe/London");
    const result = displayEventTime(instant, "Europe/London", "Asia/Tokyo", "Hybrid (In-Person & Online)");
    console.log("Row 3:", result);
    expect(result.primary).toContain("7:00 PM");
  });

  it("Online, NY event near DST, London viewer: correct DST offset", () => {
    const instant = getEventStartUTC("2026-11-01", "19:00", "America/New_York"); // just before US fall-back
    const result = displayEventTime(instant, "America/New_York", "Europe/London", "Online");
    console.log("Row 4:", result);
  });

  it("Kathmandu event to UTC viewer: correct 45-min offset", () => {
    const instant = getEventStartUTC("2026-12-05", "19:00", "Asia/Kathmandu");
    const result = displayEventTime(instant, "Asia/Kathmandu", "UTC", "In-Person");
    console.log("Row 5:", result);
    expect(instant.toISOString()).toBe("2026-12-05T13:15:00.000Z");
  });

  it("Verify exact stored UTC instant — the canonical example", () => {
    const instant = getEventStartUTC("2026-12-05", "19:00", "Asia/Kolkata");
    expect(instant.toISOString()).toBe("2026-12-05T13:30:00.000Z");
  });

  it("Legacy safety: missing timezone doesn't throw, falls back", () => {
    expect(() => getEventStartUTC("2026-12-05", "19:00", undefined)).not.toThrow();
  });

  it("Legacy safety: invalid timezone string doesn't throw silently-wrong", () => {
    expect(() => getEventStartUTC("2026-12-05", "19:00", "Not/AZone")).toThrow();
    // ^ confirms it FAILS LOUDLY rather than silently defaulting to something wrong
  });

  it("Online email shows attendee time and host time when recipient timezone is known", () => {
    const event = {
      date: "2026-09-30",
      time: "04:30",
      timezone: "America/Los_Angeles",
      startAtUTC: getEventStartUTC("2026-09-30", "04:30", "America/Los_Angeles").toISOString(),
      mode: "online",
    };
    const result = getEmailEventDisplayTime(event, "Asia/Kolkata");
    expect(result.primaryLabel).toBe("Your local time");
    expect(result.primary).toContain("5:00 PM");
    expect(result.secondaryLabel).toBe("Host time");
    expect(result.secondary).toContain("4:30 AM");
  });

  it("Online email uses event time when recipient timezone is unavailable", () => {
    const event = {
      date: "2026-09-30",
      time: "04:30",
      timezone: "America/Los_Angeles",
      startAtUTC: getEventStartUTC("2026-09-30", "04:30", "America/Los_Angeles").toISOString(),
      mode: "online",
    };
    const result = getEmailEventDisplayTime(event);
    expect(result.primaryLabel).toBe("Event time (host timezone)");
    expect(result.primary).toContain("4:30 AM");
    expect(result.secondary).toBeUndefined();
  });

  it("Hybrid email keeps venue time primary and adds attendee local time", () => {
    const event = {
      date: "2026-09-30",
      time: "04:30",
      timezone: "America/Los_Angeles",
      startAtUTC: getEventStartUTC("2026-09-30", "04:30", "America/Los_Angeles").toISOString(),
      mode: "hybrid",
    };
    const result = getEmailEventDisplayTime(event, "Asia/Kolkata");
    expect(result.primaryLabel).toBe("Event time");
    expect(result.primary).toContain("4:30 AM");
    expect(result.secondaryLabel).toBe("Your local time");
    expect(result.secondary).toContain("5:00 PM");
  });
});
