import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import type { Priority, TicketStatus } from "@prisma/client";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { resetLoginThrottle } from "../../src/lab-03/login-throttle.js";
import { loginAs, signInFields, type SignedIn } from "../helpers/session.js";
import { ACTIVE, apiPathOf, recentWindowStart } from "../helpers/dashboard.js";

// DSS-01 to DSS-07 from docs/lab-04/tests.md section 2.5 (AC-25 to AC-29).
// api-spec.md section 5.2 is the response contract; every metric is compared
// with its section 5.3 reference query, run here.
//
// The seeded accounts are read, not changed. Tickets this suite creates are
// marked so they can be removed afterwards; DSS-07 moves other tickets'
// updatedAt aside and restores it in afterEach.

const prisma = getPrisma();

const ARISA = "arisa.kon@kmutt.ac.th";
const TEERAPAT = "teerapat.boo@kmutt.ac.th";
const ADMIN = "sasithorn.pho@kmutt.ac.th";
const REQUESTER = "napat.cha@kmutt.ac.th";
const STAFF_X = "zz.dss.staff@example.test";
const MARKER = "[dss-71]";
const URL = "/api/v1/staff/dashboard";
const TICKET_CREATED = new Date("2026-10-01T02:00:00.000Z");
const PAST = "2026-10-15T03:15:00.000Z";

/** api-spec section 5.2: the L3 queue lifecycle order, written out by hand. */
const STATUS_ORDER: TicketStatus[] = [
  "NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED", "RESOLVED", "CLOSED", "CANCELLED",
];
const PRIORITIES_DOWN: Priority[] = ["URGENT", "HIGH", "MEDIUM", "LOW"];
const OPEN_ACTION = ["PLANNED", "IN_PROGRESS"] as const;

type Metric = { count: number; link: string | null };
type ActionItem = { actionId: string; ticketId: string; ticketNumber: string; description: string; status: string; actionAt: string };
type Dashboard = {
  generatedAt: string;
  window: { from: string; to: string; timeZone: string };
  metrics: { unassigned: Metric; ownedByMe: Metric; myOpenActions: Metric };
  byStatus: { status: TicketStatus; count: number; link: string }[];
  activeByItPriority: { itPriority: Priority; count: number; link: string }[];
  lists: {
    myOpenActions: ActionItem[];
    urgent: { id: string; ticketNumber: string; summary: string; currentStatus: TicketStatus; owner: { id: string; fullName: string } | null; createdAt: string }[];
    recentlyUpdated: { id: string; ticketNumber: string; summary: string; currentStatus: TicketStatus; updatedAt: string }[];
  };
  users: { active: Record<"REQUESTER" | "IT_STAFF" | "ADMINISTRATOR", number>; inactive: number } | null;
};

const ids = { arisa: "", staffX: "", requester: "" };
let arisa: SignedIn;
let staffX: SignedIn;
let ticketCounter = 0;

async function dashboardOf(who: SignedIn): Promise<Dashboard> {
  const res = await who.agent.get(URL);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data as Dashboard;
}

/** api-spec section 5.2: cut to 120 characters, the last being "…". */
const cut = (text: string) => (text.length > 120 ? `${text.slice(0, 119)}…` : text);

/** The api-spec section 5.3 queries, plus the specification section 5.8 lists. */
async function expectedFor(me: string, from: Date) {
  const active = { currentStatus: { in: ACTIVE } };
  const openActions = { performedById: me, status: { in: [...OPEN_ACTION] }, ticket: active };
  const metrics = {
    unassigned: await prisma.ticket.count({ where: { ownerId: null, ...active } }),
    ownedByMe: await prisma.ticket.count({ where: { ownerId: me, ...active } }),
    myOpenActions: await prisma.actionTaken.count({ where: openActions }),
  };
  const actions = await prisma.actionTaken.findMany({
    where: openActions,
    orderBy: [{ actionAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    take: 5,
    include: { ticket: { select: { ticketNumber: true } } },
  });
  const urgent = await prisma.ticket.findMany({
    where: { itPriority: "URGENT", ...active },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 5,
    include: { owner: { select: { id: true, fullName: true } } },
  });
  const recent = await prisma.ticket.findMany({
    where: { updatedAt: { gte: from } },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: 5,
  });
  return {
    metrics,
    lists: {
      myOpenActions: actions.map((a) => ({
        actionId: a.id,
        ticketId: a.ticketId,
        ticketNumber: a.ticket.ticketNumber,
        description: cut(a.description),
        status: a.status,
        actionAt: a.actionAt.toISOString(),
      })),
      urgent: urgent.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        summary: t.summary,
        currentStatus: t.currentStatus,
        owner: t.owner,
        createdAt: t.createdAt.toISOString(),
      })),
      recentlyUpdated: recent.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        summary: t.summary,
        currentStatus: t.currentStatus,
        updatedAt: t.updatedAt.toISOString(),
      })),
    },
  };
}

