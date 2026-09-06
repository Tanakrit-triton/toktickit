// Ticket-number allocation (BR-04, BR-05, AC-09, AC-10).

/** Width of the zero-padded sequence in TKT-YYYY-NNNNN (BR-04). */
const SEQUENCE_WIDTH = 5;

/**
 * Renders the official Ticket Number, e.g. formatTicketNumber(2026, 42)
 * returns "TKT-2026-00042" (BR-04, AC-09).
 */
export function formatTicketNumber(year: number, sequence: number): string {
  return `TKT-${year}-${String(sequence).padStart(SEQUENCE_WIDTH, "0")}`;
}

/**
 * The subset of the Prisma client this allocator needs. Declared structurally
 * so the transaction client can be passed in without importing Prisma's
 * generated transaction type.
 */
export interface SequenceStore {
  ticketNumberSequence: {
    upsert(args: {
      where: { year: number };
      update: { lastValue: { increment: number } };
      create: { year: number; lastValue: number };
    }): Promise<{ year: number; lastValue: number }>;
  };
}

/**
 * Allocates the next Ticket Number for the year of `now`, and returns it.
 *
 * The increment happens IN THE DATABASE. Reading the row, adding one in
 * JavaScript, and writing the result back is not safe under concurrency even
 * inside a transaction: at READ COMMITTED two callers both read the same
 * value, both compute the same successor, and the second simply overwrites the
 * first with an identical number. `increment` makes the read-modify-write a
 * single atomic statement, so the row lock serialises the callers and each one
 * receives a distinct value (BR-05).
 *
 * The annual reset is expressed by the primary key: the sequence is keyed on
 * year, so the first ticket of a new year finds no row and creates one at 1
 * (BR-04). No separate reset step exists to forget to run.
 *
 * Must be called with a transaction client so the allocation commits or rolls
 * back together with the Ticket insert.
 */
export async function allocateTicketNumber(tx: SequenceStore, now: Date): Promise<string> {
  // getUTCFullYear, not getFullYear: timestamps are stored in UTC (BR-09), and
  // local time would issue a number from the wrong year either side of
  // midnight on 31 December.
  const year = now.getUTCFullYear();

  const sequence = await tx.ticketNumberSequence.upsert({
    where: { year },
    update: { lastValue: { increment: 1 } },
    create: { year, lastValue: 1 },
  });

  return formatTicketNumber(year, sequence.lastValue);
}
