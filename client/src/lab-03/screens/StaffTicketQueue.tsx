import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext.js";
import { landingFor } from "../routes.js";
import { AppearsResolvedIndicator, ItPriorityBadge, StatusBadge, priorityText, statusText } from "../components/Badges.js";
import { Callout } from "../components/Callout.js";
import { Forbidden } from "../components/Forbidden.js";
import { fetchAssignees, fetchQueue, TicketRequestError } from "../tickets-api.js";
import type { Assignee, QueuePage, QueueParams } from "../tickets-api.js";
import { fetchCategories } from "../../lab-02/api.js";
import type { ReferenceItem } from "../../lab-02/api.js";
import { lastUpdated } from "../../lab-02/screens/MyTickets.js";
import { MOBILE_QUERY, useMediaQuery } from "../../lab-02/useMediaQuery.js";

// IT Staff Ticket Queue -- docs/lab-03/ui-spec.md section 6.4, against
// api-spec.md section 5.1. The control bar, states, and pagination follow My
// Tickets (L2 ui-spec 5.4) and reuse its test hooks.

const SEARCH_DEBOUNCE_MS = 300;
const PAGE_SIZES = [10, 20, 50] as const;

const STATUSES = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

/**
 * The ui-spec 6.4 sort labels. The default sends no sortBy, which api-spec 5.1
 * defines as IT Priority descending, then oldest first.
 */
type SortKey = "priority" | "oldest" | "newest" | "updated" | "number" | "status";

const SORTS: Record<SortKey, { label: string; sortBy?: string; sortOrder?: string }> = {
  priority: { label: "Priority: Urgent first" },
  oldest: { label: "Oldest first", sortBy: "createdAt", sortOrder: "asc" },
  newest: { label: "Newest first", sortBy: "createdAt", sortOrder: "desc" },
  updated: { label: "Recently updated", sortBy: "updatedAt", sortOrder: "desc" },
  number: { label: "Ticket Number A–Z", sortBy: "ticketNumber", sortOrder: "asc" },
  status: { label: "Status", sortBy: "status", sortOrder: "asc" },
};
const DEFAULT_SORT: SortKey = "priority";

interface Filters {
  q: string;
  status: string;
  itPriority: string;
  categoryId: string;
  owner: string;
  sort: SortKey;
  page: number;
  pageSize: number;
}

const DEFAULTS: Filters = {
  q: "",
  status: "",
  itPriority: "",
  categoryId: "",
  owner: "",
  sort: DEFAULT_SORT,
  page: 1,
  pageSize: 20,
};

/** True when anything has been applied, which is what reveals Clear Filters. */
function isFiltered(f: Filters): boolean {
  return (
    f.q.trim() !== "" ||
    f.status !== "" ||
    f.itPriority !== "" ||
    f.categoryId !== "" ||
    f.owner !== "" ||
    f.sort !== DEFAULT_SORT
  );
}

function toParams(f: Filters): QueueParams {
  const sort = SORTS[f.sort];
  return {
    ...(f.q.trim() === "" ? {} : { q: f.q.trim() }),
    ...(f.status === "" ? {} : { status: f.status }),
    ...(f.itPriority === "" ? {} : { itPriority: f.itPriority }),
    ...(f.categoryId === "" ? {} : { categoryId: Number(f.categoryId) }),
    ...(f.owner === "" ? {} : { owner: f.owner }),
    ...(sort.sortBy === undefined ? {} : { sortBy: sort.sortBy, sortOrder: sort.sortOrder }),
    page: f.page,
    pageSize: f.pageSize,
  };
}

type LoadState = "loading" | "ready" | "failed" | "forbidden";

