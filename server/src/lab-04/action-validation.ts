import type { ActionStatus } from "./action-rules.js";

// Field rules for an Action Taken (docs/lab-04/specification.md section 5.1,
// BR-05 to BR-10; api-spec.md section 2.2). Pure: the clock and the ticket's
// creation time are passed in, so routes and tests share one implementation.
// Performer eligibility needs the database and is checked by the route.

export const DESCRIPTION_MIN = 5;
export const DESCRIPTION_MAX = 2000;
export const RESULT_MAX = 2000;
export const FOLLOW_UP_NOTE_MIN = 5;
export const FOLLOW_UP_NOTE_MAX = 1000;
export const ATTACHMENT_NOTES_MAX = 500;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** BR-05: how far ahead an action may be dated. */
export const ACTION_AT_MAX_AHEAD_MS = 30 * DAY_MS;
/** BR-06: clock skew allowed for a completed action. */
export const COMPLETED_SKEW_MS = 5 * MINUTE_MS;

/** An ISO 8601 date-time with seconds optional and an explicit Z or offset. */
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

export interface ActionFieldsInput {
  actionAt: unknown;
  description: unknown;
  result: unknown;
  followUpRequired: unknown;
  followUpNote: unknown;
  attachmentNotes: unknown;
}

export interface ActionFields {
  actionAt: Date;
  description: string;
  result: string | null;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
}

export interface ActionValidationContext {
  /** The status the action will have after this request. */
  status: ActionStatus;
  ticketCreatedAt: Date;
  now: Date;
}

export type ActionValidationResult =
  | { ok: true; value: ActionFields }
  | { ok: false; details: Record<string, string> };

/** Trimmed text, or null for null, undefined, or text that is empty after trimming. */
function optionalText(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined; // not text at all
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function parseActionAt(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== "string" || !ISO_WITH_OFFSET.test(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  // Reject values JavaScript silently rolls over, such as month 13.
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1970) return null;
  return date;
}

export function validateActionFields(
  input: ActionFieldsInput,
  ctx: ActionValidationContext,
): ActionValidationResult {
  const details: Record<string, string> = {};

  // actionAt (BR-05, BR-06)
  const actionAt = parseActionAt(input.actionAt);
  if (actionAt === null) {
    details.actionAt = "Enter the date and time of the action.";
  } else if (actionAt.getTime() < ctx.ticketCreatedAt.getTime()) {
    details.actionAt = "The action cannot be earlier than the ticket.";
  } else if (actionAt.getTime() > ctx.now.getTime() + ACTION_AT_MAX_AHEAD_MS) {
    details.actionAt = "The action cannot be more than 30 days ahead.";
  } else if (ctx.status === "COMPLETED" && actionAt.getTime() > ctx.now.getTime() + COMPLETED_SKEW_MS) {
    details.actionAt = "A completed action cannot be dated in the future.";
  }

  // description (BR-07)
  const description = typeof input.description === "string" ? input.description.trim() : null;
  if (description === null || description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
    details.description = `Describe the action (${DESCRIPTION_MIN}–${DESCRIPTION_MAX} characters).`;
  }

  // result (BR-08)
  const result = optionalText(input.result);
  if (result === undefined || (result !== null && result.length > RESULT_MAX)) {
    details.result = `The result must be ${RESULT_MAX} characters or fewer.`;
  } else if (result === null && ctx.status === "COMPLETED") {
    details.result = "Record the result before completing this action.";
  } else if (result === null && ctx.status === "CANCELLED") {
    details.result = "Say why this action is being cancelled.";
  }

  // follow-up (BR-09)
  let followUpRequired = false;
  if (input.followUpRequired !== undefined && input.followUpRequired !== null) {
    if (typeof input.followUpRequired !== "boolean") {
      details.followUpRequired = "Choose whether a follow-up is required.";
    } else {
      followUpRequired = input.followUpRequired;
    }
  }
  let followUpNote: string | null = null;
  if (followUpRequired) {
    const note = optionalText(input.followUpNote);
    if (typeof note !== "string" || note.length < FOLLOW_UP_NOTE_MIN || note.length > FOLLOW_UP_NOTE_MAX) {
      details.followUpNote = `Describe the follow-up that is needed (${FOLLOW_UP_NOTE_MIN}–${FOLLOW_UP_NOTE_MAX} characters).`;
    } else {
      followUpNote = note;
    }
  }

  // attachment notes (BR-10)
  const attachmentNotes = optionalText(input.attachmentNotes);
  if (attachmentNotes === undefined || (attachmentNotes !== null && attachmentNotes.length > ATTACHMENT_NOTES_MAX)) {
    details.attachmentNotes = `Attachment notes must be ${ATTACHMENT_NOTES_MAX} characters or fewer.`;
  }

  if (Object.keys(details).length > 0) {
    return { ok: false, details };
  }
  return {
    ok: true,
    value: {
      actionAt: actionAt!,
      description: description!,
      result: result as string | null,
      followUpRequired,
      followUpNote,
      attachmentNotes: attachmentNotes as string | null,
    },
  };
}
