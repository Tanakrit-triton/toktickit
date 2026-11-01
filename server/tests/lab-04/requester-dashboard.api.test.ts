import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import type { TicketStatus } from "@prisma/client";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { resetLoginThrottle } from "../../src/lab-03/login-throttle.js";
import { loginAs, signInFields, type SignedIn } from "../helpers/session.js";
import { ACTIVE, DONE, apiPathOf, recentWindowStart } from "../helpers/dashboard.js";

// DSR-01 to DSR-06 from docs/lab-04/tests.md section 2.5 (AC-24 to AC-29).
// api-spec.md section 5.1 is the response contract; every metric is compared
// with its section 5.3 reference query, run here.
//
// The seeded Requesters are read, not changed. Tickets this suite creates are
// marked so they can be removed afterwards.

const prisma = getPrisma();

const NAPAT = "napat.cha@kmutt.ac.th";
const SIRIPORN = "siriporn.mee@kmutt.ac.th";
const PIMCHANOK = "pimchanok.son@kmutt.ac.th";
const STAFF = "wichai.pra@kmutt.ac.th";
const ADMIN = "sasithorn.pho@kmutt.ac.th";
const REQ_WINDOW = "zz.dsr.window@example.test";
const MARKER = "[dsr-71]";
const URL = "/api/v1/dashboard/requester";

const LINKS = {
  openTickets: "/tickets?statusGroup=ACTIVE",
  waitingForMe: "/tickets?status=WAITING_FOR_REQUESTER",
  updatedRecently: "/tickets?sortBy=updatedAt&sortOrder=desc",
  resolvedRecently: "/tickets?statusGroup=DONE",
};

type Item = { id: string; ticketNumber: string; summary: string; currentStatus: TicketStatus; updatedAt: string; resolvedAt?: string };
type Dashboard = {
  generatedAt: string;
  window: { from: string; to: string; timeZone: string };
  metrics: Record<keyof typeof LINKS, { count: number; link: string }>;
  lists: { needsAttention: Item[]; recentlyUpdated: Item[]; recentlyResolved: Item[] };
};

const ids = { napat: "", window: "" };
let napat: SignedIn;
let ticketCounter = 0;

async function dashboardOf(who: SignedIn): Promise<Dashboard> {
  const res = await who.agent.get(URL);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data as Dashboard;
}

type Row = { id: string; ticketNumber: string; summary: string; currentStatus: TicketStatus; updatedAt: Date; resolvedAt: Date | null };
const asItem = (row: Row, withResolvedAt = false): Item => ({
  id: row.id,
  ticketNumber: row.ticketNumber,
  summary: row.summary,
  currentStatus: row.currentStatus,
  updatedAt: row.updatedAt.toISOString(),
  ...(withResolvedAt ? { resolvedAt: row.resolvedAt!.toISOString() } : {}),
});

/** The api-spec section 5.3 queries, plus the specification section 5.8 lists. */
async function expectedFor(requesterId: string, from: Date) {
  const mine = { requesterId };
  const metrics = {
    openTickets: await prisma.ticket.count({ where: { ...mine, currentStatus: { in: ACTIVE } } }),
    waitingForMe: await prisma.ticket.count({ where: { ...mine, currentStatus: "WAITING_FOR_REQUESTER" } }),
    updatedRecently: await prisma.ticket.count({ where: { ...mine, updatedAt: { gte: from } } }),
    resolvedRecently: await prisma.ticket.count({ where: { ...mine, currentStatus: { in: DONE }, resolvedAt: { gte: from } } }),
  };
  const needsAttention = await prisma.ticket.findMany({
    where: { ...mine, currentStatus: "WAITING_FOR_REQUESTER" },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: 5,
  });
  const recentlyUpdated = await prisma.ticket.findMany({
    where: { ...mine, updatedAt: { gte: from } },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: 5,
  });
  const recentlyResolved = await prisma.ticket.findMany({
    where: { ...mine, currentStatus: { in: DONE }, resolvedAt: { gte: from } },
    orderBy: [{ resolvedAt: "desc" }, { id: "asc" }],
    take: 5,
  });
  return {
    metrics,
    lists: {
      needsAttention: needsAttention.map((t) => asItem(t)),
      recentlyUpdated: recentlyUpdated.map((t) => asItem(t)),
      recentlyResolved: recentlyResolved.map((t) => asItem(t, true)),
    },
  };
}