export function StaffTicketQueue() {
  const { user } = useAuth();
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const [filters, setFilters] = useState<Filters>(DEFAULTS);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [categories, setCategories] = useState<ReferenceItem[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [result, setResult] = useState<QueuePage | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [reloadToken, setReloadToken] = useState(0);

  // Empty and no-results are decided from what the completed request asked
  // for, not from the live controls, as on My Tickets.
  const appliedRef = useRef(false);
  const [appliedFiltered, setAppliedFiltered] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(filters.q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [filters.q]);

  // Reference data for the filters. A failure leaves a filter with only its
  // "All" option; the queue itself still loads.
  useEffect(() => {
    let cancelled = false;
    fetchCategories()
      .then((c) => !cancelled && setCategories(c))
      .catch(() => {});
    fetchAssignees()
      .then((a) => !cancelled && setAssignees(a))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const effective = useMemo<Filters>(() => ({ ...filters, q: debouncedQ }), [filters, debouncedQ]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    appliedRef.current = isFiltered(effective);

    fetchQueue(toParams(effective))
      .then((page) => {
        if (cancelled) return;
        setResult(page);
        setAppliedFiltered(appliedRef.current);
        setState("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Only the kind is kept; no status code or server text reaches the page (AC-68).
        setResult(null);
        setState(error instanceof TicketRequestError && error.kind === "FORBIDDEN" ? "forbidden" : "failed");
      });

    return () => {
      cancelled = true;
    };
  }, [effective, reloadToken]);

  const update = useCallback((patch: Partial<Filters>) => {
    // Any change other than paging returns to page 1.
    setFilters((prev) => ({ ...prev, ...patch, page: patch.page ?? 1 }));
  }, []);

  function clearFilters() {
    setFilters(DEFAULTS);
    setDebouncedQ("");
  }

  if (state === "forbidden") {
    return (
      <section data-testid="staff-queue-screen">
        <Forbidden landingPath={landingFor(user!.role)} />
      </section>
    );
  }

  const meta = result?.meta;
  const rows = result?.data ?? [];

  const select = (
    id: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: [string, string][],
  ) => (
    <label className="zg-label" htmlFor={id}>
      {label}
      <select id={id} className="zg-field" data-testid={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );

  const controlBar = (
    <div className="zg-control-bar" data-testid="control-bar">
      <label className="zg-label" htmlFor="queue-search">
        Search
        <input
          id="queue-search"
          type="search"
          className="zg-field"
          data-testid="field-search"
          placeholder="Search number, summary, or requester"
          value={filters.q}
          onChange={(e) => update({ q: e.target.value })}
        />
      </label>
      {select("filter-status", "Status", filters.status, (status) => update({ status }), [
        ["", "All statuses"],
        ...STATUSES.map((s): [string, string] => [s, statusText(s)]),
      ])}
      {select("filter-it-priority", "IT Priority", filters.itPriority, (itPriority) => update({ itPriority }), [
        ["", "All priorities"],
        ...PRIORITIES.map((p): [string, string] => [p, priorityText(p)]),
      ])}
      {select("filter-category", "Category", filters.categoryId, (categoryId) => update({ categoryId }), [
        ["", "All categories"],
        ...categories.map((c): [string, string] => [String(c.id), c.name]),
      ])}
      {select("filter-owner", "Owner", filters.owner, (owner) => update({ owner }), [
        ["", "Anyone"],
        ["me", "Assigned to me"],
        ["unassigned", "Unassigned"],
        ...assignees.map((a): [string, string] => [a.id, a.fullName]),
      ])}
      {select("sort-select", "Sort", filters.sort, (sort) => update({ sort: sort as SortKey }), (
        Object.entries(SORTS) as [SortKey, { label: string }][]
      ).map(([key, { label }]) => [key, label]))}
      {isFiltered(filters) && (
        <button type="button" className="zg-btn zg-btn--secondary" data-testid="btn-clear-filters" onClick={clearFilters}>
          Clear Filters
        </button>
      )}
    </div>
  );

  const owner = (name: string | undefined) =>
    name ?? <span className="zg-text-muted">Unassigned</span>;

  return (
    <section data-testid="staff-queue-screen">
      <div className="zg-list-header">
        <div>
          <h1 className="zg-title">Ticket Queue</h1>
          {meta && <p className="zg-helper" data-testid="queue-count">{`${meta.totalItems} tickets`}</p>}
        </div>
      </div>

      {controlBar}

      {state === "loading" && (
        <div className="zg-skeleton-list" data-testid="state-loading" aria-busy="true">
          {Array.from({ length: filters.pageSize }, (_, i) => (
            <span key={i} className="zg-skeleton-row" aria-hidden="true" />
          ))}
          <span className="zg-helper">Loading tickets…</span>
        </div>
      )}

      {state === "failed" && (
        <Callout variant="error" testId="state-list-failed">
          Something went wrong. Try again.{" "}
          <button
            type="button"
            className="zg-btn zg-btn--secondary"
            data-testid="btn-retry"
            onClick={() => setReloadToken((t) => t + 1)}
          >
            Retry
          </button>
        </Callout>
      )}

      {state === "ready" && rows.length === 0 && !appliedFiltered && (
        <div className="zg-state" data-testid="state-empty">
          <p>There are no tickets yet.</p>
        </div>
      )}

      {state === "ready" && rows.length === 0 && appliedFiltered && (
        <div className="zg-state" data-testid="state-no-results">
          <p>No tickets match your search or filters.</p>
          <button
            type="button"
            className="zg-btn zg-btn--secondary"
            data-testid="btn-clear-filters-no-results"
            onClick={clearFilters}
          >
            Clear Filters
          </button>
        </div>
      )}

      {state === "ready" && rows.length > 0 && (
        <>
          {isMobile ? (
            // Cards below 768px, each wholly a link (ui-spec 6.4).
            <ul className="zg-card-list" data-testid="queue-card-list">
              {rows.map((t) => (
                <li key={t.id}>
                  <Link
                    className="zg-ticket-card zg-ticket-card--link"
                    data-testid={`queue-card-${t.ticketNumber}`}
                    to={`/staff/tickets/${t.id}`}
                  >
                    <div className="zg-card-top">
                      <span className="zg-mono">{t.ticketNumber}</span>
                      <ItPriorityBadge priority={t.itPriority} />
                    </div>
                    <p className="zg-card-summary" title={t.summary}>
                      {t.summary}
                    </p>
                    {t.requesterIndicatedResolvedAt !== null && (
                      <AppearsResolvedIndicator at={t.requesterIndicatedResolvedAt} compact />
                    )}
                    <p className="zg-helper">
                      {t.requester.fullName} &middot; Owner: {owner(t.owner?.fullName)}
                    </p>
                    <div className="zg-card-bottom">
                      <StatusBadge status={t.currentStatus} />
                      <span className="zg-helper">{lastUpdated(t.updatedAt)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="zg-table-scroll">
              <table className="zg-table" data-testid="queue-table">
                <thead>
                  <tr>
                    <th scope="col">Ticket Number</th>
                    <th scope="col">Summary</th>
                    <th scope="col" className="zg-col-requester">Requester</th>
                    <th scope="col">IT Priority</th>
                    <th scope="col">Status</th>
                    <th scope="col">Owner</th>
                    <th scope="col">Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id} data-testid={`queue-row-${t.ticketNumber}`}>
                      <td className="zg-mono">
                        <Link to={`/staff/tickets/${t.id}`}>{t.ticketNumber}</Link>
                      </td>
                      <td>
                        <div className="zg-truncate" title={t.summary}>
                          {t.summary}
                        </div>
                        {t.requesterIndicatedResolvedAt !== null && (
                          <AppearsResolvedIndicator at={t.requesterIndicatedResolvedAt} compact />
                        )}
                      </td>
                      <td className="zg-col-requester">{t.requester.fullName}</td>
                      <td>
                        <ItPriorityBadge priority={t.itPriority} />
                      </td>
                      <td>
                        <StatusBadge status={t.currentStatus} />
                      </td>
                      <td>{owner(t.owner?.fullName)}</td>
                      <td>{lastUpdated(t.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="zg-pagination" data-testid="pagination">
            <button
              type="button"
              className="zg-btn zg-btn--secondary"
              data-testid="btn-prev-page"
              disabled={!meta || meta.page <= 1}
              onClick={() => update({ page: (meta?.page ?? 1) - 1 })}
            >
              Previous
            </button>
            <span data-testid="page-indicator">
              Page {meta?.page ?? 1} of {Math.max(meta?.totalPages ?? 1, 1)}
            </span>
            <button
              type="button"
              className="zg-btn zg-btn--secondary"
              data-testid="btn-next-page"
              disabled={!meta || meta.page >= meta.totalPages}
              onClick={() => update({ page: (meta?.page ?? 1) + 1 })}
            >
              Next
            </button>
            <label className="zg-label zg-page-size" htmlFor="queue-page-size">
              Per page
              <select
                id="queue-page-size"
                className="zg-field"
                data-testid="field-page-size"
                value={filters.pageSize}
                onChange={(e) => update({ pageSize: Number(e.target.value) })}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      )}
    </section>
  );
}
