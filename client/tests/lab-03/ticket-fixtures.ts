import { vi } from "vitest";
import { IT_STAFF, ADMINISTRATOR, REQUESTER } from "./helpers.js";

// Fixtures for the Lab 3 ticket detail suites (docs/lab-03/tests.md UI-27 to
// UI-38, STY-04).
//
// The API is faked at fetch(), not at a client module, so the screens are held
// to the URLs, methods, bodies, and response shapes in docs/lab-03/api-spec.md
// sections 4 to 6 rather than to a function name. Sign-in still goes through
// mockStartupSession() in helpers.tsx.

export const TICKET_ID = "3f2b9c10-0000-4000-8000-000000000042";
export const TICKET_NUMBER = "TKT-2026-00042";

const T0 = "2026-09-01T13:24:07.512Z";

/** api-spec.md 5.3: active IT Staff and Administrators, sorted by name. */
export const ASSIGNEES = [
  { id: "ffffffff-0000-0000-0000-000000000006", fullName: "Kittipong Saelim", role: "IT_STAFF" },
  { id: ADMINISTRATOR.id, fullName: ADMINISTRATOR.fullName, role: "ADMINISTRATOR" },
  { id: IT_STAFF.id, fullName: IT_STAFF.fullName, role: "IT_STAFF" },
];

export const ACTIVE_ATTACHMENT = {
  id: "a1a1a1a1-0000-4000-8000-000000000001",
  ticketId: TICKET_ID,
  originalFilename: "battery-report.pdf",
  mimeType: "application/pdf",
  sizeBytes: 20480,
  uploadedAt: T0,
  status: "ACTIVE",
  removedAt: null,
  removedReason: null,
};

export const REMOVED_ATTACHMENT = {
  ...ACTIVE_ATTACHMENT,
  id: "a1a1a1a1-0000-4000-8000-000000000002",
  originalFilename: "old-screenshot.png",
  mimeType: "image/png",
  status: "REMOVED",
  removedAt: T0,
  removedReason: "Wrong file attached",
};

/** api-spec.md 5.2. Defaults to an owned IN_PROGRESS ticket. */
export function staffTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: TICKET_ID,
    ticketNumber: TICKET_NUMBER,
    ticketDate: T0,
    requester: { id: REQUESTER.id, fullName: REQUESTER.fullName, email: REQUESTER.email },
    category: { id: 2, name: "Hardware" },
    relatedSystem: { id: 7, name: "Corporate Laptop" },
    summary: "Laptop battery drains within one hour",
    description: "Started after the update.\nHappens on battery only.",
    requestedPriority: "HIGH",
    itPriority: "URGENT",
    currentStatus: "IN_PROGRESS",
    owner: { id: IT_STAFF.id, fullName: IT_STAFF.fullName },
    requesterIndicatedResolvedAt: null,
    availableTransitions: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
    attachments: [],
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

/** api-spec.md section 4: the Lab 2 detail plus owner and the indication, without itPriority. */
export function requesterTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: TICKET_ID,
    ticketNumber: TICKET_NUMBER,
    ticketDate: T0,
    requester: { id: REQUESTER.id, fullName: REQUESTER.fullName },
    category: { id: 2, name: "Hardware" },
    relatedSystem: { id: 7, name: "Corporate Laptop" },
    summary: "Laptop battery drains within one hour",
    description: "Started after the update.",
    requestedPriority: "HIGH",
    currentStatus: "OPEN",
    owner: { id: IT_STAFF.id, fullName: IT_STAFF.fullName },
    requesterIndicatedResolvedAt: null,
    attachments: [],
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

type Author = { id: string; fullName: string; role: string };

const authorOf = (user: { id: string; fullName: string; role: string }): Author => ({
  id: user.id,
  fullName: user.fullName,
  role: user.role,
});

/** CommentOrNote, api-spec.md 1.6. */
export function entry(id: string, body: string, author: Author = authorOf(IT_STAFF), createdAt = T0) {
  return { id, ticketId: TICKET_ID, author, body, createdAt };
}

export const asAuthor = authorOf;

type Reply = { status: number; body?: unknown };
type Handler = Reply | ((body: unknown) => Reply | Promise<Reply>);

export type ApiCall = { method: string; path: string; body: unknown };

