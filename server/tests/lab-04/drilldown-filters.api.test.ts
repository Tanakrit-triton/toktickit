import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { TicketStatus } from "@prisma/client";
import { getPrisma } from "../../src/prisma.js";
import { resetLoginThrottle } from "../../src/lab-03/login-throttle.js";
import { loginAs, signInFields, type SignedIn } from "../helpers/session.js";

// FLT-01 to FLT-03 from docs/lab-04/tests.md section 2.6 (AC-28). api-spec.md
// section 4 is the contract; the groups are written out here from
// specification.md section 5.4.
//
// Every ticket here is this suite's own, marked so the queue can be narrowed
// to them with q, and removed afterwards.

const prisma = getPrisma();

const WICHAI = "wichai.pra@kmutt.ac.th";
const ARISA = "arisa.kon@kmutt.ac.th";
const REQ_A = "zz.flt.a@example.test";
const REQ_B = "zz.flt.b@example.test";
const MARKER = "[flt-70]";

const ACTIVE: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"];
const DONE: TicketStatus[] = ["RESOLVED", "CLOSED"];
const ALL: TicketStatus[] = [...ACTIVE, ...DONE, "CANCELLED"];
const BOTH = "Use either status or statusGroup, not both.";

const ids = { wichai: "", arisa: "", a: "", b: "" };
let requesterA: SignedIn;
let staff: SignedIn;
let ticketCounter = 0;

type Item = { id: string; currentStatus: TicketStatus; owner?: { id: string } | null };

/** My Tickets items carry no requester, so ownership is checked in the database. */
async function requestersOf(items: Item[]): Promise<string[]> {
  const rows = await prisma.ticket.findMany({ where: { id: { in: items.map((i) => i.id) } }, select: { requesterId: true } });
  expect(rows).toHaveLength(items.length);
  return [...new Set(rows.map((r) => r.requesterId))];
}

async function makeTicket(status: TicketStatus, requesterId: string, ownerId: string | null) {
  ticketCounter += 1;
  const category = await prisma.category.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
  const system = await prisma.relatedSystem.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
  return prisma.ticket.create({
    data: {
      ticketNumber: `TKT-2026-91${String(ticketCounter).padStart(3, "0")}`,
      requesterId,
      ownerId,
      categoryId: category!.id,
      relatedSystemId: system!.id,
      summary: `${MARKER} ${status} ${ticketCounter}`,
      description: "A description long enough to satisfy the twenty character minimum.",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: status,
    },
  });
}

async function clearOwnTickets() {
  const where = { summary: { contains: MARKER } };
  await prisma.ticketEvent.deleteMany({ where: { ticket: where } });
  await prisma.ticket.deleteMany({ where });
}

const myTickets = (query: Record<string, string>) =>
  requesterA.agent.get("/api/v1/tickets").query({ pageSize: "50", ...query });
const queue = (query: Record<string, string>) =>
  staff.agent.get("/api/v1/staff/tickets").query({ q: MARKER, pageSize: "50", ...query });

beforeAll(async () => {
  const fields = await signInFields();
  for (const [email, fullName] of [
    [REQ_A, "ZZ FLT Requester A"],
    [REQ_B, "ZZ FLT Requester B"],
  ]) {
    const fixture = { fullName, role: "REQUESTER" as const, isActive: true, ...fields };
    await prisma.user.upsert({ where: { email }, update: fixture, create: { email, ...fixture } });
  }
  const idOf = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  ids.wichai = await idOf(WICHAI);
  ids.arisa = await idOf(ARISA);
  ids.a = await idOf(REQ_A);
  ids.b = await idOf(REQ_B);

  await clearOwnTickets();
  // Requester A: one ticket in every status, owned by Wichai once claimed.
  for (const status of ALL) await makeTicket(status, ids.a, status === "NEW" ? null : ids.wichai);
  // Requester B: tickets in the same statuses, owned by Arisa, which A must never see.
  for (const status of ALL) await makeTicket(status, ids.b, status === "NEW" ? null : ids.arisa);

  resetLoginThrottle();
  requesterA = await loginAs(REQ_A);
  staff = await loginAs(WICHAI);
});

beforeEach(() => {
  resetLoginThrottle();
});

afterAll(async () => {
  await clearOwnTickets();
  await prisma.$disconnect();
});

describe("My Tickets drill-down (FLT-01 - AC-28, api-spec section 4.1)", () => {
  it("status=WAITING_FOR_REQUESTER returns only that status, only the caller's tickets", async () => {
    const res = await myTickets({ status: "WAITING_FOR_REQUESTER" });

    expect(res.status).toBe(200);
    const items = res.body.data as Item[];
    expect(items).toHaveLength(1);
    expect(items[0].currentStatus).toBe("WAITING_FOR_REQUESTER");
    expect(await requestersOf(items)).toEqual([ids.a]);
    expect(res.body.meta.totalItems).toBe(1);
  });

  it.each([
    ["ACTIVE", ACTIVE],
    ["DONE", DONE],
  ] as const)("statusGroup=%s returns exactly the group's statuses, only the caller's tickets", async (group, statuses) => {
    const res = await myTickets({ statusGroup: group });

    expect(res.status).toBe(200);
    const items = res.body.data as Item[];
    expect(items.map((t) => t.currentStatus).sort()).toEqual([...statuses].sort());
    expect(await requestersOf(items)).toEqual([ids.a]);
    expect(res.body.meta.totalItems).toBe(statuses.length);
  });

  it("keeps the Lab 2 behaviour with neither parameter", async () => {
    const res = await myTickets({});

    expect(res.status).toBe(200);
    expect(res.body.meta.totalItems).toBe(ALL.length);
  });
});

describe("Ticket Queue drill-down (FLT-02 - AC-28, api-spec section 4.2)", () => {
  it("statusGroup=ACTIVE with owner=me returns only Active tickets owned by the caller", async () => {
    const res = await queue({ statusGroup: "ACTIVE", owner: "me" });

    expect(res.status).toBe(200);
    const items = res.body.data as Item[];
    // A's Active tickets other than NEW are Wichai's; NEW is unassigned.
    expect(items.map((t) => t.currentStatus).sort()).toEqual(ACTIVE.filter((s) => s !== "NEW").sort());
    for (const item of items) {
      expect(ACTIVE).toContain(item.currentStatus);
      expect(item.owner?.id).toBe(ids.wichai);
    }
  });

  it("statusGroup=DONE without owner returns the Done tickets of every owner", async () => {
    const res = await queue({ statusGroup: "DONE" });

    expect(res.status).toBe(200);
    const items = res.body.data as Item[];
    expect(items).toHaveLength(DONE.length * 2);
    for (const item of items) expect(DONE).toContain(item.currentStatus);
  });
});

describe("invalid drill-down parameters (FLT-03 - AC-28)", () => {
  it.each([
    ["My Tickets", () => myTickets({ status: "OPEN", statusGroup: "ACTIVE" })],
    ["the Ticket Queue", () => queue({ status: "OPEN", statusGroup: "ACTIVE" })],
  ] as const)("refuses status with statusGroup on %s with 400", async (_where, send) => {
    const res = await send();

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: "BAD_REQUEST", message: BOTH } });
  });

  it.each([
    ["My Tickets", () => myTickets({ statusGroup: "OPEN" })],
    ["the Ticket Queue", () => queue({ statusGroup: "OPEN" })],
  ] as const)("refuses statusGroup=OPEN on %s with 400", async (_where, send) => {
    const res = await send();

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });
});