const countsOf = (dashboard: Dashboard) =>
  Object.fromEntries(Object.entries(dashboard.metrics).map(([key, metric]) => [key, metric.count]));

async function makeTicket(requesterId: string, status: TicketStatus) {
  ticketCounter += 1;
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true }, orderBy: { name: "asc" } });
  const system = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true }, orderBy: { name: "asc" } });
  return prisma.ticket.create({
    data: {
      ticketNumber: `TKT-2026-87${String(ticketCounter).padStart(3, "0")}`,
      requesterId,
      categoryId: category.id,
      relatedSystemId: system.id,
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
  await prisma.publicComment.deleteMany({ where: { ticket: where } });
  await prisma.ticketEvent.deleteMany({ where: { ticket: where } });
  await prisma.ticket.deleteMany({ where });
}

beforeAll(async () => {
  const fields = await signInFields();
  const fixture = { fullName: "ZZ DSR Window Requester", role: "REQUESTER" as const, isActive: true, ...fields };
  await prisma.user.upsert({ where: { email: REQ_WINDOW }, update: fixture, create: { email: REQ_WINDOW, ...fixture } });
  const idOf = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  ids.napat = await idOf(NAPAT);
  ids.window = await idOf(REQ_WINDOW);

  await clearOwnTickets();
  resetLoginThrottle();
  napat = await loginAs(NAPAT);
});

beforeEach(() => {
  resetLoginThrottle();
});

afterAll(async () => {
  await clearOwnTickets();
  await prisma.$disconnect();
});

describe("Requester Dashboard values (DSR-01 - AC-25, api-spec section 5.1)", () => {
  it("equals the section 5.3 queries for Napat Chaiwong, metric by metric and list by list", async () => {
    const before = Date.now();
    const dashboard = await dashboardOf(napat);
    const after = Date.now();

    // The window is stated (BR-36) and ends at the request time.
    expect(dashboard.window.timeZone).toBe("Asia/Bangkok");
    expect(dashboard.window.to).toBe(dashboard.generatedAt);
    const generatedAt = new Date(dashboard.generatedAt).getTime();
    expect(generatedAt).toBeGreaterThanOrEqual(before - 1000);
    expect(generatedAt).toBeLessThanOrEqual(after + 1000);
    const from = recentWindowStart(new Date(dashboard.generatedAt));
    expect(dashboard.window.from).toBe(from.toISOString());

    const expected = await expectedFor(ids.napat, from);
    expect(countsOf(dashboard)).toEqual(expected.metrics);
    expect(dashboard.lists).toEqual(expected.lists);
    // The seed gives Napat a ticket waiting for them (spec section 7.5).
    expect(dashboard.metrics.waitingForMe.count).toBeGreaterThan(0);
  });

  it("gives every card its client route", async () => {
    const dashboard = await dashboardOf(napat);

    for (const [key, link] of Object.entries(LINKS)) {
      expect(dashboard.metrics[key as keyof typeof LINKS].link, key).toBe(link);
    }
  });
});

describe("Requester Dashboard isolation (DSR-02 - AC-24, BR-39)", () => {
  it("is unchanged by another Requester's new and updated ticket, and lists only Napat's tickets", async () => {
    const before = await dashboardOf(napat);

    const siriporn = await loginAs(SIRIPORN);
    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true }, orderBy: { name: "asc" } });
    const system = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true }, orderBy: { name: "asc" } });
    const created = await siriporn.agent.post("/api/v1/tickets").send({
      categoryId: category.id,
      relatedSystemId: system.id,
      summary: `${MARKER} Siriporn's own ticket`,
      requestedPriority: "HIGH",
      description: "Created by another Requester to prove the dashboard filters on requesterId.",
    });
    expect(created.status).toBe(201);
    const comment = await siriporn.agent
      .post(`/api/v1/tickets/${created.body.data.id}/comments`)
      .send({ body: "An update from Siriporn on her own ticket." });
    expect(comment.status).toBe(201);

    const after = await dashboardOf(napat);

    expect(after.metrics).toEqual(before.metrics);
    expect(after.lists).toEqual(before.lists);
    const listed = [...after.lists.needsAttention, ...after.lists.recentlyUpdated, ...after.lists.recentlyResolved];
    expect(listed.length, "Napat's lists are not all empty").toBeGreaterThan(0);
    const rows = await prisma.ticket.findMany({ where: { id: { in: listed.map((i) => i.id) } }, select: { requesterId: true } });
    expect(rows).toHaveLength(new Set(listed.map((i) => i.id)).size);
    expect([...new Set(rows.map((r) => r.requesterId))]).toEqual([ids.napat]);
  });
});

