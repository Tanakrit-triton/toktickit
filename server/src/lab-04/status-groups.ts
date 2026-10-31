import type { TicketStatus } from "../lab-03/transitions.js";

// Ticket status groups (docs/lab-04/specification.md section 5.4), used by
// the dashboards and by the statusGroup drill-down filter (api-spec.md
// section 4). CANCELLED belongs to neither group.

export const STATUS_GROUPS = ["ACTIVE", "DONE"] as const;
export type StatusGroup = (typeof STATUS_GROUPS)[number];

const MEMBERS: Record<StatusGroup, readonly TicketStatus[]> = {
  ACTIVE: ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"],
  DONE: ["RESOLVED", "CLOSED"],
};

export function statusesForGroup(group: StatusGroup): readonly TicketStatus[] {
  return MEMBERS[group];
}

export function isStatusGroup(value: unknown): value is StatusGroup {
  return typeof value === "string" && (STATUS_GROUPS as readonly string[]).includes(value);
}

/** The 400 message when a list request names both filters (api-spec section 4.1). */
export const STATUS_AND_GROUP_MESSAGE = "Use either status or statusGroup, not both.";