async function makeTicket(status: TicketStatus, ownerId: string | null) {
  ticketCounter += 1;
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true }, orderBy: { name: "asc" } });
  const system = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true }, orderBy: { name: "asc" } });
  return prisma.ticket.create({
    data: {
      ticketNumber: `TKT-2026-86${String(ticketCounter).padStart(3, "0")}`,
      requesterId: ids.requester,
      ownerId,
      categoryId: category.id,
      relatedSystemId: system.id,
      summary: `${MARKER} ${status} ${ticketCounter}`,
      description: "A description long enough to satisfy the twenty character minimum.",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: status,
      createdAt: TICKET_CREATED,
    },
  });
}

const staffBase = (ticketId: string) => `/api/v1/staff/tickets/${ticketId}`;

async function createAction(who: SignedIn, ticketId: string, description = "Checked the printer queue.") {
  const res = await who.agent
    .post(`${staffBase(ticketId)}/actions`)
    .send({ clientRequestId: randomUUID(), actionAt: PAST, description, status: "PLANNED" });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data as { id: string; version: number };
}

async function clearOwnTickets() {
  const where = { summary: { contains: MARKER } };
  await prisma.actionTaken.deleteMany({ where: { ticket: where } });
  await prisma.ticketEvent.deleteMany({ where: { ticket: where } });
  await prisma.ticket.deleteMany({ where });
}

beforeAll(async () => {
  const fields = await signInFields();
  const fixture = { fullName: "ZZ DSS Staff", role: "IT_STAFF" as const, isActive: true, ...fields };
  await prisma.user.upsert({ where: { email: STAFF_X }, update: fixture, create: { email: STAFF_X, ...fixture } });
  const idOf = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  ids.arisa = await idOf(ARISA);
  ids.staffX = await idOf(STAFF_X);
  ids.requester = await idOf(REQUESTER);

  await clearOwnTickets();
  resetLoginThrottle();
  arisa = await loginAs(ARISA);
  staffX = await loginAs(STAFF_X);
});

beforeEach(() => {
  resetLoginThrottle();
});

afterEach(async () => {
  await clearOwnTickets();
});

afterAll(async () => {
  await clearOwnTickets();
  await prisma.$disconnect();
});

describe("Staff Dashboard values (DSS-01 - AC-25, api-spec section 5.2)", () => {
  it("equals the section 5.3 queries for Arisa Kongkaew, metric by metric and list by list", async () => {
    const before = Date.now();
    const dashboard = await dashboardOf(arisa);
    const after = Date.now();

    expect(dashboard.window.timeZone).toBe("Asia/Bangkok");
    expect(dashboard.window.to).toBe(dashboard.generatedAt);
    const generatedAt = new Date(dashboard.generatedAt).getTime();
    expect(generatedAt).toBeGreaterThanOrEqual(before - 1000);
    expect(generatedAt).toBeLessThanOrEqual(after + 1000);
    const from = recentWindowStart(new Date(dashboard.generatedAt));
    expect(dashboard.window.from).toBe(from.toISOString());

    const expected = await expectedFor(ids.arisa, from);
    expect({
      unassigned: dashboard.metrics.unassigned.count,
      ownedByMe: dashboard.metrics.ownedByMe.count,
      myOpenActions: dashboard.metrics.myOpenActions.count,
    }).toEqual(expected.metrics);
    expect(dashboard.lists).toEqual(expected.lists);
    // The seed gives Arisa open actions, one on another owner's ticket (spec section 7.5).
    expect(dashboard.metrics.myOpenActions.count).toBeGreaterThan(0);
    expect(dashboard.lists.urgent.length, "the seed has an URGENT Active ticket").toBeGreaterThan(0);
  });

  it("gives every card its client route, and myOpenActions none", async () => {
    const dashboard = await dashboardOf(arisa);

    expect(dashboard.metrics.unassigned.link).toBe("/staff/queue?owner=unassigned&statusGroup=ACTIVE");
    expect(dashboard.metrics.ownedByMe.link).toBe("/staff/queue?owner=me&statusGroup=ACTIVE");
    expect(dashboard.metrics.myOpenActions.link).toBeNull();
  });

  it("cuts a long action description to 120 characters ending in an ellipsis, and keeps one of 120", async () => {
    const ticket = await makeTicket("OPEN", ids.staffX);
    const long = "L".repeat(200);
    const exact = "E".repeat(120);
    const first = await createAction(staffX, ticket.id, long);
    const second = await createAction(staffX, ticket.id, exact);

    const listed = (await dashboardOf(staffX)).lists.myOpenActions;
    const descriptionOf = (id: string) => listed.find((a) => a.actionId === id)?.description;

    expect(descriptionOf(first.id)).toBe(`${"L".repeat(119)}…`);
    expect(descriptionOf(first.id)).toHaveLength(120);
    expect(descriptionOf(second.id)).toBe(exact);
  });
});

