import { describe, it, expect } from "vitest";
import {
  validateActionFields,
  type ActionFieldsInput,
  type ActionValidationContext,
} from "../../src/lab-04/action-validation.js";

// UT-02 from docs/lab-04/tests.md section 2.1 (AC-05, AC-06, BR-05 to BR-10).
//
// validateActionFields checks the resulting action: on create, the request
// body; on edit, the stored action merged with the PATCH body. It is pure.
// The clock and the ticket's creation time come in through the context, so
// every boundary is exact. Performer eligibility needs the database and is
// proved by ACT-03 instead.

const NOW = new Date("2026-10-31T05:00:00.000Z");
const TICKET_CREATED = new Date("2026-10-01T02:00:00.000Z");
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const at = (ms: number) => new Date(ms).toISOString();
const chars = (n: number) => "x".repeat(n);

const ctx = (status: ActionValidationContext["status"] = "PLANNED"): ActionValidationContext => ({
  status,
  ticketCreatedAt: TICKET_CREATED,
  now: NOW,
});

const valid = (overrides: Partial<ActionFieldsInput> = {}): ActionFieldsInput => ({
  actionAt: "2026-10-30T03:15:00.000Z",
  description: "Replaced the toner cartridge.",
  result: null,
  followUpRequired: false,
  followUpNote: null,
  attachmentNotes: null,
  ...overrides,
});

function details(input: ActionFieldsInput, c = ctx()): Record<string, string> {
  const result = validateActionFields(input, c);
  if (result.ok) throw new Error("expected a validation failure");
  return result.details;
}

