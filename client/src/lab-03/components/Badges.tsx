// Status, priority, and appears-resolved badges (docs/lab-03/ui-spec.md
// sections 7.1, 7.2, and 7.4). Every badge carries its value as text; colour
// only reinforces it (AC-65).
//
// Delivered with #44, whose screens are the first to need them. STY-01 and
// STY-02, which test them, belong to #43.

const STATUS_TEXT: Record<string, string> = {
  NEW: "New",
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING_FOR_REQUESTER: "Waiting for Requester",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
  CANCELLED: "Cancelled",
};

export function statusText(status: string): string {
  return STATUS_TEXT[status] ?? status;
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`zg-badge zg-badge--status-${status.toLowerCase().replace(/_/g, "-")}`}
      data-testid="badge-status"
      data-status={status}
    >
      {statusText(status)}
    </span>
  );
}

const PRIORITY_TEXT: Record<string, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", URGENT: "Urgent" };

// The Lab 2 glyphs (L2 ui-spec 6), which carry severity into greyscale.
const PRIORITY_GLYPH: Record<string, string> = {
  LOW: "○",
  MEDIUM: "◔",
  HIGH: "◑",
  URGENT: "●",
};

export function priorityText(priority: string): string {
  return PRIORITY_TEXT[priority] ?? priority;
}

/** A priority as text plus glyph. Requested Priority keeps the Lab 2 hook. */
export function PriorityBadge({ priority, testId = "badge-priority" }: { priority: string; testId?: string }) {
  return (
    <span className={`zg-badge zg-badge--priority-${priority.toLowerCase()}`} data-testid={testId}>
      {PRIORITY_GLYPH[priority]} {priorityText(priority)}
    </span>
  );
}

export function ItPriorityBadge({ priority }: { priority: string }) {
  return <PriorityBadge priority={priority} testId="badge-it-priority" />;
}

/** ui-spec.md 7.4. The compact form is the queue's (#43). */
export function AppearsResolvedIndicator({ at, compact = false }: { at: string; compact?: boolean }) {
  return (
    <span className="zg-indicator" data-testid="indicator-appears-resolved">
      {compact
        ? "✓ Requester: appears resolved"
        : `✓ Requester says the problem appears resolved · ${new Date(at).toLocaleDateString()}`}
    </span>
  );
}

/** ui-spec.md 7.5, delivered with User Management (#45). */
export function AccountStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`zg-badge zg-badge--account-${isActive ? "active" : "inactive"}`}
      data-testid="badge-account-status"
    >
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}
