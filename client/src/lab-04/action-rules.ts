import type { ActionStatus, ActionSummary, ActionTaken } from "./actions-api.js";

// Action status rules for the UI (docs/lab-04/specification.md section 5.2).
//
// The transition table is a copy of BR-15 as implemented in
// server/src/lab-04/action-rules.ts. The client never imports server code, so a
// change to BR-15 must be made in both places. The server stays the authority:
// these values only decide which options the dialog offers.

/** BR-15: the statuses each status may move to. COMPLETED and CANCELLED are terminal. */
export const ACTION_TRANSITIONS: Record<ActionStatus, readonly ActionStatus[]> = {
  PLANNED: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

/** BR-14: an action cannot be created as CANCELLED. */
export const CREATABLE_ACTION_STATUSES: readonly ActionStatus[] = ["PLANNED", "IN_PROGRESS", "COMPLETED"];

/** BR-17: ticket statuses in which actions may be created or edited. */
export const ACTION_EDITABLE_TICKET_STATUSES: ReadonlySet<string> = new Set([
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "REOPENED",
]);

/** ui-spec 4.3: display text and glyph. The glyph carries the meaning without colour. */
export const ACTION_STATUS_TEXT: Record<ActionStatus, string> = {
  PLANNED: "Planned",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const ACTION_STATUS_GLYPH: Record<ActionStatus, string> = {
  PLANNED: "◌",
  IN_PROGRESS: "◐",
  COMPLETED: "✓",
  CANCELLED: "✕",
};

/** The options an edit offers: the current status, then its BR-15 targets. */
export const editStatusOptions = (current: ActionStatus): ActionStatus[] => [current, ...ACTION_TRANSITIONS[current]];

/** BR-16: performer and status are fixed once an action is COMPLETED. */
export const isFullyEditable = (status: ActionStatus) => status === "PLANNED" || status === "IN_PROGRESS";

/**
 * The header counts, worked out from the list, for the Requester view, whose
 * detail carries no actionSummary. "Open" and "outstanding" as in spec 5.2.
 */
export function summarize(actions: readonly ActionTaken[]): ActionSummary {
  return {
    total: actions.length,
    open: actions.filter((a) => isFullyEditable(a.status)).length,
    outstandingFollowUps: actions.filter((a) => a.followUpRequired && a.status !== "CANCELLED").length,
  };
}
