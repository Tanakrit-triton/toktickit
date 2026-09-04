// Field validators for ticket creation (BR-19 to BR-24, api-spec.md 3.1).
//
// Each validator returns a human-readable message when the value is rejected
// and null when it is accepted. Messages are the ones rendered beside the
// field, so they name the problem and state the fix (ui-spec.md 2.1) rather
// than saying "invalid input".
//
// Server-side validation is authoritative (BR-24). The client mirrors these
// bounds to give faster feedback; it never replaces them.

export const SUMMARY_MIN = 10;
export const SUMMARY_MAX = 150;
export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 5000;

export const REQUESTED_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type RequestedPriorityValue = (typeof REQUESTED_PRIORITIES)[number];

/** Trims before measuring, per BR-19 and BR-20. */
function trimmed(value: unknown): string | null {
  return typeof value === "string" ? value.trim() : null;
}

function boundedText(value: unknown, label: string, min: number, max: number): string | null {
  const text = trimmed(value);
  if (text === null || text.length === 0) {
    return label + " is required.";
  }
  if (text.length < min) {
    return label + " must be at least " + min + " characters.";
  }
  if (text.length > max) {
    return label + " must be " + max + " characters or fewer.";
  }
  return null;
}

export function validateSummary(value: unknown): string | null {
  return boundedText(value, "Ticket Summary", SUMMARY_MIN, SUMMARY_MAX);
}

export function validateDescription(value: unknown): string | null {
  return boundedText(value, "Description", DESCRIPTION_MIN, DESCRIPTION_MAX);
}

export function validateRequestedPriority(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return "Requested Priority is required.";
  }
  // Compared exactly: "low" and "URGENT " are rejected rather than coerced, so
  // a client sending the wrong shape is told rather than silently corrected.
  if (!(REQUESTED_PRIORITIES as readonly string[]).includes(value)) {
    return "Requested Priority must be one of " + REQUESTED_PRIORITIES.join(", ") + ".";
  }
  return null;
}

/**
 * Reference ids are integers (DEC-04). Existence and active state are checked
 * against the database by the route, not here.
 */
export function validateReferenceId(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === "" || !Number.isInteger(value)) {
    return label + " is required.";
  }
  return null;
}
