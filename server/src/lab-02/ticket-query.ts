// Query parsing for GET /api/v1/tickets (api-spec.md 3.2, BR-43 to BR-47).
//
// Every parameter is validated and nothing is defaulted silently. An unknown
// parameter, or a known one carrying a value outside its rules, is a 400:
// substituting a default would hide a client defect and make list behaviour
// untestable (BR-47, DEC-03).

export const SORTABLE = ["ticketNumber", "createdAt", "updatedAt", "requestedPriority"] as const;
export const SORT_ORDERS = ["asc", "desc"] as const;
export const PAGE_SIZES = [10, 20, 50] as const;
export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

const KNOWN = new Set([
  "q",
  "categoryId",
  "relatedSystemId",
  "requestedPriority",
  "sortBy",
  "sortOrder",
  "page",
  "pageSize",
]);

const Q_MAX = 150;

export interface TicketListQuery {
  q?: string;
  categoryId?: number;
  relatedSystemId?: number;
  requestedPriority?: (typeof PRIORITIES)[number];
  sortBy: (typeof SORTABLE)[number];
  sortOrder: (typeof SORT_ORDERS)[number];
  page: number;
  pageSize: number;
}

export type QueryResult =
  | { ok: true; query: TicketListQuery }
  | { ok: false; message: string };

const bad = (message: string): QueryResult => ({ ok: false, message });

/** Accepts only a base-10 integer string, so "1.5", "1e3" and " 1 " are rejected. */
function asInteger(raw: string): number | null {
  return /^-?\d+$/.test(raw) ? Number(raw) : null;
}

export function parseTicketListQuery(raw: Record<string, unknown>): QueryResult {
  for (const name of Object.keys(raw)) {
    if (!KNOWN.has(name)) {
      return bad(`Unknown query parameter: ${name}.`);
    }
    // Express parses a repeated parameter into an array. Only one value of
    // each is meaningful, and accepting the first would silently discard the
    // rest.
    if (typeof raw[name] !== "string") {
      return bad(`Query parameter ${name} must be given exactly once.`);
    }
  }

  const query: TicketListQuery = {
    sortBy: "createdAt",
    sortOrder: "desc",
    page: 1,
    pageSize: 10,
  };

  if (raw.q !== undefined) {
    const trimmed = (raw.q as string).trim();
    if (trimmed.length > Q_MAX) {
      return bad(`Search text must be ${Q_MAX} characters or fewer.`);
    }
    // Empty after trimming is treated as absent, not as a search for nothing.
    if (trimmed.length > 0) query.q = trimmed;
  }

  for (const name of ["categoryId", "relatedSystemId"] as const) {
    if (raw[name] === undefined) continue;
    const value = asInteger(raw[name] as string);
    if (value === null || value < 1) {
      return bad(`Query parameter ${name} must be a positive integer.`);
    }
    query[name] = value;
  }

  if (raw.requestedPriority !== undefined) {
    const value = raw.requestedPriority as string;
    if (!(PRIORITIES as readonly string[]).includes(value)) {
      return bad(`Query parameter requestedPriority must be one of ${PRIORITIES.join(", ")}.`);
    }
    query.requestedPriority = value as TicketListQuery["requestedPriority"];
  }

  if (raw.sortBy !== undefined) {
    const value = raw.sortBy as string;
    if (!(SORTABLE as readonly string[]).includes(value)) {
      return bad(`Query parameter sortBy must be one of ${SORTABLE.join(", ")}.`);
    }
    query.sortBy = value as TicketListQuery["sortBy"];
  }

  if (raw.sortOrder !== undefined) {
    const value = raw.sortOrder as string;
    if (!(SORT_ORDERS as readonly string[]).includes(value)) {
      return bad("Query parameter sortOrder must be asc or desc.");
    }
    query.sortOrder = value as TicketListQuery["sortOrder"];
  }

  if (raw.page !== undefined) {
    const value = asInteger(raw.page as string);
    if (value === null || value < 1) {
      return bad("Query parameter page must be an integer of 1 or more.");
    }
    query.page = value;
  }

  if (raw.pageSize !== undefined) {
    const value = asInteger(raw.pageSize as string);
    if (value === null || !(PAGE_SIZES as readonly number[]).includes(value)) {
      return bad(`Query parameter pageSize must be one of ${PAGE_SIZES.join(", ")}.`);
    }
    query.pageSize = value;
  }

  return { ok: true, query };
}
