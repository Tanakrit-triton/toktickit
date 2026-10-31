import { isTransitionPermitted, type TicketStatus } from "../lab-03/transitions.js";

// Lab 4 additions to the ticket workflow (docs/lab-04/specification.md
// section 5.4). The transition matrix itself stays in lab-03/transitions.ts,
// unchanged: Lab 4 adds the gate and the resolvedAt effect on top of it.

/** BR-20: every permitted transition into RESOLVED is gated. */
export function requiresResolutionGate(from: TicketStatus, to: TicketStatus): boolean {
  return to === "RESOLVED" && isTransitionPermitted(from, to, "IT_STAFF");
}

export type ResolvedAtChange = "set" | "clear" | "keep";

/** BR-25: entering RESOLVED sets resolvedAt, entering REOPENED clears it. */
export function resolvedAtChange(_from: TicketStatus, to: TicketStatus): ResolvedAtChange {
  if (to === "RESOLVED") return "set";
  if (to === "REOPENED") return "clear";
  return "keep";
}