describe("Staff Dashboard breakdowns (DSS-02 - AC-25)", () => {
  it("byStatus has the 8 statuses in lifecycle order, zeros included, each equal to its query", async () => {
    const dashboard = await dashboardOf(arisa);

    expect(dashboard.byStatus.map((entry) => entry.status)).toEqual(STATUS_ORDER);
    for (const entry of dashboard.byStatus) {
      expect(entry.count, entry.status).toBe(await prisma.ticket.count({ where: { currentStatus: entry.status } }));
      expect(entry.link).toBe(`/staff/queue?status=${entry.status}`);
    }
  });

  it("activeByItPriority has the 4 IT Priorities from URGENT down, zeros included, each equal to its query", async () => {
    const dashboard = await dashboardOf(arisa);

    expect(dashboard.activeByItPriority.map((entry) => entry.itPriority)).toEqual(PRIORITIES_DOWN);
    for (const entry of dashboard.activeByItPriority) {
      const count = await prisma.ticket.count({ where: { itPriority: entry.itPriority, currentStatus: { in: ACTIVE } } });
      expect(entry.count, entry.itPriority).toBe(count);
      expect(entry.link).toBe(`/staff/queue?itPriority=${entry.itPriority}&statusGroup=ACTIVE`);
    }
  });
});

describe("Staff Dashboard with no open actions (DSS-03 - AC-27, BR-38)", () => {
  it("gives Teerapat Boonsri myOpenActions 0 and []", async () => {
    const dashboard = await dashboardOf(await loginAs(TEERAPAT));

    expect(dashboard.metrics.myOpenActions).toEqual({ count: 0, link: null });
    expect(dashboard.lists.myOpenActions).toEqual([]);
  });
});

describe("Staff Dashboard ignores actions that are not open on an Active ticket (DSS-04 - AC-25, BR-35)", () => {
  it("stops counting an open action once its ticket is cancelled", async () => {
    const ticket = await makeTicket("OPEN", ids.staffX);
    const action = await createAction(staffX, ticket.id);
    const counted = await dashboardOf(staffX);
    expect(counted.metrics.myOpenActions.count).toBe(1);
    expect(counted.lists.myOpenActions.map((a) => a.actionId)).toEqual([action.id]);

    const { version } = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    const cancelled = await staffX.agent
      .post(`${staffBase(ticket.id)}/status`)
      .send({ status: "CANCELLED", reason: "Raised in error by the Requester.", version });
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    // The action itself is untouched (spec section 5.4).
    expect((await prisma.actionTaken.findUniqueOrThrow({ where: { id: action.id } })).status).toBe("PLANNED");

    const after = await dashboardOf(staffX);
    expect(after.metrics.myOpenActions.count).toBe(0);
    expect(after.lists.myOpenActions).toEqual([]);
  });

  it("stops counting an action once it is cancelled itself", async () => {
    const ticket = await makeTicket("OPEN", ids.staffX);
    const action = await createAction(staffX, ticket.id);
    expect((await dashboardOf(staffX)).metrics.myOpenActions.count).toBe(1);

    const patched = await staffX.agent
      .patch(`/api/v1/staff/actions/${action.id}`)
      .send({ version: action.version, status: "CANCELLED", result: "No longer needed after the restart." });
    expect(patched.status, JSON.stringify(patched.body)).toBe(200);

    const after = await dashboardOf(staffX);
    expect(after.metrics.myOpenActions.count).toBe(0);
    expect(after.lists.myOpenActions).toEqual([]);
  });
});

