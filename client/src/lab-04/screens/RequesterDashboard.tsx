import { Link } from "react-router-dom";
import { StatusBadge } from "../../lab-03/components/Badges.js";
import { fetchRequesterDashboard, type DashboardTicketItem, type RequesterDashboardData } from "../dashboard-api.js";
import { DashboardFrame, DashboardList, MetricCard, MetricGrid, useDashboard, type ListRow } from "../dashboard/parts.js";

// Requester Dashboard, /dashboard -- docs/lab-04/ui-spec.md section 3.2,
// against api-spec.md section 5.1. Every value and link comes from the
// server; the screen only lays them out.

const CARDS = [
  ["openTickets", "Open tickets", "No open tickets."],
  ["waitingForMe", "Waiting for you", "Nothing is waiting for you."],
  ["updatedRecently", "Updated recently", "No updates this week."],
  ["resolvedRecently", "Resolved recently", "Nothing resolved this week."],
] as const;

const LISTS = [
  ["needsAttention", "Needs your attention", "No tickets need your attention."],
  ["recentlyUpdated", "Recently updated", "No recent updates."],
  ["recentlyResolved", "Recently resolved", "No recently resolved tickets."],
] as const;

function ticketRows(items: DashboardTicketItem[]): ListRow[] {
  return items.map((t) => ({
    id: t.id,
    to: `/tickets/${t.id}`,
    content: (
      <>
        <span className="zg-mono">{t.ticketNumber}</span>
        <span className="zg-dash-row-text">{t.summary}</span>
        <StatusBadge status={t.currentStatus} />
      </>
    ),
  }));
}

/**
 * The response has no total, so "no tickets" is read as every count zero and
 * every list empty. The link is secondary either way (ui-spec 3.2).
 */
function hasNothing(data: RequesterDashboardData): boolean {
  return (
    Object.values(data.metrics).every((m) => m.count === 0) &&
    Object.values(data.lists).every((list) => list.length === 0)
  );
}

export function RequesterDashboard() {
  const { state, retry } = useDashboard(fetchRequesterDashboard);

  return (
    <DashboardFrame
      testId="requester-dashboard-screen"
      state={state}
      onRetry={retry}
      skeletonCards={CARDS.length}
      underTitle={(data) =>
        hasNothing(data) && (
          <p>
            <Link to="/tickets/new" data-testid="link-create-ticket">
              Create a ticket
            </Link>
          </p>
        )
      }
    >
      {(data) => (
        <>
          <MetricGrid>
            {CARDS.map(([key, label, empty]) => (
              <MetricCard key={key} metricKey={key} label={label} metric={data.metrics[key]} emptyMessage={empty} />
            ))}
          </MetricGrid>
          <div className="zg-dash-lists">
            {LISTS.map(([key, title, empty]) => (
              <DashboardList key={key} listKey={key} title={title} emptyMessage={empty} rows={ticketRows(data.lists[key])} />
            ))}
          </div>
        </>
      )}
    </DashboardFrame>
  );
}
