import { priorityText, statusText } from "../../lab-03/components/Badges.js";
import { ACTION_STATUS_TEXT } from "../action-rules.js";
import type { ActionStatus, HistoryEvent } from "../actions-api.js";
import { formatBangkok } from "../bangkok-time.js";

// The staff-only History tab content (docs/lab-04/ui-spec.md section 6): one
// line per Ticket Event, oldest first as the server lists them, read-only.

type Change = { from?: unknown; to?: unknown; changed?: boolean };

/** Text-change names for ACTION_UPDATED, in form order. Follow-up covers both fields. */
const FIELD_NAMES: [string, string][] = [
  ["actionAt", "date"],
  ["description", "description"],
  ["result", "result"],
  ["performedById", "performer"],
  ["followUpRequired", "follow-up"],
  ["followUpNote", "follow-up"],
  ["attachmentNotes", "attachment notes"],
];

const STATUS_VERB: Partial<Record<ActionStatus, string>> = {
  IN_PROGRESS: "started",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

function actionUpdated(changes: Record<string, Change>): string {
  const to = changes.status?.to as ActionStatus | undefined;
  if (to !== undefined) {
    const verb = STATUS_VERB[to];
    return verb === undefined ? `moved an action to ${ACTION_STATUS_TEXT[to] ?? String(to)}.` : `${verb} an action.`;
  }
  const names = [...new Set(FIELD_NAMES.filter(([key]) => key in changes).map(([, name]) => name))];
  return names.length === 0 ? "edited an action." : `edited an action (${names.join(", ")}).`;
}

/** The sentence for one event, starting with the actor or "System". */
export function historySentence(event: HistoryEvent, users: Record<string, string>): string {
  const p = event.payload ?? {};
  const actor = event.actor?.fullName ?? "System";
  const name = (id: unknown) => (typeof id === "string" ? (users[id] ?? "a former user") : "nobody");

  switch (event.eventType) {
    case "OWNER_CHANGED":
      if (p.cause === "CLAIM") return `${actor} claimed the ticket.`;
      if (p.cause === "OWNER_INELIGIBLE_ON_REOPEN") return `${actor} removed ${name(p.fromOwnerId)} as Ticket Owner.`;
      if (p.toOwnerId === null) return `${actor} unassigned the ticket.`;
      return `${actor} assigned the ticket to ${name(p.toOwnerId)}.`;
    case "STATUS_CHANGED":
      return `${actor} changed status from ${statusText(String(p.from))} to ${statusText(String(p.to))}.`;
    case "IT_PRIORITY_CHANGED":
      return `${actor} changed IT Priority from ${priorityText(String(p.from))} to ${priorityText(String(p.to))}.`;
    case "RESOLUTION_INDICATED":
      return `${actor} said the problem appears resolved.`;
    case "ACTION_CREATED":
      return event.actor !== null && p.performedById !== undefined && p.performedById !== event.actor.id
        ? `${actor} recorded an action performed by ${name(p.performedById)}.`
        : `${actor} recorded an action.`;
    case "ACTION_UPDATED":
      return `${actor} ${actionUpdated((p.changes ?? {}) as Record<string, Change>)}`;
    default:
      return `${actor} changed the ticket.`;
  }
}

export function HistoryList({ events, users }: { events: HistoryEvent[]; users: Record<string, string> }) {
  if (events.length === 0) return <p className="zg-helper">No history yet.</p>;
  return (
    <ol className="zg-history-list">
      {events.map((event) => (
        <li key={event.id} className="zg-history-item" data-testid={`history-item-${event.id}`}>
          <time className="zg-entry-time" dateTime={event.createdAt}>
            {formatBangkok(event.createdAt)}
          </time>{" "}
          <span>{historySentence(event, users)}</span>
        </li>
      ))}
    </ol>
  );
}
