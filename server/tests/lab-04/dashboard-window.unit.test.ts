import { describe, it, expect, afterEach, vi } from "vitest";
import { dashboardWindow } from "../../src/lab-04/dashboard-window.js";

// UT-06 from docs/lab-04/tests.md section 2.1 (AC-26, BR-36).
//
// The expected values are written out by hand: 00:00 Asia/Bangkok (fixed
// +07:00, A-02) six calendar days before the Bangkok date, expressed in UTC.
// The Bangkok date changes at 17:00 UTC, so 16:59:59 and 17:00:00 UTC are
// added beside the four clock times tests.md lists.

afterEach(() => {
  vi.useRealTimers();
});

function at(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
  return dashboardWindow();
}

describe("dashboard recent window (UT-06 - AC-26, BR-36)", () => {
  it.each([
    // 30 Oct UTC, all still 30 Oct in Bangkok: from = 24 Oct 00:00 +07:00.
    ["2026-10-30T00:00:00.000Z", "2026-10-23T17:00:00.000Z"],
    ["2026-10-30T06:59:59.000Z", "2026-10-23T17:00:00.000Z"],
    ["2026-10-30T07:00:00.000Z", "2026-10-23T17:00:00.000Z"],
    ["2026-10-30T16:59:59.999Z", "2026-10-23T17:00:00.000Z"],
    // 17:00 UTC is 00:00 on 31 Oct in Bangkok: from = 25 Oct 00:00 +07:00.
    ["2026-10-30T17:00:00.000Z", "2026-10-24T17:00:00.000Z"],
    ["2026-10-30T23:59:59.000Z", "2026-10-24T17:00:00.000Z"],
  ])("at %s the window starts at %s", (now, from) => {
    const window = at(now);

    expect(window.from.toISOString()).toBe(from);
    expect(window.to.toISOString()).toBe(now);
    expect(window.timeZone).toBe("Asia/Bangkok");
  });

  it.each([
    // 3 Nov in Bangkok: from = 28 Oct 00:00 +07:00, across the month boundary.
    ["2026-11-03T05:00:00.000Z", "2026-10-27T17:00:00.000Z"],
    // 23:30 UTC on 31 Oct is 06:30 on 1 Nov in Bangkok: from = 26 Oct.
    ["2026-10-31T23:30:00.000Z", "2026-10-25T17:00:00.000Z"],
    // 2 Jan 2027 in Bangkok: from = 27 Dec 2026, across the year boundary.
    ["2027-01-02T01:00:00.000Z", "2026-12-26T17:00:00.000Z"],
    // 1 Mar 2027 in Bangkok (February has 28 days): from = 23 Feb.
    ["2027-03-01T10:00:00.000Z", "2027-02-22T17:00:00.000Z"],
  ])("across a boundary, at %s the window starts at %s", (now, from) => {
    expect(at(now).from.toISOString()).toBe(from);
  });

  it("takes an explicit time without reading the clock", () => {
    const window = dashboardWindow(new Date("2026-10-30T13:00:00.000Z"));

    // The api-spec section 5.1 example.
    expect(window.from.toISOString()).toBe("2026-10-23T17:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-10-30T13:00:00.000Z");
  });
});
