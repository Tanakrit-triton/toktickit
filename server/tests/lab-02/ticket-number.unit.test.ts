import { describe, it, expect } from "vitest";
import { formatTicketNumber } from "../../src/lab-02/ticket-number.js";

// UT-01 from docs/lab-02/tests.md section 2.1.
//
// Only the formatting rule is a pure function now. UT-02 and UT-03 moved to
// ticket-number.api.test.ts when the increment moved into the database: the
// behaviour they assert is no longer expressible in application code, and a
// unit test of a JavaScript successor function would have been testing
// something the product no longer does.

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
