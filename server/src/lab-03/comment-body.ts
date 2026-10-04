// The body rule shared by Public Comments and Internal Notes (BR-47).

export const BODY_MAX = 2000;

/**
 * Returns the body trimmed, or null when it is not a string or is not 1 to
 * BODY_MAX characters after trimming. Only the ends are trimmed: inner line
 * breaks and markup are kept, because bodies render as plain text (BR-49).
 */
export function normaliseBody(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const body = value.trim();
  return body.length >= 1 && body.length <= BODY_MAX ? body : null;
}
