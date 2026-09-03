// Error contract (BR-28, BR-29, api-spec.md sections 1.3 and 6).
//
// Every non-2xx response body is built here. A bare string, a plain
// { message }, or any extra top-level key is a contract violation, so routes
// never construct an error body by hand.

/** Stable machine-readable identifiers. Never localised, never reworded. */
export type ErrorCode =
  | "BAD_REQUEST"
  | "REQUESTER_INACTIVE"
  | "NOT_FOUND"
  | "ATTACHMENT_LIMIT_REACHED"
  | "ATTACHMENT_ALREADY_REMOVED"
  | "ATTACHMENT_REMOVED"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_FILE_TYPE"
  | "VALIDATION_ERROR"
  | "REQUESTER_NOT_SELECTED"
  | "INTERNAL_ERROR";

/** Flat field-to-message map, so the UI can place each message beside its own field (FR-11). */
export type ErrorDetails = Record<string, string>;

export type ErrorBody = {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetails;
  };
};

/**
 * Builds the one permitted error body.
 *
 * `message` must be a single sentence that is safe to display: no stack trace,
 * SQL, file path, or internal identifier (BR-28). `details` is omitted
 * entirely rather than emitted as undefined or null when absent, so the shape
 * a client receives matches the contract exactly.
 */
export function buildError(
  code: ErrorCode,
  message: string,
  details?: ErrorDetails,
): ErrorBody {
  return {
    error: details === undefined ? { code, message } : { code, message, details },
  };
}
