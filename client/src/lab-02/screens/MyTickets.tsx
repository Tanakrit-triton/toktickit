import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import * as api from "../api.js";
import type { ReferenceItem, TicketListPage, TicketListParams } from "../api.js";
import { useRequester } from "../RequesterContext.js";
import { MOBILE_QUERY, useMediaQuery } from "../useMediaQuery.js";

// My Tickets -- ui-spec.md section 5.4.

const SEARCH_DEBOUNCE_MS = 300;
const PAGE_SIZES = [10, 20, 50] as const;

/** The five labels ui-spec 5.4 fixes, each mapped to a sortBy/sortOrder pair. */
const SORTS = {
  newest: { label: "Newest first", sortBy: "createdAt", sortOrder: "desc" },
  oldest: { label: "Oldest first", sortBy: "createdAt", sortOrder: "asc" },
  number: { label: "Ticket Number A-Z", sortBy: "ticketNumber", sortOrder: "asc" },
  priority: { label: "Priority: Urgent first", sortBy: "requestedPriority", sortOrder: "desc" },
  updated: { label: "Recently updated", sortBy: "updatedAt", sortOrder: "desc" },
} as const;

type SortKey = keyof typeof SORTS;
const DEFAULT_SORT: SortKey = "newest";

const PRIORITY_LABEL: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

// Glyphs so severity survives greyscale and colour-vision deficiency
// (ui-spec 6). Never colour alone.
const PRIORITY_GLYPH: Record<string, string> = {
  LOW: "\u25CB",
  MEDIUM: "\u25D4",
  HIGH: "\u25D1",
  URGENT: "\u25CF",
};

