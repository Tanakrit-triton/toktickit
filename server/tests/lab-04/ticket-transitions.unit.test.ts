import { describe, it, expect } from "vitest";
import { isTransitionPermitted, type TicketStatus } from "../../src/lab-03/transitions.js";
import { requiresResolutionGate, resolvedAtChange } from "../../src/lab-04/workflow.js";

// UT-05 from docs/lab-04/tests.md section 2.1 (AC-16, AC-17, BR-24, BR-25).
// The final matrix is the Lab 3 matrix with the resolution gate added to
// every transition into RESOLVED (specification.md section 5.4). The 18 rows
// and the 4 gated rows are copied from that table by hand.

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

const FINAL_MATRIX: [TicketStatus, TicketStatus, boolean][] = [
  // from, to, gate
  ["NEW", "OPEN", false],
  ["NEW", "CANCELLED", false],
  ["OPEN", "IN_PROGRESS", false],
  ["OPEN", "RESOLVED", true],
  ["OPEN", "CANCELLED", false],
  ["IN_PROGRESS", "WAITING_FOR_REQUESTER", false],
  ["IN_PROGRESS", "RESOLVED", true],
  ["IN_PROGRESS", "CANCELLED", false],
  ["WAITING_FOR_REQUESTER", "IN_PROGRESS", false],
  ["WAITING_FOR_REQUESTER", "RESOLVED", true],
  ["WAITING_FOR_REQUESTER", "CANCELLED", false],
  ["REOPENED", "IN_PROGRESS", false],
  ["REOPENED", "RESOLVED", true],
  ["REOPENED", "CANCELLED", false],
  ["RESOLVED", "CLOSED", false],
  ["RESOLVED", "REOPENED", false],
  ["CLOSED", "REOPENED", false],
  ["CANCELLED", "REOPENED", false],
];

const row = (from: TicketStatus, to: TicketStatus) =>
  FINAL_MATRIX.find(([f, t]) => f === from && t === to);

const pairs = ALL.flatMap((from) => ALL.map((to) => [from, to] as const));

describe("final ticket matrix (UT-05 - AC-16, BR-24)", () => {
  it("covers all 64 pairs", () => {
    expect(pairs).toHaveLength(64);
  });

  it.each(pairs)("%s -> %s is permitted for IT Staff only if it is a matrix row", (from, to) => {
    expect(isTransitionPermitted(from, to, "IT_STAFF")).toBe(row(from, to) !== undefined);
    expect(isTransitionPermitted(from, to, "ADMINISTRATOR")).toBe(row(from, to) !== undefined);
  });

  it("is refused for a Requester in every pair (BR-26)", () => {
    for (const [from, to] of pairs) expect(isTransitionPermitted(from, to, "REQUESTER")).toBe(false);
  });

  it("has exactly 18 rows", () => {
    expect(pairs.filter(([f, t]) => isTransitionPermitted(f, t, "IT_STAFF"))).toHaveLength(18);
  });
});

describe("resolution gate placement (UT-05 - BR-20)", () => {
  it.each(pairs)("%s -> %s carries the gate only if its row says so", (from, to) => {
    expect(requiresResolutionGate(from, to)).toBe(row(from, to)?.[2] ?? false);
  });

  it("gates exactly the 4 transitions into RESOLVED", () => {
    expect(pairs.filter(([f, t]) => requiresResolutionGate(f, t))).toEqual([
      ["OPEN", "RESOLVED"],
      ["IN_PROGRESS", "RESOLVED"],
      ["WAITING_FOR_REQUESTER", "RESOLVED"],
      ["REOPENED", "RESOLVED"],
    ]);
  });
});

describe("resolvedAt effect of a transition (UT-05 - AC-17, BR-25)", () => {
  it("sets it on entering RESOLVED", () => {
    for (const from of ["OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"] as TicketStatus[]) {
      expect(resolvedAtChange(from, "RESOLVED")).toBe("set");
    }
  });

  it("keeps it on RESOLVED -> CLOSED", () => {
    expect(resolvedAtChange("RESOLVED", "CLOSED")).toBe("keep");
  });

  it("clears it on entering REOPENED", () => {
    for (const from of ["RESOLVED", "CLOSED", "CANCELLED"] as TicketStatus[]) {
      expect(resolvedAtChange(from, "REOPENED")).toBe("clear");
    }
  });

  it("keeps it on every other row", () => {
    for (const [from, to] of FINAL_MATRIX) {
      if (to === "RESOLVED" || to === "REOPENED" || (from === "RESOLVED" && to === "CLOSED")) continue;
      expect(resolvedAtChange(from, to)).toBe("keep");
    }
  });
});
