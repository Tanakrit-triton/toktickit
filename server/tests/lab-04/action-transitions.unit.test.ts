import { describe, it, expect } from "vitest";
import {
  ACTION_STATUSES,
  CREATABLE_ACTION_STATUSES,
  isActionTransitionPermitted,
  isOpenActionStatus,
  ACTION_EDITABLE_TICKET_STATUSES,
  type ActionStatus,
} from "../../src/lab-04/action-rules.js";

// UT-01 from docs/lab-04/tests.md section 2.1 (AC-07, BR-13 to BR-15, BR-17).
// The expected values are copied from specification.md section 5.2 by hand,
// not derived from the module under test.

const ALL: ActionStatus[] = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

/** The action transition table (BR-15), all 5 rows. */
const TABLE: [ActionStatus, ActionStatus][] = [
  ["PLANNED", "IN_PROGRESS"],
  ["PLANNED", "COMPLETED"],
  ["PLANNED", "CANCELLED"],
  ["IN_PROGRESS", "COMPLETED"],
  ["IN_PROGRESS", "CANCELLED"],
];

const listed = (from: ActionStatus, to: ActionStatus) =>
  TABLE.some(([f, t]) => f === from && t === to);

describe("action statuses (UT-01 - BR-13)", () => {
  it("are exactly the four statuses in specification order", () => {
    expect([...ACTION_STATUSES]).toEqual(ALL);
  });

  it("can be created as PLANNED, IN_PROGRESS, or COMPLETED, never CANCELLED (BR-14)", () => {
    expect([...CREATABLE_ACTION_STATUSES].sort()).toEqual(["COMPLETED", "IN_PROGRESS", "PLANNED"]);
  });

  it("treats PLANNED and IN_PROGRESS as open, and the terminal statuses as not open", () => {
    expect(ALL.filter(isOpenActionStatus)).toEqual(["PLANNED", "IN_PROGRESS"]);
  });
});

describe("action transition table (UT-01 - AC-07, BR-15)", () => {
  const pairs = ALL.flatMap((from) => ALL.map((to) => [from, to] as const));

  it("covers all 16 pairs", () => {
    expect(pairs).toHaveLength(16);
  });

  it.each(pairs)("%s -> %s is permitted only if it is a table row", (from, to) => {
    expect(isActionTransitionPermitted(from, to)).toBe(listed(from, to));
  });

  it("permits exactly 5 pairs", () => {
    expect(pairs.filter(([f, t]) => isActionTransitionPermitted(f, t))).toHaveLength(5);
  });

  it("refuses setting the current status again", () => {
    for (const s of ALL) expect(isActionTransitionPermitted(s, s)).toBe(false);
  });

  it("treats COMPLETED and CANCELLED as terminal", () => {
    for (const to of ALL) {
      expect(isActionTransitionPermitted("COMPLETED", to)).toBe(false);
      expect(isActionTransitionPermitted("CANCELLED", to)).toBe(false);
    }
  });
});

describe("ticket statuses that allow action writes (UT-01 - BR-17)", () => {
  it("are OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, and REOPENED only", () => {
    expect([...ACTION_EDITABLE_TICKET_STATUSES].sort()).toEqual(
      ["IN_PROGRESS", "OPEN", "REOPENED", "WAITING_FOR_REQUESTER"],
    );
  });
});
