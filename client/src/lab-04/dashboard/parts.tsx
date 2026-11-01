import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../lab-03/AuthContext.js";
import { Callout } from "../../lab-03/components/Callout.js";
import { Forbidden } from "../../lab-03/components/Forbidden.js";
import { landingFor } from "../../lab-03/routes.js";
import { DashboardRequestError, type DashboardWindow, type Metric } from "../dashboard-api.js";
import "../styles/dashboard.css";

// Pieces shared by the two dashboards (docs/lab-04/ui-spec.md sections 3.1
// and 3.4): the load states, the window line, metric cards, and short lists.

// ---------------------------------------------------------------------------
// Loading

export type DashboardState<T> =
  | { kind: "loading" }
  | { kind: "ready"; data: T }
  | { kind: "failed" }
  | { kind: "forbidden" };

/** Fetches once on mount, and again on retry. Only the kind of a failure is kept. */
export function useDashboard<T>(fetcher: () => Promise<T>) {
  const [state, setState] = useState<DashboardState<T>>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    fetcher()
      .then((data) => !cancelled && setState({ kind: "ready", data }))
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({ kind: error instanceof DashboardRequestError && error.kind === "FORBIDDEN" ? "forbidden" : "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [fetcher, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}

/**
 * The screen region in each of the four states (ui-spec 3.4). `aria-busy` is
 * on the region only while loading; the skeleton has the final card size so
 * nothing shifts when the data arrives.
 */
export function DashboardFrame<T extends { window: DashboardWindow }>({
  testId,
  state,
  onRetry,
  skeletonCards,
  underTitle,
  children,
}: {
  testId: string;
  state: DashboardState<T>;
  onRetry: () => void;
  skeletonCards: number;
  underTitle?: (data: T) => ReactNode;
  children: (data: T) => ReactNode;
}) {
  const { user } = useAuth();

  if (state.kind === "forbidden") {
    return (
      <section data-testid={testId}>
        <Forbidden landingPath={landingFor(user!.role)} />
      </section>
    );
  }

  return (
    <section data-testid={testId} className="zg-dash" aria-busy={state.kind === "loading" ? "true" : undefined}>
      <h1 className="zg-title">Dashboard</h1>
      {state.kind === "ready" && (
        <>
          <WindowLine window={state.data.window} />
          {underTitle?.(state.data)}
        </>
      )}

      {state.kind === "loading" && (
        <div className="zg-dash-metrics">
          {Array.from({ length: skeletonCards }, (_, i) => (
            <div key={i} className="zg-metric-card zg-dash-skeleton" data-testid="skeleton-card" aria-hidden="true" />
          ))}
          <span className="zg-helper zg-dash-skeleton-text">Loading the dashboard…</span>
        </div>
      )}

      {state.kind === "failed" && (
        <Callout variant="error" testId="state-dashboard-failed">
          We couldn't load the dashboard. Please try again.{" "}
          <button type="button" className="zg-btn zg-btn--secondary" onClick={onRetry}>
            Retry
          </button>
        </Callout>
      )}

      {state.kind === "ready" && children(state.data)}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Window line, "Recent = since {d MMM yyyy}, Bangkok time" (BR-36)

// Fixed abbreviations, so the line does not depend on the runtime's locale
// data (some ICU versions write "Sept").
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `iso` as "d MMM yyyy" on the Bangkok calendar. */
export function bangkokDate(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(new Date(iso));
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return `${part("day")} ${MONTHS[part("month") - 1]} ${part("year")}`;
}

function WindowLine({ window }: { window: DashboardWindow }) {
  return (
    <p className="zg-dash-window" data-testid="dashboard-window">
      Recent = since {bangkokDate(window.from)}, Bangkok time
    </p>
  );
}

// ---------------------------------------------------------------------------
// Metric cards (ui-spec 3.1)

export function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="zg-dash-metrics">{children}</div>;
}

/**
 * One card. With a link it is a single `<a>` whose accessible name is
 * "{Label}: {value}. View list", so the value is not read twice. Without one
 * it is a `<section>` with no arrow.
 */
export function MetricCard({
  metricKey,
  label,
  metric,
  emptyMessage,
}: {
  metricKey: string;
  label: string;
  metric: Metric;
  emptyMessage: string;
}) {
  const body = (
    <>
      <span className="zg-metric-label">{label}</span>
      <span className="zg-metric-value" data-testid={`metric-value-${metricKey}`}>
        {metric.count}
      </span>
      {metric.count === 0 && <span className="zg-dash-empty">{emptyMessage}</span>}
    </>
  );

  if (metric.link === null) {
    return (
      <section className="zg-metric-card" data-testid={`metric-${metricKey}`} aria-label={`${label}: ${metric.count}`}>
        {body}
      </section>
    );
  }

  return (
    <Link
      className="zg-metric-card"
      data-testid={`metric-${metricKey}`}
      to={metric.link}
      aria-label={`${label}: ${metric.count}. View list`}
    >
      {body}
      <span className="zg-dash-view">View list →</span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Short lists (ui-spec 3.1): an <h2>, up to 5 linked rows, or the empty message

export interface ListRow {
  id: string;
  to: string;
  content: ReactNode;
}

export function DashboardList({
  listKey,
  title,
  emptyMessage,
  rows,
}: {
  listKey: string;
  title: string;
  emptyMessage: string;
  rows: ListRow[];
}) {
  return (
    <section className="zg-dash-card zg-dash-list" data-testid={`list-${listKey}`}>
      <h2 className="zg-dash-card-title">{title}</h2>
      {rows.length === 0 ? (
        <p className="zg-dash-empty">{emptyMessage}</p>
      ) : (
        <ul className="zg-dash-rows">
          {rows.slice(0, 5).map((row) => (
            <li key={row.id}>
              <Link className="zg-dash-row" to={row.to} data-testid={`list-item-${listKey}-${row.id}`}>
                {row.content}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
