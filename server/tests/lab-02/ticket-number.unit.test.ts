import { describe, it, expect } from "vitest";
import {
  formatTicketNumber,
  nextSequence,
} from "../../src/lab-02/ticket-number.js";

// UT-01 .. UT-03 from docs/lab-02/tests.md section 2.1.
//
// These cover the pure core of ticket-number allocation only. tests.md fixes
// the unit level as "pure functions ... without database or HTTP cost", so the
// sequence row is passed in and returned rather than read and written here.
// Allocating inside the ticket insert transaction (BR-05) is proven by API-01
// and API-03 in Issue #16, not at this level.

describe("formatTicketNumber (UT-01 - AC-09, BR-04)", () => {
  it("formats as TKT-YYYY-NNNNN for the current year", () => {
    const year = new Date().getUTCFullYear();

    const ticketNumber = formatTicketNumber(year, 42);

    expect(ticketNumber).toBe(`TKT-${year}-00042`);
    expect(ticketNumber).toMatch(/^TKT-\d{4}-\d{5}$/);
  });

  it("zero-pads the sequence to five digits", () => {
    expect(formatTicketNumber(2026, 1)).toBe("TKT-2026-00001");
    expect(formatTicketNumber(2026, 99999)).toBe("TKT-2026-99999");
  });
});

describe("nextSequence (UT-02 - AC-10)", () => {
  it("increments by one on two consecutive allocations", () => {
    const now = new Date("2026-09-04T00:00:00.000Z");

    const first = nextSequence(null, now);
    const second = nextSequence(first, now);

    expect(second.lastValue - first.lastValue).toBe(1);
    expect(second.year).toBe(first.year);
  });

  it("produces different ticket numbers for two consecutive allocations", () => {
    const now = new Date("2026-09-04T00:00:00.000Z");

    const first = nextSequence(null, now);
    const second = nextSequence(first, now);

    expect(formatTicketNumber(second.year, second.lastValue)).not.toBe(
      formatTicketNumber(first.year, first.lastValue),
    );
  });
});

describe("nextSequence (UT-03 - BR-04)", () => {
  it("starts at 1 when no row exists for any year yet", () => {
    const allocated = nextSequence(null, new Date("2026-01-01T00:00:00.000Z"));

    expect(allocated).toEqual({ year: 2026, lastValue: 1 });
  });

  it("restarts at 1 when the year changes", () => {
    const endOfYear = { year: 2026, lastValue: 417 };

    const allocated = nextSequence(endOfYear, new Date("2027-01-01T00:00:00.000Z"));

    expect(allocated).toEqual({ year: 2027, lastValue: 1 });
  });

  it("does not restart within the same year", () => {
    const midYear = { year: 2026, lastValue: 417 };

    const allocated = nextSequence(midYear, new Date("2026-12-31T23:59:59.000Z"));

    expect(allocated).toEqual({ year: 2026, lastValue: 418 });
  });
});