const json = (status: number, body: unknown) =>
  status === 204
    ? new Response(null, { status })
    : new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * Fakes fetch() for `/api/v1` with `routes`, keyed "METHOD /path". A handler
 * may be replaced mid-test to change what the next request sees. An unlisted
 * route answers 500, so an unexpected request shows up as a failure state.
 */
export function fakeApi(routes: Record<string, Handler>) {
  const calls: ApiCall[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.replace(/^\/api\/v1/, "");
    let body: unknown;
    if (typeof init?.body === "string" && init.body.length > 0) body = JSON.parse(init.body);
    calls.push({ method, path, body });

    // A list route with a query string falls back to its bare path, so a test
    // can key "GET /staff/tickets" and read the parameters from `calls`.
    const handler = routes[`${method} ${path}`] ?? routes[`${method} ${path.split("?")[0]}`];
    if (handler === undefined) {
      return json(500, { error: { code: "INTERNAL_ERROR", message: "Unexpected request in test." } });
    }
    const reply = typeof handler === "function" ? await handler(body) : handler;
    return json(reply.status, reply.body);
  });

  return {
    routes,
    calls,
    /** Calls made to `METHOD /path`. */
    callsTo(method: string, path: string) {
      return calls.filter((c) => c.method === method && c.path === path);
    },
    /** Every state-changing call. */
    writes() {
      return calls.filter((c) => c.method !== "GET");
    },
  };
}

export const ok = (data: unknown): Reply => ({ status: 200, body: { data } });
export const created = (data: unknown): Reply => ({ status: 201, body: { data } });
export const failure = (status: number, code: string, message: string): Reply => ({
  status,
  body: { error: { code, message } },
});

/** The routes Staff Ticket Detail reads on load. */
export function staffRoutes(
  ticket = staffTicket(),
  comments: unknown[] = [],
  notes: unknown[] = [],
): Record<string, Handler> {
  return {
    [`GET /staff/tickets/${TICKET_ID}`]: ok(ticket),
    "GET /staff/assignees": ok(ASSIGNEES),
    [`GET /tickets/${TICKET_ID}/comments`]: ok(comments),
    [`GET /tickets/${TICKET_ID}/notes`]: ok(notes),
  };
}

/** The routes Requester Ticket Detail reads on load. */
export function requesterRoutes(ticket = requesterTicket(), comments: unknown[] = []): Record<string, Handler> {
  return {
    [`GET /tickets/${TICKET_ID}`]: ok(ticket),
    [`GET /tickets/${TICKET_ID}/comments`]: ok(comments),
  };
}

export const ALL_STATUSES = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
] as const;

/** ui-spec.md 7.1 display text. */
export const STATUS_TEXT: Record<string, string> = {
  NEW: "New",
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING_FOR_REQUESTER: "Waiting for Requester",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
  CANCELLED: "Cancelled",
};

/** A Ticket Queue item, api-spec.md 5.1. Defaults to an owned IN_PROGRESS ticket. */
export function queueItem(ticketNumber: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `q-${ticketNumber}`,
    ticketNumber,
    summary: "Laptop battery drains within one hour",
    requester: { id: REQUESTER.id, fullName: REQUESTER.fullName },
    category: { id: 2, name: "Hardware" },
    requestedPriority: "HIGH",
    itPriority: "URGENT",
    currentStatus: "IN_PROGRESS",
    owner: { id: IT_STAFF.id, fullName: IT_STAFF.fullName },
    requesterIndicatedResolvedAt: null,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

/** A GET /staff/tickets page: `{ data, meta }`. */
export function queuePage(items: unknown[], meta: Partial<{ page: number; pageSize: number; totalItems: number; totalPages: number }> = {}): Reply {
  const pageSize = meta.pageSize ?? 20;
  const totalItems = meta.totalItems ?? items.length;
  return {
    status: 200,
    body: {
      data: items,
      meta: { page: 1, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize), ...meta },
    },
  };
}

/** api-spec.md section 3: active categories. */
export const QUEUE_CATEGORIES = [
  { id: 1, name: "Account and Access" },
  { id: 2, name: "Hardware" },
];

/** The routes the Ticket Queue reads on load. */
export function queueRoutes(page: Handler = queuePage([queueItem(TICKET_NUMBER)])): Record<string, Handler> {
  return {
    "GET /staff/tickets": page,
    "GET /categories": ok(QUEUE_CATEGORIES),
    "GET /staff/assignees": ok(ASSIGNEES),
  };
}