describe("Requester Dashboard with no tickets (DSR-03 - AC-27, BR-38)", () => {
  it("gives Pimchanok Sonthi 0 for every count and [] for every list", async () => {
    const dashboard = await dashboardOf(await loginAs(PIMCHANOK));

    expect(dashboard.metrics).toEqual({
      openTickets: { count: 0, link: LINKS.openTickets },
      waitingForMe: { count: 0, link: LINKS.waitingForMe },
      updatedRecently: { count: 0, link: LINKS.updatedRecently },
      resolvedRecently: { count: 0, link: LINKS.resolvedRecently },
    });
    expect(dashboard.lists).toEqual({ needsAttention: [], recentlyUpdated: [], recentlyResolved: [] });
  });
});

describe("Requester Dashboard window boundary (DSR-04 - AC-26, BR-36)", () => {
  it("counts a ticket updated at 00:00:00 +07:00 six days ago, not one at 23:59:59 +07:00 seven days ago", async () => {
    const requester = await loginAs(REQ_WINDOW);
    const outside = await makeTicket(ids.window, "OPEN");
    const inside = await makeTicket(ids.window, "OPEN");

    // Bangkok midnight could pass between setting the times and the request;
    // the window the response states shows whether it did, and then the
    // times are set again from the new window.
    let dashboard: Dashboard | undefined;
    let from = new Date(0);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      from = recentWindowStart(new Date());
      await prisma.ticket.update({ where: { id: outside.id }, data: { updatedAt: new Date(from.getTime() - 1000) } });
      await prisma.ticket.update({ where: { id: inside.id }, data: { updatedAt: from } });
      dashboard = await dashboardOf(requester);
      if (dashboard.window.from === from.toISOString()) break;
    }
    expect(dashboard!.window.from).toBe(from.toISOString());
    // The times really were written, so the boundary is exact.
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: inside.id } })).updatedAt).toEqual(from);

    expect(dashboard!.metrics.updatedRecently.count).toBe(1);
    expect(dashboard!.lists.recentlyUpdated.map((i) => i.id)).toEqual([inside.id]);
  });
});

describe("Requester Dashboard authorization (DSR-05 - AC-29, api-spec section 8)", () => {
  it("answers no session with 401", async () => {
    const res = await request(app).get(URL);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it.each([
    ["IT Staff", STAFF],
    ["an Administrator", ADMIN],
  ])("answers %s with 403 FORBIDDEN", async (_who, email) => {
    const res = await (await loginAs(email)).agent.get(URL);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});

describe("Requester Dashboard drill-down (DSR-06 - AC-28)", () => {
  it.each(["openTickets", "waitingForMe"] as const)("%s.link lists exactly the card's count", async (key) => {
    const dashboard = await dashboardOf(napat);
    const metric = dashboard.metrics[key];

    const res = await napat.agent.get(apiPathOf(metric.link));

    expect(res.status).toBe(200);
    expect(res.body.meta.totalItems).toBe(metric.count);
  });
});
