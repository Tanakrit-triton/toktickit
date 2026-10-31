import { describe, it, expect } from "vitest";
import {
  countResolutionBlockers,
  isResolutionBlocked,
  resolutionBlockedMessage,
} from "../../src/lab-04/resolution-gate.js";
import type { ActionStatus } from "../../src/lab-04/action-rules.js";

// UT-04 from docs/lab-04/tests.md section 2.1 (AC-14, AC-15, BR-20, BR-21).
// "Open" = PLANNED or IN_PROGRESS. "Outstanding follow-up" = an action that is
// not CANCELLED with followUpRequired = true (specification.md section 5.2).

const a = (status: ActionStatus, followUpRequired = false) => ({ status, followUpRequired });

describe("countResolutionBlockers (UT-04 - BR-20)", () => {
  it("counts nothing for a ticket with no actions (BR-21)", () => {
    expect(countResolutionBlockers([])).toEqual({ openActions: 0, outstandingFollowUps: 0 });
  });

  it("counts nothing when every action is completed or cancelled without follow-up", () => {
    expect(countResolutionBlockers([a("COMPLETED"), a("CANCELLED"), a("COMPLETED")])).toEqual({
      openActions: 0,
      outstandingFollowUps: 0,
    });
  });

  it("counts each PLANNED and IN_PROGRESS action as open", () => {
    expect(countResolutionBlockers([a("PLANNED"), a("IN_PROGRESS"), a("COMPLETED")]).openActions).toBe(2);
  });

  it("counts a follow-up on a completed action as outstanding", () => {
    expect(countResolutionBlockers([a("COMPLETED", true)])).toEqual({
      openActions: 0,
      outstandingFollowUps: 1,
    });
  });

  it("does not count a follow-up on a cancelled action", () => {
    expect(countResolutionBlockers([a("CANCELLED", true)])).toEqual({
      openActions: 0,
      outstandingFollowUps: 0,
    });
  });

  it("counts an open action with a follow-up in both totals", () => {
    expect(countResolutionBlockers([a("IN_PROGRESS", true)])).toEqual({
      openActions: 1,
      outstandingFollowUps: 1,
    });
  });
});

describe("isResolutionBlocked (UT-04 - AC-14, AC-15)", () => {
  it("is false only when both counts are zero", () => {
    expect(isResolutionBlocked({ openActions: 0, outstandingFollowUps: 0 })).toBe(false);
    expect(isResolutionBlocked({ openActions: 1, outstandingFollowUps: 0 })).toBe(true);
    expect(isResolutionBlocked({ openActions: 0, outstandingFollowUps: 1 })).toBe(true);
  });
});

describe("resolutionBlockedMessage (UT-04 - api-spec section 3.3)", () => {
  it("always states both counts, even when one is zero", () => {
    expect(resolutionBlockedMessage({ openActions: 1, outstandingFollowUps: 0 })).toBe(
      "This ticket cannot be resolved yet: 1 action(s) still open and 0 follow-up(s) outstanding.",
    );
    expect(resolutionBlockedMessage({ openActions: 0, outstandingFollowUps: 2 })).toBe(
      "This ticket cannot be resolved yet: 0 action(s) still open and 2 follow-up(s) outstanding.",
    );
  });
});
