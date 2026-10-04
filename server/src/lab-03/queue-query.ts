// Query parsing and ordering for GET /api/v1/staff/tickets (api-spec.md 5.1,
// AC-29 to AC-32).
//
// Like the Lab 2 My Tickets parser, every parameter is validated and nothing
// is defaulted silently: an unknown parameter, or a known one outside its
// rules, is a 400. This module checks shape only. Whether the category exists
// and whether an owner UUID names IT Staff or an Administrator needs the
// database, so the route checks those.

export const QUEUE_SORTABLE = ["ticketNumber", "createdAt", "updatedAt", "itPriority", "status"] as const;
export const SORT_ORDERS = ["asc", "desc"] as const;
export const PAGE_SIZES = [10, 20, 50] as const;

/** Severity order (api-spec 5.1). The single source for the IT Priority sort. */
export const PRIORITY_ORDER = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

/**
 * Lifecycle order (api-spec 5.1). It differs from the TicketStatus enum's
 * declaration order, where REOPENED follows CLOSED, so the queue never sorts
 * on the enum itself.
 */
export const STATUS_ORDER = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "REOPENED",
  "RESOLVED",
  "CLOSED",
  "CANCELLED",
] as const;

export type QueuePriority = (typeof PRIORITY_ORDER)[number];
export type QueueStatus = (typeof STATUS_ORDER)[number];
export type QueueSortBy = (typeof QUEUE_SORTABLE)[number];
export type SortOrder = (typeof SORT_ORDERS)[number];

export type OwnerFilter = { kind: "me" } | { kind: "unassigned" } | { kind: "user"; id: string };

export interface QueueQuery {
  q?: string;
  status?: QueueStatus;
  itPriority?: QueuePriority;
  categoryId?: number;
  owner?: OwnerFilter;
  sortBy: QueueSortBy;
  sortOrder: SortOrder;
  page: number;
  pageSize: number;
}

export type QueueQueryResult = { ok: true; query: QueueQuery } | { ok: false; message: string };

const KNOWN = new Set([
  "q",
  "status",
  "itPriority",
  "categoryId",
  "owner",
  "sortBy",
  "sortOrder",
  "page",
  "pageSize",
]);

const Q_MAX = 150;

export const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const bad = (message: string): QueueQueryResult => ({ ok: false, message });

/** Accepts only a base-10 integer string, so "1.5", "1e3" and " 1 " are rejected. */
function asInteger(raw: string): number | null {
  return /^-?\d+$/.test(raw) ? Number(raw) : null;
}

function oneOf<T extends string>(allowed: readonly T[], value: string): value is T {
  return (allowed as readonly string[]).includes(value);
}

export function parseQueueQuery(raw: Record<string, unknown>): QueueQueryResult {
  for (const name of Object.keys(raw)) {
    if (!KNOWN.has(name)) {
      return bad(`Unknown query parameter: ${name}.`);
    }
    // Express parses a repeated parameter into an array; accepting the first
    // value would silently discard the rest.
    if (typeof raw[name] !== "string") {
      return bad(`Query parameter ${name} must be given exactly once.`);
    }
  }
  const value = (name: string) => raw[name] as string | undefined;

  const query: QueueQuery = { sortBy: "itPriority", sortOrder: "desc", page: 1, pageSize: 20 };

  const q = value("q");
  if (q !== undefined) {
    const trimmed = q.trim();
    if (trimmed.length > Q_MAX) {
      return bad(`Search text must be ${Q_MAX} characters or fewer.`);
    }
    // Empty after trimming is treated as absent, not as a search for nothing.
    if (trimmed.length > 0) query.q = trimmed;
  }

  const status = value("status");
  if (status !== undefined) {
    if (!oneOf(STATUS_ORDER, status)) {
      return bad(`Query parameter status must be one of ${STATUS_ORDER.join(", ")}.`);
    }
    query.status = status;
  }

  const itPriority = value("itPriority");
  if (itPriority !== undefined) {
    if (!oneOf(PRIORITY_ORDER, itPriority)) {
      return bad(`Query parameter itPriority must be one of ${PRIORITY_ORDER.join(", ")}.`);
    }
    query.itPriority = itPriority;
  }

  const categoryId = value("categoryId");
  if (categoryId !== undefined) {
    const parsed = asInteger(categoryId);
    if (parsed === null || parsed < 1) {
      return bad("Query parameter categoryId must be a positive integer.");
    }
    query.categoryId = parsed;
  }

  const owner = value("owner");
  if (owner !== undefined) {
    if (owner === "me" || owner === "unassigned") {
      query.owner = { kind: owner };
    } else if (UUID_PATTERN.test(owner)) {
      query.owner = { kind: "user", id: owner };
    } else {
      return bad("Query parameter owner must be me, unassigned, or a user id.");
    }
  }

  const sortBy = value("sortBy");
  if (sortBy !== undefined) {
    if (!oneOf(QUEUE_SORTABLE, sortBy)) {
      return bad(`Query parameter sortBy must be one of ${QUEUE_SORTABLE.join(", ")}.`);
    }
    query.sortBy = sortBy;
  }

  const sortOrder = value("sortOrder");
  if (sortOrder !== undefined) {
    if (!oneOf(SORT_ORDERS, sortOrder)) {
      return bad("Query parameter sortOrder must be asc or desc.");
    }
    query.sortOrder = sortOrder;
  }

  const page = value("page");
  if (page !== undefined) {
    const parsed = asInteger(page);
    if (parsed === null || parsed < 1) {
      return bad("Query parameter page must be an integer of 1 or more.");
    }
    query.page = parsed;
  }

  const pageSize = value("pageSize");
  if (pageSize !== undefined) {
    const parsed = asInteger(pageSize);
    if (parsed === null || !(PAGE_SIZES as readonly number[]).includes(parsed)) {
      return bad(`Query parameter pageSize must be one of ${PAGE_SIZES.join(", ")}.`);
    }
    query.pageSize = parsed;
  }

  return { ok: true, query };
}

export const priorityRank = (priority: QueuePriority): number => PRIORITY_ORDER.indexOf(priority);
export const statusRank = (status: QueueStatus): number => STATUS_ORDER.indexOf(status);

export type SortKey = { key: QueueSortBy | "id"; order: SortOrder };

/**
 * The full ORDER BY for a query. The default (sortBy itPriority, desc) is
 * itPriority desc, createdAt asc, id asc. An explicit sort is followed by the
 * same secondary keys. id makes the order total, so paging can neither skip
 * nor repeat a ticket.
 */
export function queueSortKeys(query: Pick<QueueQuery, "sortBy" | "sortOrder">): SortKey[] {
  const keys: SortKey[] = [{ key: query.sortBy, order: query.sortOrder }];
  if (query.sortBy !== "createdAt") keys.push({ key: "createdAt", order: "asc" });
  keys.push({ key: "id", order: "asc" });
  return keys;
}
