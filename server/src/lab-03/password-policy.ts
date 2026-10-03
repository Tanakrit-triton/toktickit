import type { ErrorDetails } from "../lab-02/errors.js";

// Password policy (BR-11, AC-10, api-spec.md section 2.4).
//
// Length is counted in Unicode code points, so an emoji is one character, as
// the client counts it with [...value].length. Passwords are never trimmed:
// a leading or trailing space is part of the password.
//
// Whether currentPassword verifies against the stored hash is checked by the
// route, which merges that message into the same details map.

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

const asString = (value: unknown) => (typeof value === "string" ? value : "");

/** The length message, or null when `value` is 12–128 code points. */
export function validatePasswordLength(value: unknown): string | null {
  const length = [...asString(value)].length;
  return length < PASSWORD_MIN || length > PASSWORD_MAX
    ? `Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters.`
    : null;
}

/** The 422 details for a change request; empty when the new password is acceptable. */
export function validatePasswordChange(input: {
  currentPassword: unknown;
  newPassword: unknown;
  confirmPassword: unknown;
}): ErrorDetails {
  const details: ErrorDetails = {};
  const newPassword = asString(input.newPassword);

  const lengthError = validatePasswordLength(newPassword);
  if (lengthError !== null) {
    details.newPassword = lengthError;
  } else if (newPassword === asString(input.currentPassword)) {
    details.newPassword = "New password must be different from the current password.";
  }

  if (asString(input.confirmPassword) !== newPassword) {
    details.confirmPassword = "Passwords do not match.";
  }

  return details;
}
