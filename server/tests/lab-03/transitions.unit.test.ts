import { describe, it, expect } from "vitest";
import {
  ASSIGNABLE_STATUSES,
  CLAIMABLE_STATUSES,
  IT_PRIORITY_EDITABLE_STATUSES,
  TICKET_STATUSES,
  isTransitionPermitted,
  requiresOwner,
  requiresReason,
  type TicketStatus,
} from "../../src/lab-03/transitions.js";

// UT-09 and UT-10 from docs/lab-03/tests.md section 2.1 (AC-39, AC-40, AC-43,
// BR-35, BR-36). The expected values are copied from specification.md
// section 5.6 by hand, not derived from the module under test.

const ALL: TicketStatus[] = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
];

/** The transition matrix (BR-35), all 18 rows. */
const MATRIX: [TicketStatus, TicketStatus][] = [
  ["NEW", "OPEN"],
  ["NEW", "CANCELLED"],
  ["OPEN", "IN_PROGRESS"],
  ["OPEN", "RESOLVED"],
  ["OPEN", "CANCELLED"],
  ["IN_PROGRESS", "WAITING_FOR_REQUESTER"],
  ["IN_PROGRESS", "RESOLVED"],
  ["IN_PROGRESS", "CANCELLED"],
  ["WAITING_FOR_REQUESTER", "IN_PROGRESS"],
  ["WAITING_FOR_REQUESTER", "RESOLVED"],
  ["WAITING_FOR_REQUESTER", "CANCELLED"],
  ["REOPENED", "IN_PROGRESS"],
  ["REOPENED", "RESOLVED"],
  ["REOPENED", "CANCELLED"],
  ["RESOLVED", "CLOSED"],
  ["RESOLVED", "REOPENED"],
  ["CLOSED", "REOPENED"],
  ["CANCELLED", "REOPENED"],
];

const inMatrix = (from: TicketStatus, to: TicketStatus) =>
  MATRIX.some(([f, t]) => f === from && t === to);

const allPairs = ALL.flatMap((from) => ALL.map((to) => [from, to] as [TicketStatus, TicketStatus]));

describe("transition matrix, exhaustive (UT-09 - AC-39, BR-35)", () => {
  it("knows exactly the eight statuses (BR-34)", () => {
    expect([...TICKET_STATUSES].sort()).toEqual([...ALL].sort());
  });

  it("covers all 64 (from, to) pairs", () => {
    expect(allPairs).toHaveLength(64);
    expect(MATRIX).toHaveLength(18);
  });

  it.each(["IT_STAFF", "ADMINISTRATOR"] as const)("permits exactly the 18 matrix rows for %s", (role) => {
    const permitted = allPairs.filter(([from, to]) => isTransitionPermitted(from, to, role));

    expect(permitted).toHaveLength(18);
    for (const [from, to] of allPairs) {
      expect(isTransitionPermitted(from, to, role), `${from} -> ${to}`).toBe(inMatrix(from, to));
    }
  });

  it("permits none of the 64 pairs for a Requester (DEV-05)", () => {
    for (const [from, to] of allPairs) {
      expect(isTransitionPermitted(from, to, "REQUESTER"), `${from} -> ${to}`).toBe(false);
    }
  });

  it("refuses every transition into NEW and every transition to the current status", () => {
    for (const from of ALL) {
      expect(isTransitionPermitted(from, "NEW", "IT_STAFF"), `${from} -> NEW`).toBe(false);
      expect(isTransitionPermitted(from, from, "IT_STAFF"), `${from} -> ${from}`).toBe(false);
    }
  });
});

describe("status guards (UT-10 - AC-40, AC-43, BR-36)", () => {
  it("requires an owner to enter OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, and CLOSED only", () => {
    const needsOwner: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED"];
    for (const status of ALL) {
      expect(requiresOwner(status), status).toBe(needsOwner.includes(status));
    }
  });

  it("requires a reason to enter CANCELLED and REOPENED only (BR-37)", () => {
    for (const status of ALL) {
      expect(requiresReason(status), status).toBe(status === "CANCELLED" || status === "REOPENED");
    }
  });

  it("allows claim, assign, and reassign in NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, and REOPENED (BR-32)", () => {
    const expected = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"].sort();
    expect([...CLAIMABLE_STATUSES].sort()).toEqual(expected);
    expect([...ASSIGNABLE_STATUSES].sort()).toEqual(expected);
  });

  it("allows IT Priority changes in every status except CLOSED and CANCELLED (BR-33)", () => {
    const expected = ALL.filter((s) => s !== "CLOSED" && s !== "CANCELLED").sort();
    expect([...IT_PRIORITY_EDITABLE_STATUSES].sort()).toEqual(expected);
  });
});
