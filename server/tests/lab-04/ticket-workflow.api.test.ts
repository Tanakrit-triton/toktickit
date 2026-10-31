import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { TicketStatus } from "@prisma/client";
import { getPrisma } from "../../src/prisma.js";
import { resetLoginThrottle } from "../../src/lab-03/login-throttle.js";
import { loginAs, signInFields, type SignedIn } from "../helpers/session.js";

// WF-01 to WF-12 from docs/lab-04/tests.md section 2.4 (AC-13 to AC-19,
// AC-22 to AC-24). api-spec.md section 3, with Amendment 4, is the contract.
//
// Every ticket here is created by this suite for its own Requesters, so no
// seeded ticket is touched (in particular seed ticket #11, which no test may
// resolve). Seeded staff accounts are signed in as, never altered.

const prisma = getPrisma();

const WICHAI = "wichai.pra@kmutt.ac.th"; // IT Staff
const ARISA = "arisa.kon@kmutt.ac.th"; // IT Staff

const REQUESTER_A = "zz.wf.a@example.test";
const MARKER = "[wf-70]";

const TICKET_CREATED = new Date("2026-10-01T00:00:00.000Z");
const PAST = "2026-10-15T03:15:00.000Z";
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const ids = { wichai: "", arisa: "", a: "" };
let categoryId = 0;
let relatedSystemId = 0;
let ticketCounter = 0;

let staff: SignedIn;
let arisa: SignedIn;
let requester: SignedIn;

const errorBody = (code: string) => ({ error: { code, message: expect.any(String) } });

// ---------------------------------------------------------------------------
// Helpers

const base = (ticketId: string) => `/api/v1/staff/tickets/${ticketId}`;

async function makeTicket(status: TicketStatus = "OPEN", owner: string | null = ids.wichai) {
  ticketCounter += 1;
  return prisma.ticket.create({
    data: {
      ticketNumber: `TKT-2026-92${String(ticketCounter).padStart(3, "0")}`,
      requesterId: ids.a,
      ownerId: owner,
      categoryId,
      relatedSystemId,
      summary: `${MARKER} ticket ${ticketCounter}`,
      description: "A description long enough to satisfy the twenty character minimum.",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: status,
      createdAt: TICKET_CREATED,
      updatedAt: TICKET_CREATED,
    },
  });
}

