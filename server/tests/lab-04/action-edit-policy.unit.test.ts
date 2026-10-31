import { describe, it, expect } from "vitest";
import {
  actionEditRefusal,
  type ActionField,
  type ActionStatus,
} from "../../src/lab-04/action-rules.js";

// UT-03 from docs/lab-04/tests.md section 2.1 (AC-08, BR-16 as amended).
//
// actionEditRefusal(current, edit) returns the error code an edit earns, or
// null when it is allowed. A status change is judged by the transition table
// first (INVALID_ACTION_TRANSITION, BR-15). Field changes are then judged by
// the edit policy (ACTION_STATE_CONFLICT, BR-16).

const FIELDS: ActionField[] = [
  "actionAt",
  "description",
  "result",
  "performedById",
  "followUpRequired",
  "followUpNote",
  "attachmentNotes",
];

/** BR-16: the fields a COMPLETED action may still change. */
const COMPLETED_EDITABLE: ActionField[] = [
  "actionAt",
  "description",
  "result",
  "followUpRequired",
  "followUpNote",
  "attachmentNotes",
];

describe("field edits by action status (UT-03 - BR-16)", () => {
  it.each(["PLANNED", "IN_PROGRESS"] as ActionStatus[])("%s allows every field", (status) => {
    for (const field of FIELDS) {
      expect(actionEditRefusal(status, { fields: [field] })).toBeNull();
    }
    expect(actionEditRefusal(status, { fields: FIELDS })).toBeNull();
  });

  it.each(COMPLETED_EDITABLE)("COMPLETED allows %s", (field) => {
    expect(actionEditRefusal("COMPLETED", { fields: [field] })).toBeNull();
  });

  it("COMPLETED refuses a performer change with ACTION_STATE_CONFLICT", () => {
    expect(actionEditRefusal("COMPLETED", { fields: ["performedById"] })).toBe("ACTION_STATE_CONFLICT");
    expect(actionEditRefusal("COMPLETED", { fields: ["result", "performedById"] })).toBe(
      "ACTION_STATE_CONFLICT",
    );
  });

  it.each(FIELDS)("CANCELLED refuses %s with ACTION_STATE_CONFLICT", (field) => {
    expect(actionEditRefusal("CANCELLED", { fields: [field] })).toBe("ACTION_STATE_CONFLICT");
  });

  it("allows an edit that changes nothing", () => {
    for (const status of ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as ActionStatus[]) {
      expect(actionEditRefusal(status, { fields: [] })).toBeNull();
    }
  });
});

describe("status changes inside an edit (UT-03 - BR-15, BR-16)", () => {
  it("allows a permitted transition together with field changes", () => {
    expect(
      actionEditRefusal("PLANNED", { statusTo: "COMPLETED", fields: ["result", "performedById"] }),
    ).toBeNull();
  });

  it("refuses a status change from a terminal status with INVALID_ACTION_TRANSITION", () => {
    expect(actionEditRefusal("COMPLETED", { statusTo: "IN_PROGRESS", fields: [] })).toBe(
      "INVALID_ACTION_TRANSITION",
    );
    expect(actionEditRefusal("CANCELLED", { statusTo: "PLANNED", fields: [] })).toBe(
      "INVALID_ACTION_TRANSITION",
    );
  });

  it("judges the status change before the fields", () => {
    expect(
      actionEditRefusal("CANCELLED", { statusTo: "COMPLETED", fields: ["description"] }),
    ).toBe("INVALID_ACTION_TRANSITION");
  });
});

// A PATCH that repeats the stored status, or any stored value, is not a
// change: the route drops unchanged values before calling the policy, so an
// all-unchanged PATCH is a 200 no-op (ACT-16, BR-15 as amended).
