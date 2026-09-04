import { describe, it, expect, afterAll } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { allocateTicketNumber } from "../../src/lab-02/ticket-number.js";

// UT-02 and UT-03 from docs/lab-02/tests.md section 2.1.
//
// These were unit tests of a JavaScript successor function. The increment now
// happens in the database, because computing it in application code is not
// safe under concurrency (BR-05, API-41), so the behaviour is asserted against
// a real sequence row instead.
//
// Sentinel years far outside any real ticket keep these rows away from live
// data; they are removed in afterAll.

const prisma = getPrisma();

const SAME_YEAR = 2997;
const RESET_FROM = 2998;
const RESET_TO = 2999;

const at = (year: number) => new Date(Date.UTC(year, 5, 1, 12, 0, 0));

afterAll(async () => {
  await prisma.ticketNumberSequence.deleteMany({
    where: { year: { in: [SAME_YEAR, RESET_FROM, RESET_TO] } },
  });
  await prisma.$disconnect();
});

describe("allocateTicketNumber (UT-02 - AC-10)", () => {
  it("increments by one on two consecutive allocations", async () => {
    const first = await allocateTicketNumber(prisma, at(SAME_YEAR));
    const second = await allocateTicketNumber(prisma, at(SAME_YEAR));

    expect(first).toBe(`TKT-${SAME_YEAR}-00001`);
    expect(second).toBe(`TKT-${SAME_YEAR}-00002`);
    expect(second).not.toBe(first);
  });
});

describe("allocateTicketNumber (UT-03 - BR-04)", () => {
  it("starts at 1 for the first ticket of a year", async () => {
    const first = await allocateTicketNumber(prisma, at(RESET_FROM));

    expect(first).toBe(`TKT-${RESET_FROM}-00001`);
  });

  it("restarts at 1 when the year changes, leaving the previous year alone", async () => {
    await allocateTicketNumber(prisma, at(RESET_FROM));
    await allocateTicketNumber(prisma, at(RESET_FROM));

    const newYear = await allocateTicketNumber(prisma, at(RESET_TO));

    // Keyed on year, so a new year finds no row and creates one at 1. There is
    // no reset step that could be forgotten.
    expect(newYear).toBe(`TKT-${RESET_TO}-00001`);

    const previous = await prisma.ticketNumberSequence.findUnique({
      where: { year: RESET_FROM },
    });
    expect(previous!.lastValue).toBeGreaterThan(1);
  });
});
