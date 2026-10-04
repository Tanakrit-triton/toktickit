import { describe, it, expect } from "vitest";
import { checkUserChange, type UserChangeInput } from "../../src/lab-03/admin-guards.js";

// UT-12 from docs/lab-03/tests.md section 2.1 (AC-56, AC-57, BR-63).
//
// checkUserChange applies the BR-63 safety rules to counts the route has read
// inside its locking transaction, in the api-spec.md section 7.3 order:
// last Administrator (5), self-deactivation (6), own role (7), open tickets (8).
// It returns the refusal, or null when the change may proceed.

const ACTOR = "actor-admin";
const OTHER = "other-user";

const admin = (id: string) => ({ id, role: "ADMINISTRATOR" as const, isActive: true });
const staff = (id: string) => ({ id, role: "IT_STAFF" as const, isActive: true });

function input(overrides: Partial<UserChangeInput>): UserChangeInput {
  return {
    actorId: ACTOR,
    target: admin(ACTOR),
    change: {},
    activeAdministrators: 1,
    openTickets: 0,
    ...overrides,
  };
}

const codeOf = (value: UserChangeInput) => checkUserChange(value)?.code ?? null;

describe("last Administrator first (UT-12 - AC-57, BR-63)", () => {
  it("refuses the sole Administrator deactivating self with LAST_ADMINISTRATOR, not CANNOT_DEACTIVATE_SELF", () => {
    expect(codeOf(input({ change: { isActive: false } }))).toBe("LAST_ADMINISTRATOR");
  });

  it("refuses the sole Administrator changing own role with LAST_ADMINISTRATOR, not CANNOT_CHANGE_OWN_ROLE", () => {
    expect(codeOf(input({ change: { role: "IT_STAFF" } }))).toBe("LAST_ADMINISTRATOR");
  });

  it("refuses removing the last active Administrator even when they also own open tickets", () => {
    expect(codeOf(input({ change: { role: "REQUESTER" }, openTickets: 3 }))).toBe("LAST_ADMINISTRATOR");
  });

  it("carries the exact api-spec message", () => {
    expect(checkUserChange(input({ change: { isActive: false } }))?.message).toBe(
      "At least one active Administrator must remain.",
    );
  });

  it("does not count an inactive Administrator as one being removed", () => {
    const target = { id: OTHER, role: "ADMINISTRATOR" as const, isActive: false };
    expect(codeOf(input({ target, change: { role: "IT_STAFF" } }))).toBeNull();
  });
});

describe("self-protection with two Administrators (UT-12 - AC-56, BR-63)", () => {
  it("refuses self-deactivation with CANNOT_DEACTIVATE_SELF", () => {
    const result = checkUserChange(input({ change: { isActive: false }, activeAdministrators: 2 }));
    expect(result).toEqual({ code: "CANNOT_DEACTIVATE_SELF", message: "You cannot deactivate your own account." });
  });

  it("refuses a self role change with CANNOT_CHANGE_OWN_ROLE", () => {
    const result = checkUserChange(input({ change: { role: "IT_STAFF" }, activeAdministrators: 2 }));
    expect(result).toEqual({ code: "CANNOT_CHANGE_OWN_ROLE", message: "You cannot change your own role." });
  });

  it("checks self-deactivation before own role when both are requested", () => {
    expect(codeOf(input({ change: { isActive: false, role: "REQUESTER" }, activeAdministrators: 2 }))).toBe(
      "CANNOT_DEACTIVATE_SELF",
    );
  });

  it("allows restating one's own current role and activation", () => {
    expect(codeOf(input({ change: { role: "ADMINISTRATOR", isActive: true }, activeAdministrators: 2 }))).toBeNull();
  });

  it("allows an Administrator to demote another while two remain active", () => {
    expect(codeOf(input({ target: admin(OTHER), change: { role: "IT_STAFF" }, activeAdministrators: 2 }))).toBeNull();
  });
});

describe("open tickets last (UT-12 - AC-58, BR-63)", () => {
  it("refuses deactivating a user who owns open tickets, naming the count", () => {
    const result = checkUserChange(input({ target: staff(OTHER), change: { isActive: false }, openTickets: 2 }));
    expect(result).toEqual({
      code: "USER_HAS_OPEN_TICKETS",
      message: "This user owns 2 open tickets. Reassign them first.",
    });
  });

  it("refuses changing the role to REQUESTER while they own open tickets", () => {
    expect(codeOf(input({ target: staff(OTHER), change: { role: "REQUESTER" }, openTickets: 1 }))).toBe(
      "USER_HAS_OPEN_TICKETS",
    );
  });

  it("allows other role changes, and name-only edits, while they own open tickets", () => {
    expect(codeOf(input({ target: staff(OTHER), change: { role: "ADMINISTRATOR" }, openTickets: 2 }))).toBeNull();
    expect(codeOf(input({ target: staff(OTHER), change: {}, openTickets: 2 }))).toBeNull();
  });

  it("allows deactivation when no open ticket is owned", () => {
    expect(codeOf(input({ target: staff(OTHER), change: { isActive: false }, openTickets: 0 }))).toBeNull();
  });

  it("reports self-protection before open tickets", () => {
    expect(
      codeOf(input({ change: { isActive: false }, activeAdministrators: 2, openTickets: 4 })),
    ).toBe("CANNOT_DEACTIVATE_SELF");
  });
});