/** Relative under seven days, absolute beyond (ui-spec 5.4). */
function lastUpdated(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface Filters {
  q: string;
  categoryId: string;
  relatedSystemId: string;
  requestedPriority: string;
  sort: SortKey;
  page: number;
  pageSize: number;
}

const DEFAULTS: Filters = {
  q: "",
  categoryId: "",
  relatedSystemId: "",
  requestedPriority: "",
  sort: DEFAULT_SORT,
  page: 1,
  pageSize: 10,
};

/** True when anything has been applied, which is what reveals Clear Filters. */
function isFiltered(f: Filters): boolean {
  return (
    f.q.trim() !== "" ||
    f.categoryId !== "" ||
    f.relatedSystemId !== "" ||
    f.requestedPriority !== "" ||
    f.sort !== DEFAULT_SORT
  );
}

function toParams(f: Filters): TicketListParams {
  const sort = SORTS[f.sort];
  return {
    ...(f.q.trim() === "" ? {} : { q: f.q.trim() }),
    ...(f.categoryId === "" ? {} : { categoryId: Number(f.categoryId) }),
    ...(f.relatedSystemId === "" ? {} : { relatedSystemId: Number(f.relatedSystemId) }),
    ...(f.requestedPriority === "" ? {} : { requestedPriority: f.requestedPriority }),
    sortBy: sort.sortBy,
    sortOrder: sort.sortOrder,
    page: f.page,
    pageSize: f.pageSize,
  };
}

export function MyTickets() {
  const { requester } = useRequester();
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const [filters, setFilters] = useState<Filters>(DEFAULTS);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [categories, setCategories] = useState<ReferenceItem[]>([]);
  const [systems, setSystems] = useState<ReferenceItem[]>([]);
  const [result, setResult] = useState<TicketListPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // What the last completed request actually asked for. The empty and
  // no-results states are decided from this rather than from the live control
  // values, so typing into search cannot momentarily relabel an empty list as
  // "no results" before the request that proves it has returned (BR-49).
  const appliedRef = useRef(false);
  const [appliedFiltered, setAppliedFiltered] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(filters.q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [filters.q]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [c, s] = await Promise.all([api.fetchCategories(), api.fetchRelatedSystems()]);
        if (!cancelled) {
          setCategories(c);
          setSystems(s);
        }
      } catch {
        if (!cancelled) {
          setCategories([]);
          setSystems([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const effective = useMemo<Filters>(() => ({ ...filters, q: debouncedQ }), [filters, debouncedQ]);

  useEffect(() => {
    if (requester === null) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    appliedRef.current = isFiltered(effective);

    (async () => {
      try {
        const listPage = await api.fetchTickets(requester.id, toParams(effective));
        if (!cancelled) {
          setResult(listPage);
          setAppliedFiltered(appliedRef.current);
        }
      } catch {
        // The thrown error is discarded: a status code or stack frame reaching
        // the page would violate BR-28.
        if (!cancelled) {
          setResult(null);
          setFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [requester, effective, reloadToken]);

  const update = useCallback((patch: Partial<Filters>) => {
    // Any change to a filter returns to page 1: staying on page 4 of a result
    // set that no longer has four pages would show an empty page.
    setFilters((prev) => ({ ...prev, ...patch, page: patch.page ?? 1 }));
  }, []);

  function clearFilters() {
    setFilters(DEFAULTS);
    setDebouncedQ("");
  }

  const meta = result?.meta;
  const rows = result?.data ?? [];
  const showing =
    meta && meta.totalItems > 0
      ? `Showing ${(meta.page - 1) * meta.pageSize + 1}-${Math.min(meta.page * meta.pageSize, meta.totalItems)} of ${meta.totalItems}`
      : "";

  const controlBar = (
    <div className="zg-control-bar" data-testid="control-bar">
      <label className="zg-label" htmlFor="ticket-search">
        Search
        <input
          id="ticket-search"
          type="search"
          className="zg-field"
          data-testid="field-search"
          placeholder="Search ticket number or summary"
          value={filters.q}
          onChange={(e) => update({ q: e.target.value })}
        />
      </label>

      <label className="zg-label" htmlFor="filter-category">
        Category
        <select
          id="filter-category"
          className="zg-field"
          data-testid="filter-category"
          value={filters.categoryId}
          onChange={(e) => update({ categoryId: e.target.value })}
        >
          <option value="">All</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>

      <label className="zg-label" htmlFor="filter-system">
        Related System
        <select
          id="filter-system"
          className="zg-field"
          data-testid="filter-related-system"
          value={filters.relatedSystemId}
          onChange={(e) => update({ relatedSystemId: e.target.value })}
        >
          <option value="">All</option>
          {systems.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>

      <label className="zg-label" htmlFor="filter-priority">
        Requested Priority
        <select
          id="filter-priority"
          className="zg-field"
          data-testid="filter-priority"
          value={filters.requestedPriority}
          onChange={(e) => update({ requestedPriority: e.target.value })}
        >
          <option value="">All</option>
          {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>

      <label className="zg-label" htmlFor="ticket-sort">
        Sort
        <select
          id="ticket-sort"
          className="zg-field"
          data-testid="field-sort"
          value={filters.sort}
          onChange={(e) => update({ sort: e.target.value as SortKey })}
        >
          {Object.entries(SORTS).map(([value, { label }]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>

      {/* Visible only when something is applied (ui-spec 5.4). */}
      {isFiltered(filters) && (
        <button
          type="button"
          className="zg-btn zg-btn--secondary"
          data-testid="btn-clear-filters"
          onClick={clearFilters}
        >
          Clear Filters
        </button>
      )}
    </div>
  );

  const badge = (kind: string, value: string, label: string, glyph?: string) => (
    <span className={`zg-badge zg-badge--${kind}-${value.toLowerCase()}`} data-testid={`badge-${kind}`}>
      {glyph ? `${glyph} ` : ""}
      {label}
    </span>
  );

  return (
    <section data-testid="my-tickets-screen">
      <div className="zg-list-header">
        <h1 className="zg-title">My Tickets</h1>
        <Link className="zg-btn zg-btn--primary" data-testid="btn-create-ticket-top" to="/tickets/new">
          Create Ticket
        </Link>
      </div>

      {controlBar}

      {loading && (
        <div className="zg-skeleton-list" data-testid="state-loading" aria-busy="true">
          {Array.from({ length: Math.min(filters.pageSize, 10) }, (_, i) => (
            <span key={i} className="zg-skeleton-row" aria-hidden="true" />
          ))}
          <span className="zg-helper">Loading your tickets...</span>
        </div>
      )}

      {!loading && failed && (
        <div className="zg-callout-error" data-testid="state-list-failed" role="alert">
          <p>Your tickets could not be loaded.</p>
          <button
            type="button"
            className="zg-btn zg-btn--secondary"
            data-testid="btn-retry"
            onClick={() => setReloadToken((t) => t + 1)}
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty and no-results are decided from what the completed request
          asked for, and are worded and actioned differently (BR-49, AC-25). */}
      {!loading && !failed && rows.length === 0 && !appliedFiltered && (
        <div className="zg-state" data-testid="state-empty">
          <p>You have not created any tickets yet.</p>
          <Link className="zg-btn zg-btn--primary" data-testid="btn-create-ticket" to="/tickets/new">
            Create Ticket
          </Link>
        </div>
      )}

      {!loading && !failed && rows.length === 0 && appliedFiltered && (
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

      {!loading && !failed && rows.length > 0 && (
        <>
          {isMobile ? (
            /* Cards below 768px, not a table that scrolls sideways: AC-40 asks
               for cards "rather than a table", and a table hidden by CSS is
               still a table in the accessibility tree.

               ui-spec 5.4 makes the whole card the link target. Ticket Detail
               is #18 and nothing serves /tickets/{id} yet, so the card is an
               article rather than a link -- the same reasoning A-06 records for
               the Ticket Number column and for View Ticket. The 44px minimum
               touch height is already in place for when it becomes a link. */
            <ul className="zg-card-list" data-testid="ticket-card-list">
              {rows.map((t) => (
                <li key={t.id}>
                  <article className="zg-ticket-card" data-testid={`ticket-card-${t.ticketNumber}`}>
                    <div className="zg-card-top">
                      <span className="zg-mono">{t.ticketNumber}</span>
                      {badge("priority", t.requestedPriority, PRIORITY_LABEL[t.requestedPriority] ?? t.requestedPriority, PRIORITY_GLYPH[t.requestedPriority])}
                    </div>
                    <p className="zg-card-summary" title={t.summary}>{t.summary}</p>
                    <p className="zg-helper">
                      {t.category.name} &middot; {t.relatedSystem.name}
                    </p>
                    <div className="zg-card-bottom">
                      {badge("status", t.currentStatus, "New")}
                      <span className="zg-helper">{lastUpdated(t.updatedAt)}</span>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          ) : (
          <div className="zg-table-scroll">
            <table className="zg-table" data-testid="ticket-table">
              <thead>
                <tr>
                  <th scope="col">Ticket Number</th>
                  <th scope="col">Summary</th>
                  <th scope="col">Category</th>
                  <th scope="col" className="zg-col-system">Related System</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} data-testid={`ticket-row-${t.ticketNumber}`}>
                    {/* Ticket Detail is #18 and nothing serves /tickets/{id}
                        yet, so the number is plain text rather than a link
                        that would redirect to this same list (A-06). */}
                    <td className="zg-mono">{t.ticketNumber}</td>
                    <td className="zg-truncate" title={t.summary}>{t.summary}</td>
                    <td>{t.category.name}</td>
                    <td className="zg-col-system">{t.relatedSystem.name}</td>
                    <td>
                      {badge("priority", t.requestedPriority, PRIORITY_LABEL[t.requestedPriority] ?? t.requestedPriority, PRIORITY_GLYPH[t.requestedPriority])}
                    </td>
                    <td>{badge("status", t.currentStatus, "New")}</td>
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
            <label className="zg-label zg-page-size" htmlFor="page-size">
              Per page
              <select
                id="page-size"
                className="zg-field"
                data-testid="field-page-size"
                value={filters.pageSize}
                onChange={(e) => update({ pageSize: Number(e.target.value) })}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </label>
            <span className="zg-helper" data-testid="showing-count">{showing}</span>
          </div>
        </>
      )}
    </section>
  );
}
