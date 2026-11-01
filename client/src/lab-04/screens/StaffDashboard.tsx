import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ItPriorityBadge, StatusBadge, priorityText, statusText } from "../../lab-03/components/Badges.js";
import { fetchStaffDashboard, type StaffDashboardData, type UserCounts } from "../dashboard-api.js";
import { ActionStatusBadge } from "../components/ActionBadges.js";
import { DashboardFrame, DashboardList, MetricCard, MetricGrid, bangkokDate, useDashboard } from "../dashboard/parts.js";

// IT Staff Dashboard, /staff/dashboard -- docs/lab-04/ui-spec.md section 3.3,
// against api-spec.md section 5.2. The Administrator variant adds the User
// accounts card, which has no drill-down (DEC-10).
//
// DOM order is the tablet and mobile order (cards, my open actions, urgent,
// status table, priority table, recently updated), so keyboard order matches
// the one-column layout; the stylesheet places the tables in the left column
// on desktop.

const CARDS = [
  ["unassigned", "Unassigned"],
  ["ownedByMe", "Owned by me"],
  ["myOpenActions", "My open actions"],
] as const;

function CountTable({
  testId,
  title,
  heading,
  rows,
}: {
  testId: string;
  title: string;
  heading: string;
  rows: { key: string; label: string; badge: ReactNode; count: number; link: string }[];
}) {
  return (
    <section className="zg-dash-card" data-testid={testId}>
      <h2 className="zg-dash-card-title">{title}</h2>
      <table className="zg-dash-count-table">
        <thead>
          <tr>
            <th scope="col">{heading}</th>
            <th scope="col">Tickets</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.badge}</td>
              <td>
                <Link to={r.link} data-testid={r.key} aria-label={`${r.label}: ${r.count}. View list`}>
                  {r.count}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function UsersCard({ users }: { users: UserCounts }) {
  const rows = [
    ["users-REQUESTER", "Requesters", users.active.REQUESTER],
    ["users-IT_STAFF", "IT Staff", users.active.IT_STAFF],
    ["users-ADMINISTRATOR", "Administrators", users.active.ADMINISTRATOR],
    ["users-inactive", "Inactive", users.inactive],
  ] as const;
  return (
    <section className="zg-metric-card zg-dash-users" data-testid="card-users">
      <h2 className="zg-metric-label">User accounts</h2>
      <dl className="zg-dash-users-list">
        {rows.map(([testId, label, count]) => (
          <div key={testId} data-testid={testId}>
            <dt>{label}</dt>
            <dd>{count}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Content({ data }: { data: StaffDashboardData }) {
  const myActions = data.lists.myOpenActions.map((a) => ({
    id: a.actionId,
    to: `/staff/tickets/${a.ticketId}#actions`,
    content: (
      <>
        <span className="zg-mono">{a.ticketNumber}</span>
        <span className="zg-dash-row-text">{a.description}</span>
        <ActionStatusBadge status={a.status} />
        <span className="zg-helper">{bangkokDate(a.actionAt)}</span>
      </>
    ),
  }));

  const urgent = data.lists.urgent.map((t) => ({
    id: t.id,
    to: `/staff/tickets/${t.id}`,
    content: (
      <>
        <span className="zg-mono">{t.ticketNumber}</span>
        <span className="zg-dash-row-text">{t.summary}</span>
        <span className={t.owner === null ? "zg-text-muted" : undefined}>{t.owner?.fullName ?? "Unassigned"}</span>
      </>
    ),
  }));

  const recent = data.lists.recentlyUpdated.map((t) => ({
    id: t.id,
    to: `/staff/tickets/${t.id}`,
    content: (
      <>
        <span className="zg-mono">{t.ticketNumber}</span>
        <span className="zg-dash-row-text">{t.summary}</span>
        <StatusBadge status={t.currentStatus} />
      </>
    ),
  }));

  return (
    <>
      <MetricGrid>
        {CARDS.map(([key, label]) => (
          <MetricCard key={key} metricKey={key} label={label} metric={data.metrics[key]} emptyMessage="None." />
        ))}
        {data.users !== null && <UsersCard users={data.users} />}
      </MetricGrid>

      <div className="zg-dash-staff-grid">
        <div className="zg-dash-area-actions">
          <DashboardList listKey="myOpenActions" title="My open actions" emptyMessage="You have no open actions." rows={myActions} />
        </div>
        <div className="zg-dash-area-urgent">
          <DashboardList listKey="urgent" title="Urgent and active" emptyMessage="No urgent tickets." rows={urgent} />
        </div>
        <div className="zg-dash-area-status">
          <CountTable
            testId="table-by-status"
            title="Tickets by status"
            heading="Status"
            rows={data.byStatus.map((s) => ({
              key: `status-count-${s.status}`,
              label: statusText(s.status),
              badge: <StatusBadge status={s.status} />,
              count: s.count,
              link: s.link,
            }))}
          />
        </div>
        <div className="zg-dash-area-priority">
          <CountTable
            testId="table-by-priority"
            title="Active by IT Priority"
            heading="IT Priority"
            rows={data.activeByItPriority.map((p) => ({
              key: `priority-count-${p.itPriority}`,
              label: priorityText(p.itPriority),
              badge: <ItPriorityBadge priority={p.itPriority} />,
              count: p.count,
              link: p.link,
            }))}
          />
        </div>
        <div className="zg-dash-area-recent">
          <DashboardList listKey="recentlyUpdated" title="Recently updated" emptyMessage="No recent updates." rows={recent} />
        </div>
      </div>
    </>
  );
}

export function StaffDashboard() {
  const { state, retry } = useDashboard(fetchStaffDashboard);
  return (
    <DashboardFrame testId="staff-dashboard-screen" state={state} onRetry={retry} skeletonCards={CARDS.length}>
      {(data) => <Content data={data} />}
    </DashboardFrame>
  );
}