function value(input: ActionFieldsInput, c = ctx()) {
  const result = validateActionFields(input, c);
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.details)}`);
  return result.value;
}

describe("description (UT-02 - BR-07)", () => {
  it.each([5, 2000])("accepts %i characters", (n) => {
    expect(value(valid({ description: chars(n) })).description).toBe(chars(n));
  });

  it.each([4, 2001])("rejects %i characters", (n) => {
    expect(details(valid({ description: chars(n) }))).toHaveProperty("description");
  });

  it("measures after trimming, and stores the trimmed text", () => {
    expect(details(valid({ description: `   ${chars(4)}   ` }))).toHaveProperty("description");
    expect(value(valid({ description: `  ${chars(5)}\n` })).description).toBe(chars(5));
  });

  it("keeps inner line breaks and markup as plain text (BR-11)", () => {
    const text = "<script>alert(1)</script>\nline 2";
    expect(value(valid({ description: text })).description).toBe(text);
  });

  it.each([undefined, null, 42])("rejects a missing or non-string description (%s)", (d) => {
    expect(details(valid({ description: d as never }))).toHaveProperty("description");
  });
});

describe("result (UT-02 - BR-08, AC-06)", () => {
  it("is optional while PLANNED or IN_PROGRESS, and stored as null when empty", () => {
    expect(value(valid({ result: null }), ctx("PLANNED")).result).toBeNull();
    expect(value(valid({ result: "   " }), ctx("IN_PROGRESS")).result).toBeNull();
  });

  it.each(["COMPLETED", "CANCELLED"] as const)("is required when the action is %s", (status) => {
    const c = ctx(status);
    expect(details(valid({ result: null }), c)).toHaveProperty("result");
    expect(details(valid({ result: "   " }), c)).toHaveProperty("result");
    expect(value(valid({ result: "x" }), c).result).toBe("x");
  });

  it("accepts 2000 characters and rejects 2001 in any status", () => {
    expect(value(valid({ result: chars(2000) })).result).toBe(chars(2000));
    expect(details(valid({ result: chars(2001) }), ctx("COMPLETED"))).toHaveProperty("result");
  });
});

describe("follow-up (UT-02 - BR-09)", () => {
  it.each([5, 1000])("accepts a %i-character note when a follow-up is required", (n) => {
    const v = value(valid({ followUpRequired: true, followUpNote: chars(n) }));
    expect(v).toMatchObject({ followUpRequired: true, followUpNote: chars(n) });
  });

  it.each([4, 1001])("rejects a %i-character note when a follow-up is required", (n) => {
    expect(details(valid({ followUpRequired: true, followUpNote: chars(n) }))).toHaveProperty(
      "followUpNote",
    );
  });

  it.each([null, undefined, "   "])("rejects a missing note (%s) when a follow-up is required", (note) => {
    expect(details(valid({ followUpRequired: true, followUpNote: note as never }))).toHaveProperty(
      "followUpNote",
    );
  });

  it("stores the note as null when no follow-up is required, whatever was sent", () => {
    expect(value(valid({ followUpRequired: false, followUpNote: "Call back on Monday" })).followUpNote).toBeNull();
    expect(value(valid({ followUpRequired: false, followUpNote: chars(5000) })).followUpNote).toBeNull();
  });

  it("defaults followUpRequired to false when absent", () => {
    expect(value(valid({ followUpRequired: undefined })).followUpRequired).toBe(false);
  });

  it.each(["yes", 1, "true"])("rejects a non-boolean followUpRequired (%s)", (flag) => {
    expect(details(valid({ followUpRequired: flag as never }))).toHaveProperty("followUpRequired");
  });
});

describe("attachment notes (UT-02 - BR-10)", () => {
  it("accepts 500 characters and rejects 501", () => {
    expect(value(valid({ attachmentNotes: chars(500) })).attachmentNotes).toBe(chars(500));
    expect(details(valid({ attachmentNotes: chars(501) }))).toHaveProperty("attachmentNotes");
  });

  it("stores empty text as null", () => {
    expect(value(valid({ attachmentNotes: "   " })).attachmentNotes).toBeNull();
    expect(value(valid({ attachmentNotes: undefined })).attachmentNotes).toBeNull();
  });
});

describe("action date and time (UT-02 - BR-05, BR-06, AC-05, AC-06)", () => {
  it("accepts the ticket's creation time exactly, and rejects 1 ms earlier", () => {
    expect(value(valid({ actionAt: at(TICKET_CREATED.getTime()) })).actionAt).toEqual(TICKET_CREATED);
    expect(details(valid({ actionAt: at(TICKET_CREATED.getTime() - 1) }))).toHaveProperty("actionAt");
  });

  it("accepts now + 30 days for a planned action, and rejects 1 minute more", () => {
    expect(value(valid({ actionAt: at(NOW.getTime() + 30 * DAY) })).actionAt.getTime()).toBe(
      NOW.getTime() + 30 * DAY,
    );
    expect(details(valid({ actionAt: at(NOW.getTime() + 30 * DAY + MINUTE) }))).toHaveProperty(
      "actionAt",
    );
  });

  it("accepts now + 5 minutes for a completed action, and rejects 1 second more", () => {
    const c = ctx("COMPLETED");
    const done = { result: "Done." };
    expect(value(valid({ ...done, actionAt: at(NOW.getTime() + 5 * MINUTE) }), c)).toBeTruthy();
    expect(details(valid({ ...done, actionAt: at(NOW.getTime() + 5 * MINUTE + 1000) }), c)).toHaveProperty(
      "actionAt",
    );
  });

  it("allows a future time for a planned or in-progress action", () => {
    expect(value(valid({ actionAt: at(NOW.getTime() + 10 * MINUTE) }), ctx("PLANNED"))).toBeTruthy();
    expect(value(valid({ actionAt: at(NOW.getTime() + 10 * MINUTE) }), ctx("IN_PROGRESS"))).toBeTruthy();
  });

  it("accepts an explicit offset and a stored Date", () => {
    expect(value(valid({ actionAt: "2026-10-30T10:15:00+07:00" })).actionAt.toISOString()).toBe(
      "2026-10-30T03:15:00.000Z",
    );
    expect(value(valid({ actionAt: new Date("2026-10-30T03:15:00.000Z") }))).toBeTruthy();
  });

  it.each([undefined, null, "", "yesterday", "2026-10-30", "2026-10-30T10:15:00", "2026-13-40T10:00:00Z", 1730000000000])(
    "rejects a missing, malformed, or offset-less value (%s)",
    (v) => {
      expect(details(valid({ actionAt: v as never }))).toHaveProperty("actionAt");
    },
  );
});

describe("reporting (UT-02)", () => {
  it("reports every failing field at once", () => {
    const d = details(
      valid({ description: "", followUpRequired: true, followUpNote: null, attachmentNotes: chars(501) }),
    );
    expect(Object.keys(d).sort()).toEqual(["attachmentNotes", "description", "followUpNote"]);
  });

  it("gives a human-readable message for each field", () => {
    const d = details(valid({ result: null }), ctx("COMPLETED"));
    expect(d.result).toBe("Record the result before completing this action.");
    const f = details(valid({ followUpRequired: true, followUpNote: null }));
    expect(f.followUpNote).toBe("Describe the follow-up that is needed (5–1000 characters).");
    const t = details(valid({ result: "x", actionAt: at(NOW.getTime() + DAY) }), ctx("COMPLETED"));
    expect(t.actionAt).toBe("A completed action cannot be dated in the future.");
  });

  it("asks for a reason, not a result, when cancelling", () => {
    expect(details(valid({ result: null }), ctx("CANCELLED")).result).toBe(
      "Say why this action is being cancelled.",
    );
  });
});
