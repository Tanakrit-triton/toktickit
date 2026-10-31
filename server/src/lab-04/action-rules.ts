import type { TicketStatus } from "../lab-03/transitions.js";

// Action Taken status and edit rules (docs/lab-04/specification.md section
// 5.2, BR-13 to BR-17, Amendment 1). The single source of the action
// transition table: the PATCH route and the UI's status options both read it.

export const ACTION_STATUSES = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

/** Display names, for messages and badges. */
export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  PLANNED: "Planned",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/** BR-14: an action cannot be created as CANCELLED. */
export const CREATABLE_ACTION_STATUSES: ReadonlySet<ActionStatus> = new Set<ActionStatus>([
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETED",
]);

/** The action transition table (BR-15), as target lists per source status. */
const TABLE: Record<ActionStatus, readonly ActionStatus[]> = {
  PLANNED: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

/** BR-17: ticket statuses in which actions may be created or edited. */
export const ACTION_EDITABLE_TICKET_STATUSES: ReadonlySet<TicketStatus> = new Set<TicketStatus>([
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "REOPENED",
]);

/** The fields an edit can change, other than status. */
export type ActionField =
  | "actionAt"
  | "description"
  | "result"
  | "performedById"
  | "followUpRequired"
  | "followUpNote"
  | "attachmentNotes";

/** BR-16: what each status still allows. */
const EDITABLE_FIELDS: Record<ActionStatus, ReadonlySet<ActionField>> = {
  PLANNED: new Set<ActionField>([
    "actionAt",
    "description",
    "result",
    "performedById",
    "followUpRequired",
    "followUpNote",
    "attachmentNotes",
  ]),
  IN_PROGRESS: new Set<ActionField>([
    "actionAt",
    "description",
    "result",
    "performedById",
    "followUpRequired",
    "followUpNote",
    "attachmentNotes",
  ]),
  COMPLETED: new Set<ActionField>([
    "actionAt",
    "description",
    "result",
    "followUpRequired",
    "followUpNote",
    "attachmentNotes",
  ]),
  CANCELLED: new Set<ActionField>(),
};

export function isActionStatus(value: unknown): value is ActionStatus {
  return typeof value === "string" && (ACTION_STATUSES as readonly string[]).includes(value);
}

export function isActionTransitionPermitted(from: ActionStatus, to: ActionStatus): boolean {
  return TABLE[from].includes(to);
}

/** The status options an edit may offer, in table order. */
export function actionTransitionTargets(from: ActionStatus): readonly ActionStatus[] {
  return TABLE[from];
}

/** "Open" in specification.md section 5.2. */
export function isOpenActionStatus(status: ActionStatus): boolean {
  return status === "PLANNED" || status === "IN_PROGRESS";
}

export type ActionEditRefusal = "INVALID_ACTION_TRANSITION" | "ACTION_STATE_CONFLICT";

/**
 * The refusal an edit earns, or null when it is allowed. The caller passes only
 * values that differ from the stored ones: a repeated status is no change
 * (Amendment 1). A status change is judged first, by the transition table;
 * field changes then by what the current status still allows (api-spec
 * section 2.3, steps c and d).
 */
export function actionEditRefusal(
  current: ActionStatus,
  edit: { statusTo?: ActionStatus; fields: readonly ActionField[] },
): ActionEditRefusal | null {
  if (edit.statusTo !== undefined && !isActionTransitionPermitted(current, edit.statusTo)) {
    return "INVALID_ACTION_TRANSITION";
  }
  const allowed = EDITABLE_FIELDS[current];
  if (edit.fields.some((field) => !allowed.has(field))) {
    return "ACTION_STATE_CONFLICT";
  }
  return null;
}