describe("Staff Dashboard authorization and user counts (DSS-05 - AC-29, api-spec section 8)", () => {
  it("answers no session with 401", async () => {
    const res = await request(app).get(URL);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("answers a Requester with 403 FORBIDDEN", async () => {
    const res = await (await loginAs(REQUESTER)).agent.get(URL);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("gives IT Staff users: null", async () => {
    expect((await dashboardOf(arisa)).users).toBeNull();
  });

  it("gives an Administrator the active count per role and the inactive total from the User table", async () => {
    const dashboard = await dashboardOf(await loginAs(ADMIN));

    const active = (role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR") =>
      prisma.user.count({ where: { role, isActive: true } });
    expect(dashboard.users).toEqual({
      active: { REQUESTER: await active("REQUESTER"), IT_STAFF: await active("IT_STAFF"), ADMINISTRATOR: await active("ADMINISTRATOR") },
      inactive: await prisma.user.count({ where: { isActive: false } }),
    });
    // The seed has an inactive IT Staff account (tests.md section 1).
    expect(dashboard.users!.inactive).toBeGreaterThan(0);
  });
});

describe("Staff Dashboard drill-down (DSS-06 - AC-28)", () => {
  it("unassigned.link, ownedByMe.link, and a byStatus link each list exactly the card's count", async () => {
    const dashboard = await dashboardOf(arisa);
    const inProgress = dashboard.byStatus.find((entry) => entry.status === "IN_PROGRESS")!;
    const cards = [dashboard.metrics.unassigned, dashboard.metrics.ownedByMe, inProgress];

    for (const card of cards) {
      const res = await arisa.agent.get(apiPathOf(card.link!));
      expect(res.status, card.link!).toBe(200);
      expect(res.body.meta.totalItems, card.link!).toBe(card.count);
    }
    expect(dashboard.metrics.ownedByMe.count, "the seed gives Arisa Active tickets").toBeGreaterThan(0);
  });
});

describe("Staff Dashboard window boundary (DSS-07 - AC-26, BR-36)", () => {
  // Every other ticket updated in the window is moved before it for this test,
  // so recentlyUpdated (at most 5 items) can show the boundary.
  const movedAside = new Map<string, Date>();

  afterEach(async () => {
    for (const [id, updatedAt] of movedAside) await prisma.ticket.update({ where: { id }, data: { updatedAt } });
    movedAside.clear();
  });

  it("lists a ticket updated at 00:00:00 +07:00 six days ago, not one at 23:59:59 +07:00 seven days ago", async () => {
    const outside = await makeTicket("OPEN", null);
    const inside = await makeTicket("OPEN", null);

    let dashboard: Dashboard | undefined;
    let from = new Date(0);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      from = recentWindowStart(new Date());
      const others = await prisma.ticket.findMany({
        where: { updatedAt: { gte: new Date(from.getTime() - 1000) }, id: { notIn: [outside.id, inside.id] } },
        select: { id: true, updatedAt: true },
      });
      for (const other of others) {
        if (!movedAside.has(other.id)) movedAside.set(other.id, other.updatedAt);
        await prisma.ticket.update({ where: { id: other.id }, data: { updatedAt: new Date(from.getTime() - 86_400_000) } });
      }
      await prisma.ticket.update({ where: { id: outside.id }, data: { updatedAt: new Date(from.getTime() - 1000) } });
      await prisma.ticket.update({ where: { id: inside.id }, data: { updatedAt: from } });
      dashboard = await dashboardOf(arisa);
      if (dashboard.window.from === from.toISOString()) break;
    }
    expect(dashboard!.window.from).toBe(from.toISOString());
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: inside.id } })).updatedAt).toEqual(from);

    expect(dashboard!.lists.recentlyUpdated.map((t) => t.id)).toEqual([inside.id]);
  });
});
