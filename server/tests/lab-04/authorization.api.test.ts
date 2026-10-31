import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { resetLoginThrottle } from "../../src/lab-03/login-throttle.js";
import { loginAs, signInFields, type SignedIn } from "../helpers/session.js";

// AUZ-01 and AUZ-02 from docs/lab-04/tests.md section 2.6 (AC-11, AC-23,
// AC-29). api-spec.md section 8 is the source table; every row is tried with
// no session and with each role.
//
// A ✓ cell means the role is admitted. Where the endpoint is complete in #70,
// the test expects its success status. The two dashboard endpoints are #71's;
// for them a ✓ cell is checked as "admitted": the route exists and the role
// passes its guard (not 401, 403, or 404), so this table does not depend on
// what the dashboard returns.

const prisma = getPrisma();

const STAFF = "wichai.pra@kmutt.ac.th";
const ADMIN = "sasithorn.pho@kmutt.ac.th";
const REQ_A = "zz.auz4.a@example.test";
const REQ_B = "zz.auz4.b@example.test";
const MARKER = "[auz-70]";
const PAST = "2026-10-15T03:15:00.000Z";

type Caller = "none" | "owner" | "otherRequester" | "staff" | "admin";
/** A status code, or "admitted": the route exists and the role passes (not 401, 403, or 404). */
type Expected = number | "admitted";

const ids = { staff: "", a: "", b: "" };
let ticketId = "";
let actionId = "";
const agents: Partial<Record<Exclude<Caller, "none">, SignedIn>> = {};

async function makeTicket(n: number) {
  const category = await prisma.category.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
  const system = await prisma.relatedSystem.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
  return prisma.ticket.create({
    data: {
      ticketNumber: `TKT-2026-88${String(n).padStart(3, "0")}`,
      requesterId: ids.a,
      ownerId: ids.staff,
      categoryId: category!.id,
      relatedSystemId: system!.id,
      summary: `${MARKER} ticket ${n}`,
      description: "A description long enough to satisfy the twenty character minimum.",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: "OPEN",
      createdAt: new Date("2026-10-01T00:00:00.000Z"),
    },
  });
}

async function clearOwnTickets() {
  const where = { summary: { contains: MARKER } };
  await prisma.actionTaken.deleteMany({ where: { ticket: where } });
  await prisma.ticketEvent.deleteMany({ where: { ticket: where } });
  await prisma.ticket.deleteMany({ where });
}

/** What a refused write must leave untouched. */
async function snapshot() {
  const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  return {
    ticketVersion: ticket.version,
    actions: await prisma.actionTaken.findMany({ where: { ticketId }, orderBy: { id: "asc" } }),
    events: await prisma.ticketEvent.count({ where: { ticketId } }),
  };
}

type Row = {
  name: string;
  method: "get" | "post" | "patch";
  path: () => string;
  body?: () => Promise<Record<string, unknown>> | Record<string, unknown>;
  expected: Record<Caller, Expected>;
};

// api-spec.md section 8, row by row.
const ROWS: Row[] = [
  {
    name: "GET /tickets/{id}/actions",
    method: "get",
    path: () => `/api/v1/tickets/${ticketId}/actions`,
    expected: { none: 401, owner: 200, otherRequester: 404, staff: 200, admin: 200 },
  },
  {
    name: "POST /staff/tickets/{id}/actions",
    method: "post",
    path: () => `/api/v1/staff/tickets/${ticketId}/actions`,
    body: () => ({ clientRequestId: randomUUID(), actionAt: PAST, description: "Checked the printer queue." }),
    expected: { none: 401, owner: 403, otherRequester: 403, staff: 201, admin: 201 },
  },
  {
    name: "PATCH /staff/actions/{id}",
    method: "patch",
    path: () => `/api/v1/staff/actions/${actionId}`,
    body: async () => {
      const { version } = await prisma.actionTaken.findUniqueOrThrow({ where: { id: actionId } });
      return { version, description: `Edited at ${randomUUID()}.` };
    },
    expected: { none: 401, owner: 403, otherRequester: 403, staff: 200, admin: 200 },
  },
  {
    name: "GET /staff/tickets/{id}/history",
    method: "get",
    path: () => `/api/v1/staff/tickets/${ticketId}/history`,
    expected: { none: 401, owner: 403, otherRequester: 403, staff: 200, admin: 200 },
  },
  {
    name: "GET /dashboard/requester",
    method: "get",
    path: () => "/api/v1/dashboard/requester",
    expected: { none: 401, owner: "admitted", otherRequester: "admitted", staff: 403, admin: 403 },
  },
  {
    name: "GET /staff/dashboard",
    method: "get",
    path: () => "/api/v1/staff/dashboard",
    expected: { none: 401, owner: 403, otherRequester: 403, staff: "admitted", admin: "admitted" },
  },
];

