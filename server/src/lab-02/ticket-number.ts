// Ticket-number allocation (BR-04, BR-05, AC-09, AC-10).
//
// The two pure functions below hold the whole of the format and sequence rule
// and are unit-tested by UT-01..UT-03. The caller owns the database: it reads
// the TicketNumberSequence row, calls nextSequence, writes the result, and
// formats the number, all inside the transaction that inserts the Ticket
// (BR-05). Keeping the rule pure means the boundary cases -- first allocation
// of all time, first of a new year, and the roll from one number to the next
// -- are exhaustively testable without a database.

/** A TicketNumberSequence row: the last value issued for a given year. */
export type SequenceState = {
  year: number;
  lastValue: number;
};

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
 * Returns the sequence state that should follow `current` at time `now`.
 *
 * Pass null when no row exists for the current year yet. The sequence resets
 * annually (BR-04), so a row from an earlier year restarts at 1 rather than
 * continuing. The year is read in UTC because all timestamps are stored in UTC
 * (BR-09) -- taking it in local time would issue a number from the wrong year
 * either side of midnight on 31 December.
 */
export function nextSequence(
  current: SequenceState | null,
  now: Date,
): SequenceState {
  const year = now.getUTCFullYear();

  if (current === null || current.year !== year) {
    return { year, lastValue: 1 };
  }

  return { year, lastValue: current.lastValue + 1 };
}
