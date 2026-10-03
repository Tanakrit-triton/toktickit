import { describe, it, expect } from "vitest";
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  validatePasswordChange,
} from "../../src/lab-03/password-policy.js";

// UT-04 from docs/lab-03/tests.md section 2.1 (AC-10, BR-11).
//
// validatePasswordChange applies the rules that need no stored hash: length,
// difference from the current password, and confirmation. It returns the
// 422 details map (api-spec.md section 2.4), empty when the change is valid.
// Whether currentPassword verifies is the route's job (API-11).

const LENGTH_MESSAGE = "Password must be 12–128 characters.";
const SAME_MESSAGE = "New password must be different from the current password.";
const MISMATCH_MESSAGE = "Passwords do not match.";

const CURRENT = "current-password-0001";

/** A change from CURRENT to `newPassword`, correctly confirmed. */
const change = (newPassword: string) =>
  validatePasswordChange({ currentPassword: CURRENT, newPassword, confirmPassword: newPassword });

describe("password length (UT-04 - AC-10, BR-11)", () => {
  it("is 12 to 128 code points", () => {
    expect(PASSWORD_MIN).toBe(12);
    expect(PASSWORD_MAX).toBe(128);
  });

  it("rejects 11 code points", () => {
    expect(change("a".repeat(11))).toEqual({ newPassword: LENGTH_MESSAGE });
  });

  it("accepts 12 code points", () => {
    expect(change("a".repeat(12))).toEqual({});
  });

  it("accepts 128 code points", () => {
    expect(change("a".repeat(128))).toEqual({});
  });

  it("rejects 129 code points", () => {
    expect(change("a".repeat(129))).toEqual({ newPassword: LENGTH_MESSAGE });
  });

  it("counts an emoji as one code point, not two UTF-16 units", () => {
    // Each emoji is two UTF-16 units, so a .length check would accept 11 and
    // reject 128.
    expect(change("😀".repeat(11))).toEqual({ newPassword: LENGTH_MESSAGE });
    expect(change("😀".repeat(12))).toEqual({});
    expect(change("😀".repeat(128))).toEqual({});
    expect(change("😀".repeat(129))).toEqual({ newPassword: LENGTH_MESSAGE });
  });

  it("keeps leading and trailing spaces instead of trimming them", () => {
    // Ten letters plus two spaces is 12 only if the spaces are counted.
    expect(change(" " + "a".repeat(10) + " ")).toEqual({});
  });
});

describe("password difference and confirmation (UT-04 - AC-10, BR-11)", () => {
  it("rejects a new password equal to the current one", () => {
    expect(change(CURRENT)).toEqual({ newPassword: SAME_MESSAGE });
  });

  it("treats a trailing space as a different password", () => {
    expect(change(CURRENT + " ")).toEqual({});
  });

  it("rejects a confirmation that does not match", () => {
    expect(
      validatePasswordChange({
        currentPassword: CURRENT,
        newPassword: "new-password-0001",
        confirmPassword: "new-password-0002",
      }),
    ).toEqual({ confirmPassword: MISMATCH_MESSAGE });
  });

  it("reports every failing field together", () => {
    expect(
      validatePasswordChange({
        currentPassword: CURRENT,
        newPassword: "short",
        confirmPassword: "different",
      }),
    ).toEqual({ newPassword: LENGTH_MESSAGE, confirmPassword: MISMATCH_MESSAGE });
  });
});
