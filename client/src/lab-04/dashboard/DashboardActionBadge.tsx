import type { ActionStatus } from "../dashboard-api.js";
import "../styles/dashboard.css";

// A minimal action status badge for the My open actions list, to the
// docs/lab-04/ui-spec.md section 4.3 contract: glyph plus text, with
// data-testid="badge-action-status" and data-status. #72 owns the product's
// action status badge (STY-01); this dashboard-only copy exists so the two
// Issues share no file, and #74 replaces it with #72's badge.

const DISPLAY: Record<ActionStatus, string> = {
  PLANNED: "◌ Planned",
  IN_PROGRESS: "◐ In Progress",
  COMPLETED: "✓ Completed",
  CANCELLED: "✕ Cancelled",
};

export function DashboardActionBadge({ status }: { status: ActionStatus }) {
  return (
    <span
      className={`zg-badge zg-dash-action-badge zg-dash-action-badge--${status.toLowerCase().replace(/_/g, "-")}`}
      data-testid="badge-action-status"
      data-status={status}
    >
      {DISPLAY[status] ?? status}
    </span>
  );
}
