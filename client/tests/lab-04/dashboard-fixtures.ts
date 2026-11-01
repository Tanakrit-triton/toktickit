import { ok } from "../lab-03/ticket-fixtures.js";
import { CATEGORIES, SYSTEMS } from "../lab-03/helpers.js";

// Mocked dashboard responses for the Lab 4 UI component suites
// (docs/lab-04/tests.md section 2.7). Shapes follow api-spec.md sections 5.1
// and 5.2 exactly: the server returns 501 until #71 merges, so these tests
// prove the screens against the contract, and E2E (#74) proves them against
// the real endpoints.

export const WINDOW = {
  from: "2026-10-23T17:00:00.000Z",
  to: "2026-10-30T13:00:00.000Z",
  timeZone: "Asia/Bangkok",
};

/** 2026-10-23T17:00Z is 24 Oct 2026 00:00 in Bangkok (BR-36). */
export const WINDOW_LINE = "Recent = since 24 Oct 2026, Bangkok time";

export const STATUS_ORDER = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
] as const;

export const PRIORITY_ORDER = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const;

export const listItem = (n: number, currentStatus: string, extra: Record<string, unknown> = {}) => ({
  id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`,
  ticketNumber: `TKT-2026-000${String(n).padStart(2, "0")}`,
  summary: `Ticket summary ${n}`,
  currentStatus,
  updatedAt: "2026-10-30T10:00:00.000Z",
  ...extra,
});

// ---------------------------------------------------------------------------
// Requester Dashboard, api-spec 5.1

export function requesterDashboard(overrides: Partial<{ counts: Partial<Record<string, number>>; lists: Record<string, unknown[]> }> = {}) {
  const counts = { openTickets: 3, waitingForMe: 1, updatedRecently: 2, resolvedRecently: 1, ...overrides.counts };
  return {
    generatedAt: "2026-10-30T13:00:00.000Z",
    window: WINDOW,
    metrics: {
      openTickets: { count: counts.openTickets, link: "/tickets?statusGroup=ACTIVE" },
      waitingForMe: { count: counts.waitingForMe, link: "/tickets?status=WAITING_FOR_REQUESTER" },
      updatedRecently: { count: counts.updatedRecently, link: "/tickets?sortBy=updatedAt&sortOrder=desc" },
      resolvedRecently: { count: counts.resolvedRecently, link: "/tickets?statusGroup=DONE" },
    },
    lists: overrides.lists ?? {
      needsAttention: [listItem(5, "WAITING_FOR_REQUESTER")],
      recentlyUpdated: [listItem(5, "WAITING_FOR_REQUESTER"), listItem(6, "IN_PROGRESS")],
      recentlyResolved: [listItem(7, "RESOLVED", { resolvedAt: "2026-10-29T08:00:00.000Z" })],
    },
  };
}

export const EMPTY_REQUESTER_DASHBOARD = () =>
  requesterDashboard({
    counts: { openTickets: 0, waitingForMe: 0, updatedRecently: 0, resolvedRecently: 0 },
    lists: { needsAttention: [], recentlyUpdated: [], recentlyResolved: [] },
  });

// ---------------------------------------------------------------------------
// IT Staff Dashboard, api-spec 5.2

export const ACTION_ID = "aaaaaaaa-1111-4000-8000-000000000001";
export const ACTION_TICKET_ID = "00000000-0000-4000-8000-000000000004";

export function staffDashboard(
  overrides: Partial<{
    counts: Partial<Record<string, number>>;
    byStatus: Partial<Record<string, number>>;
    byPriority: Partial<Record<string, number>>;
    lists: Record<string, unknown[]>;
    users: unknown;
  }> = {},
) {
  const counts = { unassigned: 2, ownedByMe: 3, myOpenActions: 1, ...overrides.counts };
  const byStatus = { NEW: 2, OPEN: 1, IN_PROGRESS: 3, WAITING_FOR_REQUESTER: 1, RESOLVED: 4, CLOSED: 6, REOPENED: 0, CANCELLED: 1, ...overrides.byStatus };
  const byPriority = { URGENT: 1, HIGH: 2, MEDIUM: 3, LOW: 1, ...overrides.byPriority };
  return {
    generatedAt: "2026-10-30T13:00:00.000Z",
    window: WINDOW,
    metrics: {
      unassigned: { count: counts.unassigned, link: "/staff/queue?owner=unassigned&statusGroup=ACTIVE" },
      ownedByMe: { count: counts.ownedByMe, link: "/staff/queue?owner=me&statusGroup=ACTIVE" },
      myOpenActions: { count: counts.myOpenActions, link: null },
    },
    byStatus: STATUS_ORDER.map((status) => ({ status, count: byStatus[status], link: `/staff/queue?status=${status}` })),
    activeByItPriority: PRIORITY_ORDER.map((itPriority) => ({
      itPriority,
      count: byPriority[itPriority],
      link: `/staff/queue?itPriority=${itPriority}&statusGroup=ACTIVE`,
    })),
    lists: overrides.lists ?? {
      myOpenActions: [
        {
          actionId: ACTION_ID,
          ticketId: ACTION_TICKET_ID,
          ticketNumber: "TKT-2026-00004",
          description: "Collect diagnostic logs from the printer",
          status: "PLANNED",
          actionAt: "2026-10-29T03:00:00.000Z",
        },
      ],
      urgent: [
        listItem(8, "OPEN", { owner: null, createdAt: "2026-10-20T03:00:00.000Z" }),
        listItem(9, "IN_PROGRESS", { owner: { id: "cccccccc-0000-0000-0000-000000000003", fullName: "Wichai Prasert" }, createdAt: "2026-10-21T03:00:00.000Z" }),
      ],
      recentlyUpdated: [listItem(9, "IN_PROGRESS")],
    },
    users: overrides.users === undefined ? null : overrides.users,
  };
}

export const ZERO_STAFF_DASHBOARD = () =>
  staffDashboard({
    counts: { unassigned: 0, ownedByMe: 0, myOpenActions: 0 },
    byStatus: Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])),
    byPriority: Object.fromEntries(PRIORITY_ORDER.map((p) => [p, 0])),
    lists: { myOpenActions: [], urgent: [], recentlyUpdated: [] },
  });

export const ADMIN_USERS = { active: { REQUESTER: 5, IT_STAFF: 3, ADMINISTRATOR: 1 }, inactive: 2 };

// ---------------------------------------------------------------------------
// Route tables for fakeApi

export const REQUESTER_DASHBOARD_PATH = "GET /dashboard/requester";
export const STAFF_DASHBOARD_PATH = "GET /staff/dashboard";

/** My Tickets reads these on load (L2 api-spec), keyed for fakeApi. */
export const myTicketsRoutes = (rows: unknown[] = [listItemForMyTickets()]) => ({
  "GET /categories": ok(CATEGORIES),
  "GET /related-systems": ok(SYSTEMS),
  "GET /tickets": {
    status: 200,
    body: { data: rows, meta: { page: 1, pageSize: 10, totalItems: rows.length, totalPages: rows.length === 0 ? 0 : 1 } },
  },
});

export function listItemForMyTickets() {
  return {
    id: "t-TKT-2026-00042",
    ticketNumber: "TKT-2026-00042",
    summary: "Laptop battery drains within one hour",
    category: CATEGORIES[1],
    relatedSystem: SYSTEMS[0],
    requestedPriority: "HIGH",
    currentStatus: "WAITING_FOR_REQUESTER",
    attachmentCount: 0,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
  };
}