const CALLERS: Caller[] = ["none", "owner", "otherRequester", "staff", "admin"];

async function call(row: Row, caller: Caller) {
  const body = row.body ? await row.body() : undefined;
  const test =
    caller === "none" ? request(app)[row.method](row.path()) : agents[caller]!.agent[row.method](row.path());
  return body === undefined ? test : test.send(body);
}

beforeAll(async () => {
  const fields = await signInFields();
  for (const [email, fullName] of [
    [REQ_A, "ZZ AUZ4 Requester A"],
    [REQ_B, "ZZ AUZ4 Requester B"],
  ]) {
    const fixture = { fullName, role: "REQUESTER" as const, isActive: true, ...fields };
    await prisma.user.upsert({ where: { email }, update: fixture, create: { email, ...fixture } });
  }
  const idOf = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  ids.staff = await idOf(STAFF);
  ids.a = await idOf(REQ_A);
  ids.b = await idOf(REQ_B);

  await clearOwnTickets();
  resetLoginThrottle();
  agents.owner = await loginAs(REQ_A);
  agents.otherRequester = await loginAs(REQ_B);
  agents.staff = await loginAs(STAFF);
  agents.admin = await loginAs(ADMIN);

  const ticket = await makeTicket(1);
  ticketId = ticket.id;
  const created = await agents.staff.agent
    .post(`/api/v1/staff/tickets/${ticketId}/actions`)
    .send({ clientRequestId: randomUUID(), actionAt: PAST, description: "The first recorded action." });
  expect(created.status).toBe(201);
  actionId = created.body.data.id;
});

beforeEach(() => {
  resetLoginThrottle();
});

afterAll(async () => {
  await clearOwnTickets();
  await prisma.$disconnect();
});

describe("Lab 4 authorization table (AUZ-01 - AC-11, AC-23, AC-29, api-spec section 8)", () => {
  const cases = ROWS.flatMap((row) => CALLERS.map((caller) => [row.name, caller, row] as const));

  it.each(cases)("%s as %s", async (_name, caller, row) => {
    const expected = row.expected[caller];
    const before = await snapshot();

    const res = await call(row, caller);

    if (expected === "admitted") {
      expect([401, 403, 404], `${row.name} as ${caller}: ${res.status}`).not.toContain(res.status);
    } else {
      expect(res.status, JSON.stringify(res.body)).toBe(expected);
    }
    // A refused call changes nothing.
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      expect(await snapshot()).toEqual(before);
    }
  });
});

describe("role check before lookup (AUZ-02 - AC-11)", () => {
  it("gives a Requester identical 403 bodies for an action POST to a missing and to an existing ticket", async () => {
    const body = { clientRequestId: randomUUID(), actionAt: PAST, description: "A Requester's attempt." };
    const before = await snapshot();

    const missing = await agents.owner!.agent.post(`/api/v1/staff/tickets/${randomUUID()}/actions`).send(body);
    const existing = await agents.owner!.agent.post(`/api/v1/staff/tickets/${ticketId}/actions`).send(body);

    expect(missing.status).toBe(403);
    expect(existing.status).toBe(403);
    expect(existing.text).toBe(missing.text);
    expect(await snapshot()).toEqual(before);
  });
});
