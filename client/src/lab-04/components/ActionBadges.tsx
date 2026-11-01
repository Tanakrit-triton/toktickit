import { ACTION_STATUS_GLYPH, ACTION_STATUS_TEXT } from "../action-rules.js";
import type { ActionStatus } from "../actions-api.js";
import "../styles/actions.css";

// Action status badge and follow-up indicator (docs/lab-04/ui-spec.md sections
// 1 and 4.3). Glyph and text carry the value; colour only reinforces it (AC-38).

export function ActionStatusBadge({ status }: { status: ActionStatus }) {
  return (
    <span
      className={`zg-badge zg-badge--action-${status.toLowerCase().replace(/_/g, "-")}`}
      data-testid="badge-action-status"
      data-status={status}
    >
      {ACTION_STATUS_GLYPH[status]} {ACTION_STATUS_TEXT[status]}
    </span>
  );
}

export function FollowUpIndicator() {
  return (
    <span className="zg-indicator-follow-up" data-testid="indicator-follow-up">
      ⚑ Follow-up required
    </span>
  );
}
