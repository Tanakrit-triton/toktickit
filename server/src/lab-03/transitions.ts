import type { Role } from "./require-session.js";

// Ticket status rules (docs/lab-03/specification.md section 5.6, BR-35 to
// BR-41). The single source of the transition matrix: the status endpoint and
// availableTransitions both read it, and the UI renders from the latter
// rather than keeping a copy (api-spec.md section 5.2).

export const TICKET_STATUSES = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** Display names, for messages (api-spec.md section 5.7). */
export const STATUS_LABELS: Record<TicketStatus, string> = {
  NEW: "New",
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING_FOR_REQUESTER: "Waiting for Requester",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
  CANCELLED: "Cancelled",
};

/**
 * The transition matrix (BR-35), as target lists per source status, in the
 * order the specification lists them. NEW -> OPEN is a row, but only claim or
 * assign performs it (BR-38).
 */
const MATRIX: Record<TicketStatus, readonly TicketStatus[]> = {
  NEW: ["OPEN", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  REOPENED: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  CANCELLED: ["REOPENED"],
};

/** Only IT Staff and Administrators perform transitions (BR-35, DEV-05). */
const TRANSITION_ROLES: ReadonlySet<Role> = new Set<Role>(["IT_STAFF", "ADMINISTRATOR"]);

const OWNER_REQUIRED: ReadonlySet<TicketStatus> = new Set<TicketStatus>([
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
]);

const REASON_REQUIRED: ReadonlySet<TicketStatus> = new Set<TicketStatus>(["CANCELLED", "REOPENED"]);

/** Claim, assign, and reassign (BR-32). */
export const ASSIGNABLE_STATUSES: ReadonlySet<TicketStatus> = new Set<TicketStatus>([
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "REOPENED",
]);
export const CLAIMABLE_STATUSES = ASSIGNABLE_STATUSES;

/** Every status except CLOSED and CANCELLED (BR-33). */
export const IT_PRIORITY_EDITABLE_STATUSES: ReadonlySet<TicketStatus> = new Set<TicketStatus>(
  TICKET_STATUSES.filter((s) => s !== "CLOSED" && s !== "CANCELLED"),
);

export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === "string" && (TICKET_STATUSES as readonly string[]).includes(value);
}

export function isTransitionPermitted(from: TicketStatus, to: TicketStatus, role: Role): boolean {
  return TRANSITION_ROLES.has(role) && MATRIX[from].includes(to);
}

/** BR-36: entering this status needs a Ticket Owner. */
export function requiresOwner(status: TicketStatus): boolean {
  return OWNER_REQUIRED.has(status);
}

/** BR-37: entering this status needs a 5-500 character reason. */
export function requiresReason(status: TicketStatus): boolean {
  return REASON_REQUIRED.has(status);
}

/** Whether the status endpoint performs this pair (BR-35 less BR-38). */
export function isStatusEndpointTransition(from: TicketStatus, to: TicketStatus): boolean {
  return !(from === "NEW" && to === "OPEN") && MATRIX[from].includes(to);
}

/**
 * The targets the status endpoint would accept now: the matrix rows it
 * performs, less those the owner rule would refuse (api-spec.md section 5.2).
 */
export function availableTransitions(from: TicketStatus, hasOwner: boolean): TicketStatus[] {
  return MATRIX[from].filter(
    (to) => isStatusEndpointTransition(from, to) && (hasOwner || !requiresOwner(to)),
  );
}
