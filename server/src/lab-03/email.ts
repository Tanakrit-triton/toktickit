// Email normalisation and validation (BR-06).
//
// Addresses are trimmed and lowercased before they are validated, stored,
// compared, or used to log in, so uniqueness holds after normalisation. Like
// the Lab 2 validators, validateEmail returns the message shown beside the
// field, or null when the value is accepted.

export const EMAIL_MAX = 254;

// One "@", no whitespace, and a dotted domain. Deliberately simple: the
// address is an identifier here, never a delivery target (no email is sent in
// Lab 3), so full RFC 5322 parsing would buy nothing.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validateEmail(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "Email is required.";
  }
  const email = normaliseEmail(value);
  if (email.length > EMAIL_MAX) {
    return "Email must be " + EMAIL_MAX + " characters or fewer.";
  }
  if (!EMAIL_PATTERN.test(email)) {
    return "Enter an email address in the form name@example.com.";
  }
  return null;
}