const ticketOf = (id: string) => prisma.ticket.findUniqueOrThrow({ where: { id } });
const versionOf = async (id: string) => (await ticketOf(id)).version;
const eventsOf = (ticketId: string) =>
  prisma.ticketEvent.findMany({ where: { ticketId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });

/** POST /status with the ticket's current version unless one is given. */
async function setStatus(who: SignedIn, ticketId: string, body: Record<string, unknown>) {
  const version = "version" in body ? body.version : await versionOf(ticketId);
  return who.agent.post(`${base(ticketId)}/status`).send({ ...body, version });
}

const createAction = (who: SignedIn, ticketId: string, overrides: Record<string, unknown> = {}) =>
  who.agent
    .post(`${base(ticketId)}/actions`)
    .send({ clientRequestId: randomUUID(), actionAt: PAST, description: "Checked the printer queue.", ...overrides });

async function completeAction(actionId: string, extra: Record<string, unknown> = {}) {
  const { version } = await prisma.actionTaken.findUniqueOrThrow({ where: { id: actionId } });
  const res = await staff.agent
    .patch(`/api/v1/staff/actions/${actionId}`)
    .send({ version, status: "COMPLETED", result: "Done.", ...extra });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res;
}

async function clearOwnTickets() {
  const where = { summary: { contains: MARKER } };
  await prisma.actionTaken.deleteMany({ where: { ticket: where } });
  await prisma.ticketEvent.deleteMany({ where: { ticket: where } });
  await prisma.publicComment.deleteMany({ where: { ticket: where } });
  await prisma.internalNote.deleteMany({ where: { ticket: where } });
  await prisma.ticket.deleteMany({ where });
}

// ---------------------------------------------------------------------------

beforeAll(async () => {
  const fields = await signInFields();
  const fixture = { fullName: "ZZ WF Requester A", role: "REQUESTER" as const, isActive: true, ...fields };
  await prisma.user.upsert({ where: { email: REQUESTER_A }, update: fixture, create: { email: REQUESTER_A, ...fixture } });

  const idOf = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  ids.wichai = await idOf(WICHAI);
  ids.arisa = await idOf(ARISA);
  ids.a = await idOf(REQUESTER_A);

  const category = await prisma.category.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
  const system = await prisma.relatedSystem.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
  categoryId = category!.id;
  relatedSystemId = system!.id;

  await clearOwnTickets();
  resetLoginThrottle();
  staff = await loginAs(WICHAI);
  arisa = await loginAs(ARISA);
  requester = await loginAs(REQUESTER_A);
});

beforeEach(() => {
  resetLoginThrottle();
});

afterAll(async () => {
  await clearOwnTickets();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------

describe("WF-01 an open action blocks resolution (AC-14, BR-20)", () => {
  it("refuses RESOLVED with RESOLUTION_BLOCKED, both counts in the message, status unchanged, no event", async () => {
    const ticket = await makeTicket("IN_PROGRESS");
    expect((await createAction(staff, ticket.id, { status: "IN_PROGRESS" })).status).toBe(201);
    const before = await ticketOf(ticket.id);
    const eventsBefore = await eventsOf(ticket.id);

    const res = await setStatus(staff, ticket.id, { status: "RESOLVED" });

    expect(res.status).toBe(409);
    expect(res.body).toEqual(errorBody("RESOLUTION_BLOCKED"));
    expect(res.body.error.message).toBe(
      "This ticket cannot be resolved yet: 1 action(s) still open and 0 follow-up(s) outstanding.",
    );
    const after = await ticketOf(ticket.id);
    expect(after.currentStatus).toBe("IN_PROGRESS");
    expect(after.version).toBe(before.version);
    expect(after.resolvedAt).toBeNull();
    expect(await eventsOf(ticket.id)).toEqual(eventsBefore);
  });
});

describe("WF-02 an outstanding follow-up blocks resolution until cleared (AC-14, BR-22)", () => {
  it("refuses with counts 0 and 1, then resolves once the follow-up is cleared", async () => {
    const ticket = await makeTicket("IN_PROGRESS");
    const created = await createAction(staff, ticket.id, {
      status: "COMPLETED",
      result: "Replaced the cable.",
      followUpRequired: true,
      followUpNote: "Check the connection again on Monday.",
    });
    expect(created.status).toBe(201);

    const blocked = await setStatus(staff, ticket.id, { status: "RESOLVED" });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("RESOLUTION_BLOCKED");
    expect(blocked.body.error.message).toBe(
      "This ticket cannot be resolved yet: 0 action(s) still open and 1 follow-up(s) outstanding.",
    );

    const cleared = await staff.agent
      .patch(`/api/v1/staff/actions/${created.body.data.id}`)
      .send({ version: 0, followUpRequired: false });
    expect(cleared.status).toBe(200);

    const resolved = await setStatus(staff, ticket.id, { status: "RESOLVED" });
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.currentStatus).toBe("RESOLVED");
  });
});

describe("WF-03 resolvable tickets (AC-15, BR-21, BR-25)", () => {
  it("resolves a ticket with no actions and sets resolvedAt within 2 seconds of now", async () => {
    const ticket = await makeTicket("OPEN");

    const res = await setStatus(staff, ticket.id, { status: "RESOLVED" });

    expect(res.status).toBe(200);
    expect(res.body.data.resolvedAt).toMatch(ISO);
    const stored = await ticketOf(ticket.id);
    expect(stored.currentStatus).toBe("RESOLVED");
    expect(Math.abs(stored.resolvedAt!.getTime() - Date.now())).toBeLessThan(2000);
  });

  it("resolves a ticket whose actions are all COMPLETED or CANCELLED with no follow-up", async () => {
    const ticket = await makeTicket("IN_PROGRESS");
    const done = await createAction(staff, ticket.id, { status: "COMPLETED", result: "Fixed." });
    const dropped = await createAction(staff, ticket.id);
    expect(done.status).toBe(201);
    const cancel = await staff.agent
      .patch(`/api/v1/staff/actions/${dropped.body.data.id}`)
      .send({ version: 0, status: "CANCELLED", result: "Not needed after the fix." });
    expect(cancel.status).toBe(200);

    const res = await setStatus(staff, ticket.id, { status: "RESOLVED" });

    expect(res.status).toBe(200);
    expect((await ticketOf(ticket.id)).resolvedAt).not.toBeNull();
  });
});

describe("WF-04 the final matrix through the API (AC-16, BR-24)", () => {
  // The 17 rows the status endpoint performs. NEW -> OPEN is the 18th, done by
  // claim (L3-BR-38).
  const permitted: [TicketStatus, TicketStatus][] = [
    ["NEW", "CANCELLED"],
    ["OPEN", "IN_PROGRESS"],
    ["OPEN", "RESOLVED"],
    ["OPEN", "CANCELLED"],
    ["IN_PROGRESS", "WAITING_FOR_REQUESTER"],
    ["IN_PROGRESS", "RESOLVED"],
    ["IN_PROGRESS", "CANCELLED"],
    ["WAITING_FOR_REQUESTER", "IN_PROGRESS"],
    ["WAITING_FOR_REQUESTER", "RESOLVED"],
    ["WAITING_FOR_REQUESTER", "CANCELLED"],
    ["REOPENED", "IN_PROGRESS"],
    ["REOPENED", "RESOLVED"],
    ["REOPENED", "CANCELLED"],
    ["RESOLVED", "CLOSED"],
    ["RESOLVED", "REOPENED"],
    ["CLOSED", "REOPENED"],
    ["CANCELLED", "REOPENED"],
  ];

  it.each(permitted)("%s -> %s succeeds with the current version, and increments it", async (from, to) => {
    const ticket = await makeTicket(from, from === "NEW" ? null : ids.wichai);
    const reason = to === "CANCELLED" || to === "REOPENED" ? "A reason long enough." : undefined;

    const res = await setStatus(staff, ticket.id, { status: to, ...(reason ? { reason } : {}) });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.currentStatus).toBe(to);
    expect(res.body.data.version).toBe(1);
  });

  it("performs NEW -> OPEN by claim, which takes no version but increments it (BR-32)", async () => {
    const ticket = await makeTicket("NEW", null);

    const res = await staff.agent.post(`${base(ticket.id)}/claim`).send({});

    expect(res.status).toBe(200);
    expect(res.body.data.currentStatus).toBe("OPEN");
    expect(res.body.data.version).toBe(1);
  });

  const refused: [TicketStatus, TicketStatus][] = [
    ["NEW", "RESOLVED"],
    ["OPEN", "CLOSED"],
    ["IN_PROGRESS", "OPEN"],
    ["RESOLVED", "IN_PROGRESS"],
    ["CLOSED", "RESOLVED"],
    ["CANCELLED", "OPEN"],
  ];

  it.each(refused)("%s -> %s is refused with INVALID_STATUS_TRANSITION and changes nothing", async (from, to) => {
    const ticket = await makeTicket(from, from === "NEW" ? null : ids.wichai);

    const res = await setStatus(staff, ticket.id, { status: to });

    expect(res.status).toBe(409);
    expect(res.body).toEqual(errorBody("INVALID_STATUS_TRANSITION"));
    const stored = await ticketOf(ticket.id);
    expect(stored.currentStatus).toBe(from);
    expect(stored.version).toBe(0);
  });
});

describe("WF-05 resolvedAt across CLOSED and REOPENED (AC-17, BR-25)", () => {
  it("keeps resolvedAt on RESOLVED -> CLOSED, then clears it on CLOSED -> REOPENED", async () => {
    const ticket = await makeTicket("OPEN");
    expect((await setStatus(staff, ticket.id, { status: "RESOLVED" })).status).toBe(200);
    const resolvedAt = (await ticketOf(ticket.id)).resolvedAt;
    expect(resolvedAt).not.toBeNull();

    const closed = await setStatus(staff, ticket.id, { status: "CLOSED" });
    expect(closed.status).toBe(200);
    expect((await ticketOf(ticket.id)).resolvedAt).toEqual(resolvedAt);
    expect(closed.body.data.resolvedAt).toBe(resolvedAt!.toISOString());

    const reopened = await setStatus(staff, ticket.id, { status: "REOPENED", reason: "It broke again today." });
    expect(reopened.status).toBe(200);
    expect((await ticketOf(ticket.id)).resolvedAt).toBeNull();
    expect(reopened.body.data.resolvedAt).toBeNull();
  });
});

describe("WF-06 stale ticket versions (AC-18, BR-28)", () => {
  it("refuses the second of two status changes sent with the same version", async () => {
    const ticket = await makeTicket("OPEN");

    const first = await setStatus(staff, ticket.id, { status: "IN_PROGRESS", version: 0 });
    const second = await setStatus(arisa, ticket.id, { status: "CANCELLED", reason: "Raised twice.", version: 0 });

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(second.body).toEqual(errorBody("STALE_UPDATE"));
    const stored = await ticketOf(ticket.id);
    expect(stored.currentStatus).toBe("IN_PROGRESS");
    expect(stored.version).toBe(1);
  });

  it("refuses the second of two owner changes sent with the same version", async () => {
    const ticket = await makeTicket("OPEN");

    const first = await staff.agent.put(`${base(ticket.id)}/owner`).send({ ownerId: ids.arisa, version: 0 });
    const second = await arisa.agent.put(`${base(ticket.id)}/owner`).send({ ownerId: ids.wichai, version: 0 });

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(second.body).toEqual(errorBody("STALE_UPDATE"));
    expect((await ticketOf(ticket.id)).ownerId).toBe(ids.arisa);
  });

  it("refuses the second of two IT Priority changes sent with the same version", async () => {
    const ticket = await makeTicket("OPEN");

    const first = await staff.agent.put(`${base(ticket.id)}/it-priority`).send({ itPriority: "HIGH", version: 0 });
    const second = await arisa.agent.put(`${base(ticket.id)}/it-priority`).send({ itPriority: "LOW", version: 0 });

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(second.body).toEqual(errorBody("STALE_UPDATE"));
    const stored = await ticketOf(ticket.id);
    expect(stored.itPriority).toBe("HIGH");
    expect(stored.version).toBe(1);
  });

  it("reports STALE_UPDATE before any domain rule (api-spec section 1.1)", async () => {
    const ticket = await makeTicket("OPEN");

    // OPEN -> CLOSED is not in the matrix, but the stale version wins.
    const res = await setStatus(staff, ticket.id, { status: "CLOSED", version: 4 });

    expect(res.status).toBe(409);
    expect(res.body).toEqual(errorBody("STALE_UPDATE"));
  });

  it("still needs the current version for a no-change owner or priority request, and writes nothing", async () => {
    const ticket = await makeTicket("OPEN");

    const sameOwner = await staff.agent.put(`${base(ticket.id)}/owner`).send({ ownerId: ids.wichai, version: 0 });
    const samePriority = await staff.agent.put(`${base(ticket.id)}/it-priority`).send({ itPriority: "MEDIUM", version: 0 });
    const staleNoChange = await staff.agent.put(`${base(ticket.id)}/owner`).send({ ownerId: ids.wichai, version: 3 });

    expect(sameOwner.status).toBe(200);
    expect(samePriority.status).toBe(200);
    expect(staleNoChange.status).toBe(409);
    expect((await ticketOf(ticket.id)).version).toBe(0);
    expect(await eventsOf(ticket.id)).toEqual([]);
  });
});

describe("WF-07 version is required (AC-18, api-spec section 3.2)", () => {
  const cases: [string, (ticketId: string) => Promise<{ status: number; body: any }>][] = [
    ["owner", (id) => staff.agent.put(`${base(id)}/owner`).send({ ownerId: ids.arisa })],
    ["it-priority", (id) => staff.agent.put(`${base(id)}/it-priority`).send({ itPriority: "HIGH" })],
    ["status", (id) => staff.agent.post(`${base(id)}/status`).send({ status: "IN_PROGRESS" })],
  ];

  it.each(cases)("refuses /%s without version with 422 details.version", async (_path, send) => {
    const ticket = await makeTicket("OPEN");

    const res = await send(ticket.id);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toHaveProperty("version");
    const stored = await ticketOf(ticket.id);
    expect(stored).toMatchObject({ ownerId: ids.wichai, itPriority: "MEDIUM", currentStatus: "OPEN", version: 0 });
  });

  it("refuses a non-integer version with 422 details.version", async () => {
    const ticket = await makeTicket("OPEN");
    const res = await setStatus(staff, ticket.id, { status: "IN_PROGRESS", version: "0" });

    expect(res.status).toBe(422);
    expect(res.body.error.details).toHaveProperty("version");
  });
});

describe("WF-08 resolve racing an action create (AC-19, BR-30)", () => {
  it("(a) resolve commits first: the later action create is refused with TICKET_STATE_CONFLICT", async () => {
    const ticket = await makeTicket("IN_PROGRESS");

    const resolve = await setStatus(staff, ticket.id, { status: "RESOLVED", version: 0 });
    const create = await createAction(arisa, ticket.id);

    expect(resolve.status).toBe(200);
    expect(create.status).toBe(409);
    expect(create.body).toEqual(errorBody("TICKET_STATE_CONFLICT"));
    expect(await prisma.actionTaken.count({ where: { ticketId: ticket.id } })).toBe(0);
  });

  it("(b) action create commits first: the resolve sent with the old version is refused with STALE_UPDATE", async () => {
    const ticket = await makeTicket("IN_PROGRESS");

    const create = await createAction(arisa, ticket.id);
    const resolve = await setStatus(staff, ticket.id, { status: "RESOLVED", version: 0 });

    expect(create.status).toBe(201);
    expect(resolve.status).toBe(409);
    expect(resolve.body).toEqual(errorBody("STALE_UPDATE"));
    expect((await ticketOf(ticket.id)).currentStatus).toBe("IN_PROGRESS");
  });

  // Which request commits first depends on scheduling, so the concurrent
  // rounds assert only the invariant, never the order.
  it("never leaves a ticket RESOLVED with an open action when both are fired together, 20 rounds", async () => {
    for (let round = 0; round < 20; round++) {
      const ticket = await makeTicket("IN_PROGRESS");

      await Promise.all([
        setStatus(staff, ticket.id, { status: "RESOLVED", version: 0 }),
        createAction(arisa, ticket.id),
      ]);

      const stored = await ticketOf(ticket.id);
      const open = await prisma.actionTaken.count({
        where: { ticketId: ticket.id, status: { in: ["PLANNED", "IN_PROGRESS"] } },
      });
      expect(stored.currentStatus === "RESOLVED" && open > 0, `round ${round}: resolved with an open action`).toBe(false);
    }
  }, 120_000);
});

describe("WF-09 the Requester's indication is advisory (AC-22, BR-23, BR-32)", () => {
  it("leaves the status unchanged, increments the version, and does not open the gate", async () => {
    const ticket = await makeTicket("IN_PROGRESS");
    expect((await createAction(staff, ticket.id)).status).toBe(201);
    const before = await ticketOf(ticket.id);

    const indicated = await requester.agent.post(`/api/v1/tickets/${ticket.id}/appears-resolved`).send({});
    expect(indicated.status).toBe(200);
    const after = await ticketOf(ticket.id);
    expect(after.currentStatus).toBe("IN_PROGRESS");
    expect(after.version).toBe(before.version + 1);

    const resolve = await setStatus(staff, ticket.id, { status: "RESOLVED" });
    expect(resolve.status).toBe(409);
    expect(resolve.body.error.code).toBe("RESOLUTION_BLOCKED");
  });
});

describe("WF-10 ticket history (AC-23, BR-34)", () => {
  it("lists events oldest first with actor, payload, and a users map; refuses a Requester with 403", async () => {
    const ticket = await makeTicket("NEW", null);
    expect((await staff.agent.post(`${base(ticket.id)}/claim`).send({})).status).toBe(200);
    const created = await createAction(staff, ticket.id, { performedById: ids.arisa });
    expect(created.status).toBe(201);
    await completeAction(created.body.data.id);
    expect((await setStatus(staff, ticket.id, { status: "RESOLVED" })).status).toBe(200);

    const res = await staff.agent.get(`${base(ticket.id)}/history`);

    expect(res.status).toBe(200);
    const events = res.body.data as { id: string; eventType: string; actor: unknown; payload: unknown; createdAt: string }[];
    // Claim writes its two events in one transaction, so they share createdAt
    // and are ordered by id; only their pair is fixed.
    expect(events.slice(0, 2).map((e) => e.eventType).sort()).toEqual(["OWNER_CHANGED", "STATUS_CHANGED"]);
    expect(events.slice(2).map((e) => e.eventType)).toEqual([
      "ACTION_CREATED",
      "ACTION_UPDATED",
      "STATUS_CHANGED",
    ]);
    const stored = await eventsOf(ticket.id);
    expect(events.map((e) => e.id)).toEqual(stored.map((e) => e.id));
    for (const event of events) {
      expect(Object.keys(event).sort()).toEqual(["actor", "createdAt", "eventType", "id", "payload"]);
      expect(event.actor).toEqual({ id: ids.wichai, fullName: "Wichai Prasert" });
      expect(event.createdAt).toMatch(ISO);
    }
    expect(events.find((e) => e.eventType === "OWNER_CHANGED")!.payload).toEqual({ fromOwnerId: null, toOwnerId: ids.wichai, cause: "CLAIM" });
    expect(events[2].payload).toEqual({ actionId: created.body.data.id, status: "PLANNED", performedById: ids.arisa });
    expect(events[4].payload).toEqual({ from: "OPEN", to: "RESOLVED" });
    expect(res.body.users).toEqual({ [ids.wichai]: "Wichai Prasert", [ids.arisa]: "Arisa Kongkaew" });

    const refused = await requester.agent.get(`${base(ticket.id)}/history`);
    expect(refused.status).toBe(403);
  });

  it("orders events with the same createdAt by id", async () => {
    const ticket = await makeTicket("OPEN");
    const at = new Date("2026-10-02T00:00:00.000Z");
    const idsInOrder = [randomUUID(), randomUUID(), randomUUID()].sort();
    for (const id of [...idsInOrder].reverse()) {
      await prisma.ticketEvent.create({
        data: { id, ticketId: ticket.id, actorId: ids.wichai, eventType: "IT_PRIORITY_CHANGED", payload: { from: "LOW", to: "HIGH" }, createdAt: at },
      });
    }

    const res = await staff.agent.get(`${base(ticket.id)}/history`);

    expect(res.body.data.map((e: { id: string }) => e.id)).toEqual(idsInOrder);
  });

  it("returns 404 for an unknown ticket and 400 for a malformed id", async () => {
    expect((await staff.agent.get(`${base(randomUUID())}/history`)).status).toBe(404);
    expect((await staff.agent.get(`${base("not-a-uuid")}/history`)).status).toBe(400);
  });
});

describe("WF-11 what moves updatedAt (AC-13, AC-24, BR-33, Amendment 4)", () => {
  it("advances updatedAt for a Public Comment but not for an Internal Note; neither changes version", async () => {
    const ticket = await makeTicket("OPEN");

    const comment = await requester.agent.post(`/api/v1/tickets/${ticket.id}/comments`).send({ body: "Any news?" });
    expect(comment.status).toBe(201);
    const afterComment = await ticketOf(ticket.id);
    expect(afterComment.updatedAt.getTime()).toBeGreaterThan(TICKET_CREATED.getTime());
    expect(afterComment.version).toBe(0);

    const note = await staff.agent.post(`/api/v1/tickets/${ticket.id}/notes`).send({ body: "Waiting on the vendor." });
    expect(note.status).toBe(201);
    const afterNote = await ticketOf(ticket.id);
    expect(afterNote.updatedAt).toEqual(afterComment.updatedAt);
    expect(afterNote.version).toBe(0);
  });
});

describe("WF-12 staff detail additions (AC-22, api-spec section 3.1)", () => {
  it("reports version, resolvedAt, actionSummary, and resolutionBlockers for a blocked ticket", async () => {
    const ticket = await makeTicket("IN_PROGRESS");
    expect((await createAction(staff, ticket.id, { status: "IN_PROGRESS" })).status).toBe(201);
    expect((await createAction(staff, ticket.id, { status: "COMPLETED", result: "Done.", followUpRequired: true, followUpNote: "Call back on Friday." })).status).toBe(201);
    const third = await createAction(staff, ticket.id);
    await staff.agent.patch(`/api/v1/staff/actions/${third.body.data.id}`).send({ version: 0, status: "CANCELLED", result: "Not needed." });

    const res = await staff.agent.get(base(ticket.id));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      version: await versionOf(ticket.id),
      resolvedAt: null,
      actionSummary: { total: 3, open: 1, outstandingFollowUps: 1 },
      resolutionBlockers: { openActions: 1, outstandingFollowUps: 1 },
    });
    expect(res.body.data.availableTransitions).toContain("RESOLVED");
  });

  it("reports resolutionBlockers null for an unblocked ticket, with RESOLVED still available", async () => {
    const ticket = await makeTicket("OPEN");

    const res = await staff.agent.get(base(ticket.id));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      version: 0,
      resolvedAt: null,
      actionSummary: { total: 0, open: 0, outstandingFollowUps: 0 },
      resolutionBlockers: null,
    });
    expect(res.body.data.availableTransitions).toContain("RESOLVED");
  });
});
