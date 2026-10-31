import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { TicketStatus } from "@prisma/client";
import { getPrisma } from "../../src/prisma.js";
import { resetLoginThrottle } from "../../src/lab-03/login-throttle.js";
import { loginAs, signInFields, type SignedIn } from "../helpers/session.js";

// ACT-01 to ACT-17 from docs/lab-04/tests.md section 2.3 (AC-01 to AC-13,
// AC-18, AC-20). api-spec.md sections 1 and 2, with Amendments 1 and 3, are
// the contract.
//
// Every ticket here is created by this suite for its own two Requesters, so no
// seeded ticket or action is touched. Seeded staff accounts are signed in as,
// never altered. Actions, tickets, and events are read back through Prisma.

const prisma = getPrisma();

const WICHAI = "wichai.pra@kmutt.ac.th"; // IT Staff
const ARISA = "arisa.kon@kmutt.ac.th"; // IT Staff
const TEERAPAT = "teerapat.boo@kmutt.ac.th"; // IT Staff
const NATTAPONG = "nattapong.sae@kmutt.ac.th"; // inactive IT Staff
const ADMIN = "sasithorn.pho@kmutt.ac.th"; // Administrator

const REQUESTER_A = "zz.act.a@example.test";
const REQUESTER_B = "zz.act.b@example.test";
const MARKER = "[act-70]";

/** Test tickets are created in the past, so past action times are valid (BR-05). */
const TICKET_CREATED = new Date("2026-10-01T00:00:00.000Z");
const PAST = "2026-10-15T03:15:00.000Z";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const chars = (n: number) => "x".repeat(n);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const ids = { wichai: "", arisa: "", teerapat: "", nattapong: "", admin: "", a: "", b: "" };
let categoryId = 0;
let relatedSystemId = 0;
let ticketCounter = 0;

let staff: SignedIn;
let admin: SignedIn;
let requesterA: SignedIn;
let requesterB: SignedIn;

const errorBody = (code: string) => ({ error: { code, message: expect.any(String) } });
const invalid = (...fields: string[]) => ({
  error: {
    code: "VALIDATION_ERROR",
    message: expect.any(String),
    details: expect.objectContaining(Object.fromEntries(fields.map((f) => [f, expect.any(String)]))),
  },
});

// ---------------------------------------------------------------------------
// Helpers

const listUrl = (ticketId: string) => `/api/v1/tickets/${ticketId}/actions`;
const createUrl = (ticketId: string) => `/api/v1/staff/tickets/${ticketId}/actions`;
const patchUrl = (actionId: string) => `/api/v1/staff/actions/${actionId}`;

const validBody = (overrides: Record<string, unknown> = {}) => ({
  clientRequestId: randomUUID(),
  actionAt: PAST,
  description: "Replaced the toner cartridge in the printer.",
  ...overrides,
});

const create = (who: SignedIn, ticketId: string, overrides: Record<string, unknown> = {}) =>
  who.agent.post(createUrl(ticketId)).send(validBody(overrides));
const patch = (who: SignedIn, actionId: string, body: Record<string, unknown>) =>
  who.agent.patch(patchUrl(actionId)).send(body);

async function makeTicket(status: TicketStatus = "OPEN", requesterId = ids.a) {
  ticketCounter += 1;
  return prisma.ticket.create({
    data: {
      ticketNumber: `TKT-2026-93${String(ticketCounter).padStart(3, "0")}`,
      requesterId,
      ownerId: status === "NEW" ? null : ids.wichai,
      categoryId,
      relatedSystemId,
      summary: `${MARKER} ticket ${ticketCounter}`,
      description: "A description long enough to satisfy the twenty character minimum.",
      requestedPriority: "MEDIUM",
      itPriority: "HIGH",
      currentStatus: status,
      createdAt: TICKET_CREATED,
      // In the past, so "updatedAt advanced" (ACT-13) cannot tie within a millisecond.
      updatedAt: TICKET_CREATED,
    },
  });
}

/** Creates an action through the API and returns the stored row. */
async function makeAction(ticketId: string, overrides: Record<string, unknown> = {}) {
  const res = await create(staff, ticketId, overrides);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return prisma.actionTaken.findUniqueOrThrow({ where: { id: res.body.data.id } });
}

const ticketOf = (id: string) => prisma.ticket.findUniqueOrThrow({ where: { id } });
const actionOf = (id: string) => prisma.actionTaken.findUniqueOrThrow({ where: { id } });
const actionsOn = (ticketId: string) => prisma.actionTaken.findMany({ where: { ticketId } });
const actionEvents = (ticketId: string) =>
  prisma.ticketEvent.findMany({
    where: { ticketId, eventType: { in: ["ACTION_CREATED", "ACTION_UPDATED"] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

async function clearOwnTickets() {
  const where = { summary: { contains: MARKER } };
  await prisma.actionTaken.deleteMany({ where: { ticket: where } });
  await prisma.ticketEvent.deleteMany({ where: { ticket: where } });
  await prisma.ticket.deleteMany({ where });
}

// ---------------------------------------------------------------------------

beforeAll(async () => {
  const fields = await signInFields();
  for (const [email, fullName] of [
    [REQUESTER_A, "ZZ ACT Requester A"],
    [REQUESTER_B, "ZZ ACT Requester B"],
  ]) {
    const fixture = { fullName, role: "REQUESTER" as const, isActive: true, ...fields };
    await prisma.user.upsert({ where: { email }, update: fixture, create: { email, ...fixture } });
  }
  const idOf = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  ids.wichai = await idOf(WICHAI);
  ids.arisa = await idOf(ARISA);
  ids.teerapat = await idOf(TEERAPAT);
  ids.nattapong = await idOf(NATTAPONG);
  ids.admin = await idOf(ADMIN);
  ids.a = await idOf(REQUESTER_A);
  ids.b = await idOf(REQUESTER_B);

  const category = await prisma.category.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
  const system = await prisma.relatedSystem.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
  categoryId = category!.id;
  relatedSystemId = system!.id;

  await clearOwnTickets();
  resetLoginThrottle();
  staff = await loginAs(WICHAI);
  admin = await loginAs(ADMIN);
  requesterA = await loginAs(REQUESTER_A);
  requesterB = await loginAs(REQUESTER_B);
});

beforeEach(() => {
  resetLoginThrottle();
});

afterAll(async () => {
  await clearOwnTickets();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------

describe("ACT-01 create a valid action (AC-01)", () => {
  it("returns 201 with the action saved under the path ticket, createdBy the caller, performedBy as requested", async () => {
    const ticket = await makeTicket();
    const body = validBody({
      status: "COMPLETED",
      result: "Pages print correctly again.",
      performedById: ids.arisa,
      followUpRequired: true,
      followUpNote: "Check the toner level next week.",
      attachmentNotes: "See the photo of the test page.",
    });

    const res = await staff.agent.post(createUrl(ticket.id)).send(body);

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      id: expect.any(String),
      ticketId: ticket.id,
      actionAt: PAST,
      description: body.description,
      result: "Pages print correctly again.",
      status: "COMPLETED",
      performedBy: { id: ids.arisa, fullName: "Arisa Kongkaew", isActive: true },
      createdBy: { id: ids.wichai, fullName: "Wichai Prasert", isActive: true },
      followUpRequired: true,
      followUpNote: "Check the toner level next week.",
      attachmentNotes: "See the photo of the test page.",
      version: 0,
      createdAt: expect.stringMatching(ISO),
      updatedAt: expect.stringMatching(ISO),
    });
    expect(res.body.ticketVersion).toBe(1);

    const stored = await actionOf(res.body.data.id);
    expect(stored).toMatchObject({
      ticketId: ticket.id,
      createdById: ids.wichai,
      performedById: ids.arisa,
      clientRequestId: body.clientRequestId,
    });
  });
});

describe("ACT-02 performer default and another performer (AC-02)", () => {
  it("defaults the performer to the caller", async () => {
    const ticket = await makeTicket();
    const res = await create(staff, ticket.id);

    expect(res.status).toBe(201);
    expect(res.body.data.performedBy.id).toBe(ids.wichai);
  });

  it("accepts another IT Staff performer and leaves the ticket owner unchanged (BR-02)", async () => {
    const ticket = await makeTicket();
    const res = await create(staff, ticket.id, { performedById: ids.teerapat });

    expect(res.status).toBe(201);
    expect(res.body.data.performedBy.id).toBe(ids.teerapat);
    expect((await ticketOf(ticket.id)).ownerId).toBe(ids.wichai);
  });
});

describe("ACT-03 ineligible performer (AC-03)", () => {
  const ineligible = () => [
    ["an inactive IT Staff user", ids.nattapong],
    ["a Requester", ids.a],
    ["an unknown UUID", "0b0b0b0b-0000-4000-8000-000000000000"],
    ["a malformed id", "not-a-uuid"],
  ];

  it("refuses each on create with 422 details.performedById, and saves nothing", async () => {
    const ticket = await makeTicket();
    for (const [label, performedById] of ineligible()) {
      const res = await create(staff, ticket.id, { performedById });
      expect(res.status, label).toBe(422);
      expect(res.body, label).toEqual(invalid("performedById"));
    }
    expect(await actionsOn(ticket.id)).toEqual([]);
  });

  it("refuses each on PATCH with 422 details.performedById, and changes nothing", async () => {
    const ticket = await makeTicket();
    const action = await makeAction(ticket.id);
    for (const [label, performedById] of ineligible()) {
      const res = await patch(staff, action.id, { version: 0, performedById });
      expect(res.status, label).toBe(422);
      expect(res.body, label).toEqual(invalid("performedById"));
    }
    expect(await actionOf(action.id)).toEqual(action);
  });

  it("uses the message from api-spec section 2.2", async () => {
    const ticket = await makeTicket();
    const res = await create(staff, ticket.id, { performedById: ids.nattapong });
    expect(res.body.error.details.performedById).toBe("Choose an active IT Staff or Administrator user.");
  });
});

describe("ACT-04 server-set fields (AC-04, BR-03)", () => {
  it("ignores a client createdById, createdAt, id, and version", async () => {
    const ticket = await makeTicket();
    const suppliedId = randomUUID();
    const before = Date.now();

    const res = await create(staff, ticket.id, {
      id: suppliedId,
      createdById: ids.arisa,
      createdAt: "2020-01-01T00:00:00.000Z",
      version: 5,
    });

    expect(res.status).toBe(201);
    const stored = await actionOf(res.body.data.id);
    expect(stored.id).not.toBe(suppliedId);
    expect(stored.createdById).toBe(ids.wichai);
    expect(stored.version).toBe(0);
    expect(stored.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe("ACT-05 field boundaries through the API (AC-05)", () => {
  const now = () => Date.now();
  const cases: [string, () => Record<string, unknown>, number, string?][] = [
    ["description of 4", () => ({ description: chars(4) }), 422, "description"],
    ["description of 5", () => ({ description: chars(5) }), 201],
    ["description of 2000", () => ({ description: chars(2000) }), 201],
    ["description of 2001", () => ({ description: chars(2001) }), 422, "description"],
    ["follow-up with no note", () => ({ followUpRequired: true }), 422, "followUpNote"],
    ["follow-up note of 4", () => ({ followUpRequired: true, followUpNote: chars(4) }), 422, "followUpNote"],
    ["follow-up note of 1000", () => ({ followUpRequired: true, followUpNote: chars(1000) }), 201],
    ["follow-up note of 1001", () => ({ followUpRequired: true, followUpNote: chars(1001) }), 422, "followUpNote"],
    ["attachment notes of 500", () => ({ attachmentNotes: chars(500) }), 201],
    ["attachment notes of 501", () => ({ attachmentNotes: chars(501) }), 422, "attachmentNotes"],
    ["actionAt before the ticket", () => ({ actionAt: new Date(TICKET_CREATED.getTime() - MINUTE).toISOString() }), 422, "actionAt"],
    ["actionAt at the ticket's creation", () => ({ actionAt: TICKET_CREATED.toISOString() }), 201],
    ["actionAt now + 30 days - 1 minute", () => ({ actionAt: new Date(now() + 30 * DAY - MINUTE).toISOString() }), 201],
    ["actionAt now + 30 days + 1 minute", () => ({ actionAt: new Date(now() + 30 * DAY + MINUTE).toISOString() }), 422, "actionAt"],
    ["actionAt without an offset", () => ({ actionAt: "2026-10-15T10:15:00" }), 422, "actionAt"],
    ["a missing clientRequestId", () => ({ clientRequestId: undefined }), 422, "clientRequestId"],
    ["a malformed clientRequestId", () => ({ clientRequestId: "abc" }), 422, "clientRequestId"],
  ];

  it.each(cases)("%s gives %i", async (_label, overrides, status, field) => {
    const ticket = await makeTicket();
    const res = await create(staff, ticket.id, overrides());

    expect(res.status, JSON.stringify(res.body)).toBe(status);
    if (field) {
      expect(res.body).toEqual(invalid(field));
      expect(await actionsOn(ticket.id)).toEqual([]);
    }
  });

  it("stores a follow-up note as null when no follow-up is required (BR-09)", async () => {
    const ticket = await makeTicket();
    const res = await create(staff, ticket.id, { followUpRequired: false, followUpNote: "Ignored note text." });

    expect(res.status).toBe(201);
    expect(res.body.data.followUpNote).toBeNull();
  });
});

describe("ACT-06 result and completion time (AC-06)", () => {
  it("refuses creating a COMPLETED action without a result", async () => {
    const ticket = await makeTicket();
    const res = await create(staff, ticket.id, { status: "COMPLETED" });

    expect(res.status).toBe(422);
    expect(res.body).toEqual(invalid("result"));
    expect(res.body.error.details.result).toBe("Record the result before completing this action.");
  });

  it("refuses a PATCH to CANCELLED when no result is stored or sent", async () => {
    const ticket = await makeTicket();
    const action = await makeAction(ticket.id);

    const res = await patch(staff, action.id, { version: 0, status: "CANCELLED" });

    expect(res.status).toBe(422);
    expect(res.body).toEqual(invalid("result"));
    expect(res.body.error.details.result).toBe("Say why this action is being cancelled.");
    expect(await actionOf(action.id)).toEqual(action);
  });

  it("refuses a COMPLETED action dated now + 10 minutes", async () => {
    const ticket = await makeTicket();
    const res = await create(staff, ticket.id, {
      status: "COMPLETED",
      result: "Done.",
      actionAt: new Date(Date.now() + 10 * MINUTE).toISOString(),
    });

    expect(res.status).toBe(422);
    expect(res.body).toEqual(invalid("actionAt"));
    expect(res.body.error.details.actionAt).toBe("A completed action cannot be dated in the future.");
  });
});

describe("ACT-07 action transitions (AC-07, BR-14, BR-15)", () => {
  const permitted: [string, string][] = [
    ["PLANNED", "IN_PROGRESS"],
    ["PLANNED", "COMPLETED"],
    ["PLANNED", "CANCELLED"],
    ["IN_PROGRESS", "COMPLETED"],
    ["IN_PROGRESS", "CANCELLED"],
  ];

  it.each(permitted)("%s -> %s succeeds", async (from, to) => {
    const ticket = await makeTicket();
    const action = await makeAction(ticket.id, { status: from });

    const res = await patch(staff, action.id, { version: 0, status: to, result: "Recorded outcome." });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.status).toBe(to);
    expect((await actionOf(action.id)).status).toBe(to);
  });

  it("refuses COMPLETED -> IN_PROGRESS with INVALID_ACTION_TRANSITION and changes nothing", async () => {
    const ticket = await makeTicket();
    const action = await makeAction(ticket.id, { status: "COMPLETED", result: "Done." });

    const res = await patch(staff, action.id, { version: 0, status: "IN_PROGRESS" });

    expect(res.status).toBe(409);
    expect(res.body).toEqual(errorBody("INVALID_ACTION_TRANSITION"));
    expect(res.body.error.message).toBe("This action cannot move from Completed to In Progress.");
    expect(await actionOf(action.id)).toEqual(action);
  });

  it("refuses CANCELLED -> PLANNED with INVALID_ACTION_TRANSITION and changes nothing", async () => {
    const ticket = await makeTicket();
    const action = await makeAction(ticket.id);
    const cancelled = await patch(staff, action.id, { version: 0, status: "CANCELLED", result: "Not needed." });
    expect(cancelled.status).toBe(200);
    const stored = await actionOf(action.id);

    const res = await patch(staff, action.id, { version: stored.version, status: "PLANNED" });

    expect(res.status).toBe(409);
    expect(res.body).toEqual(errorBody("INVALID_ACTION_TRANSITION"));
    expect(await actionOf(action.id)).toEqual(stored);
  });

  it("refuses creating an action as CANCELLED with 422 details.status", async () => {
    const ticket = await makeTicket();
    const res = await create(staff, ticket.id, { status: "CANCELLED", result: "Never started." });

    expect(res.status).toBe(422);
    expect(res.body).toEqual(invalid("status"));
    expect(await actionsOn(ticket.id)).toEqual([]);
  });
});

describe("ACT-08 edit policy on terminal actions (AC-08, BR-16)", () => {
  it("refuses a performer change on a COMPLETED action with ACTION_STATE_CONFLICT", async () => {
    const ticket = await makeTicket();
    const action = await makeAction(ticket.id, { status: "COMPLETED", result: "Done." });

    const res = await patch(staff, action.id, { version: 0, performedById: ids.arisa });

    expect(res.status).toBe(409);
    expect(res.body).toEqual(errorBody("ACTION_STATE_CONFLICT"));
    expect(res.body.error.message).toBe("This action is Completed and can no longer be changed in that way.");
    expect(await actionOf(action.id)).toEqual(action);
  });

  it("allows editing the result of a COMPLETED action", async () => {
    const ticket = await makeTicket();
    const action = await makeAction(ticket.id, { status: "COMPLETED", result: "Done." });

    const res = await patch(staff, action.id, { version: 0, result: "Done, and confirmed by the requester." });

    expect(res.status).toBe(200);
    expect((await actionOf(action.id)).result).toBe("Done, and confirmed by the requester.");
  });

  it("refuses editing the description of a CANCELLED action with ACTION_STATE_CONFLICT", async () => {
    const ticket = await makeTicket();
    const action = await makeAction(ticket.id);
    await patch(staff, action.id, { version: 0, status: "CANCELLED", result: "Not needed." });
    const stored = await actionOf(action.id);

    const res = await patch(staff, action.id, { version: stored.version, description: "A new description." });

    expect(res.status).toBe(409);
    expect(res.body).toEqual(errorBody("ACTION_STATE_CONFLICT"));
    expect(await actionOf(action.id)).toEqual(stored);
  });

  it("reports ACTION_STATE_CONFLICT before field rules on a CANCELLED action (Amendment 3)", async () => {
    const ticket = await makeTicket();
    const action = await makeAction(ticket.id);
    await patch(staff, action.id, { version: 0, status: "CANCELLED", result: "Not needed." });
    const stored = await actionOf(action.id);

    const res = await patch(staff, action.id, { version: stored.version, description: chars(4) });

    expect(res.status).toBe(409);
    expect(res.body).toEqual(errorBody("ACTION_STATE_CONFLICT"));
  });
});

describe("ACT-09 ticket states that refuse action writes (AC-09, BR-17)", () => {
  const refusing: TicketStatus[] = ["NEW", "RESOLVED", "CLOSED", "CANCELLED"];

  it.each(refusing)("refuses create on a %s ticket with TICKET_STATE_CONFLICT and saves nothing", async (status) => {
    const ticket = await makeTicket(status);

    const res = await create(staff, ticket.id);

    expect(res.status).toBe(409);
    expect(res.body).toEqual(errorBody("TICKET_STATE_CONFLICT"));
    expect(res.body.error.message).toBe(
      "Actions can only be recorded on an open ticket. Claim or reopen it first.",
    );
    expect(await actionsOn(ticket.id)).toEqual([]);
    expect((await ticketOf(ticket.id)).version).toBe(0);
  });

  it.each(refusing)("refuses PATCH on a %s ticket with TICKET_STATE_CONFLICT and changes nothing", async (status) => {
    const ticket = await makeTicket();
    const action = await makeAction(ticket.id);
    await prisma.ticket.update({ where: { id: ticket.id }, data: { currentStatus: status } });
    const before = await ticketOf(ticket.id);

    const res = await patch(staff, action.id, { version: 0, description: "An edit that must not land." });

    expect(res.status).toBe(409);
    expect(res.body).toEqual(errorBody("TICKET_STATE_CONFLICT"));
    expect(await actionOf(action.id)).toEqual(action);
    expect((await ticketOf(ticket.id)).version).toBe(before.version);
  });
});

describe("ACT-10 stable list order (AC-10, BR-19)", () => {
  it("lists three actions, two sharing actionAt, in the same BR-19 order twice", async () => {
    const ticket = await makeTicket();
    const shared = "2026-10-20T08:00:00.000Z";
    await makeAction(ticket.id, { actionAt: shared, description: "Second by time, first created." });
    await makeAction(ticket.id, { actionAt: "2026-10-10T08:00:00.000Z", description: "Earliest by time." });
    await makeAction(ticket.id, { actionAt: shared, description: "Second by time, created later." });

    const expected = (await actionsOn(ticket.id))
      .sort(
        (x, y) =>
          x.actionAt.getTime() - y.actionAt.getTime() ||
          x.createdAt.getTime() - y.createdAt.getTime() ||
          (x.id < y.id ? -1 : x.id > y.id ? 1 : 0),
      )
      .map((a) => a.id);

    const first = await staff.agent.get(listUrl(ticket.id));
    const second = await staff.agent.get(listUrl(ticket.id));

    expect(first.status).toBe(200);
    expect(first.body.data.map((a: { id: string }) => a.id)).toEqual(expected);
    expect(second.body.data.map((a: { id: string }) => a.id)).toEqual(expected);
    expect(first.body.data[0].description).toBe("Earliest by time.");
  });

  it("returns { data: [] } for a ticket with no actions", async () => {
    const ticket = await makeTicket();
    const res = await staff.agent.get(listUrl(ticket.id));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [] });
  });
});

describe("ACT-11 Requester access (AC-11)", () => {
  it("returns the full read-only list to the ticket's Requester", async () => {
    const ticket = await makeTicket("OPEN", ids.a);
    const action = await makeAction(ticket.id, { followUpRequired: true, followUpNote: "Check again on Monday." });

    const res = await requesterA.agent.get(listUrl(ticket.id));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(Object.keys(res.body.data[0]).sort()).toEqual(
      [
        "actionAt",
        "attachmentNotes",
        "createdAt",
        "createdBy",
        "description",
        "followUpNote",
        "followUpRequired",
        "id",
        "performedBy",
        "result",
        "status",
        "ticketId",
        "updatedAt",
        "version",
      ],
    );
    expect(res.body.data[0]).toMatchObject({ id: action.id, followUpNote: "Check again on Monday." });
  });

  it("returns 404 to another Requester", async () => {
    const ticket = await makeTicket("OPEN", ids.a);
    await makeAction(ticket.id);

    const res = await requesterB.agent.get(listUrl(ticket.id));

    expect(res.status).toBe(404);
    expect(res.body).toEqual(errorBody("NOT_FOUND"));
  });

  it("refuses a Requester's create and edit with 403, changing nothing", async () => {
    const ticket = await makeTicket("OPEN", ids.a);
    const action = await makeAction(ticket.id);

    const created = await create(requesterA, ticket.id);
    const edited = await patch(requesterA, action.id, { version: 0, description: "A Requester edit." });

    expect(created.status).toBe(403);
    expect(edited.status).toBe(403);
    expect(await actionsOn(ticket.id)).toHaveLength(1);
    expect(await actionOf(action.id)).toEqual(action);
  });
});

describe("ACT-12 plain text (AC-12, BR-11)", () => {
  it("stores and returns markup and line breaks byte-for-byte", async () => {
    const ticket = await makeTicket();
    const description = "<script>alert(1)</script>\nline 2";

    const res = await create(staff, ticket.id, { description });

    expect(res.status).toBe(201);
    expect(res.body.data.description).toBe(description);
    expect((await actionOf(res.body.data.id)).description).toBe(description);
    const listed = await staff.agent.get(listUrl(ticket.id));
    expect(listed.body.data[0].description).toBe(description);
  });
});

describe("ACT-13 events, versions, and updatedAt (AC-13, BR-33, BR-34)", () => {
  it("writes one ACTION_CREATED and one ACTION_UPDATED, and advances the ticket each time", async () => {
    const ticket = await makeTicket();
    const before = await ticketOf(ticket.id);

    const created = await create(staff, ticket.id, { performedById: ids.arisa });
    expect(created.status).toBe(201);
    const afterCreate = await ticketOf(ticket.id);

    const edited = await patch(staff, created.body.data.id, {
      version: 0,
      status: "COMPLETED",
      result: "The printer prints correctly.",
    });
    expect(edited.status).toBe(200);
    const afterEdit = await ticketOf(ticket.id);

    const events = await actionEvents(ticket.id);
    expect(events.map((e) => e.eventType)).toEqual(["ACTION_CREATED", "ACTION_UPDATED"]);
    expect(events[0]).toMatchObject({
      actorId: ids.wichai,
      payload: { actionId: created.body.data.id, status: "PLANNED", performedById: ids.arisa },
    });
    expect(events[1]).toMatchObject({
      actorId: ids.wichai,
      payload: {
        actionId: created.body.data.id,
        changes: { status: { from: "PLANNED", to: "COMPLETED" }, result: { changed: true } },
      },
    });
    expect(Object.keys((events[1].payload as { changes: object }).changes).sort()).toEqual(["result", "status"]);

    expect(afterCreate.version).toBe(before.version + 1);
    expect(afterEdit.version).toBe(before.version + 2);
    expect(created.body.ticketVersion).toBe(afterCreate.version);
    expect(edited.body.ticketVersion).toBe(afterEdit.version);
    expect(afterCreate.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    expect(afterEdit.updatedAt.getTime()).toBeGreaterThanOrEqual(afterCreate.updatedAt.getTime());
    expect((await actionOf(created.body.data.id)).version).toBe(1);
  });

  it("records performer and follow-up as { from, to } and text as { changed: true } only", async () => {
    const ticket = await makeTicket();
    const action = await makeAction(ticket.id);

    const res = await patch(staff, action.id, {
      version: 0,
      performedById: ids.arisa,
      followUpRequired: true,
      followUpNote: "Call the requester on Friday.",
      description: "A clearer description of the work.",
      attachmentNotes: "See the second screenshot.",
    });
    expect(res.status).toBe(200);

    const events = await actionEvents(ticket.id);
    expect((events[1].payload as { changes: unknown }).changes).toEqual({
      performedById: { from: ids.wichai, to: ids.arisa },
      followUpRequired: { from: false, to: true },
      followUpNote: { changed: true },
      description: { changed: true },
      attachmentNotes: { changed: true },
    });
  });

  it("records actionAt as { from, to } ISO strings (Amendment 3)", async () => {
    const ticket = await makeTicket();
    const action = await makeAction(ticket.id);
    const moved = "2026-10-16T09:30:00.000Z";

    const res = await patch(staff, action.id, { version: 0, actionAt: moved });
    expect(res.status).toBe(200);

    const events = await actionEvents(ticket.id);
    expect((events[1].payload as { changes: unknown }).changes).toEqual({ actionAt: { from: PAST, to: moved } });
  });
});

describe("ACT-14 idempotent create (AC-20, BR-31)", () => {
  it("returns 201 then 200 with the same id for a repeat in sequence, with one row and one event", async () => {
    const ticket = await makeTicket();
    const body = validBody();

    const first = await staff.agent.post(createUrl(ticket.id)).send(body);
    const second = await staff.agent.post(createUrl(ticket.id)).send(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(await actionsOn(ticket.id)).toHaveLength(1);
    expect(await actionEvents(ticket.id)).toHaveLength(1);
    expect((await ticketOf(ticket.id)).version).toBe(1);
  });

  it("creates exactly one row when the same request is sent twice concurrently, 20 rounds", async () => {
    for (let round = 0; round < 20; round++) {
      const ticket = await makeTicket();
      const body = validBody();

      const results = await Promise.all([
        staff.agent.post(createUrl(ticket.id)).send(body),
        staff.agent.post(createUrl(ticket.id)).send(body),
      ]);

      expect(results.map((r) => r.status).sort(), `round ${round}`).toEqual([200, 201]);
      expect(results[0].body.data.id, `round ${round}`).toBe(results[1].body.data.id);
      expect(await actionsOn(ticket.id), `round ${round}`).toHaveLength(1);
      expect(await actionEvents(ticket.id), `round ${round}`).toHaveLength(1);
      expect((await ticketOf(ticket.id)).version, `round ${round}`).toBe(1);
    }
  }, 120_000);

  it("refuses the same clientRequestId on another ticket with 422", async () => {
    const ticket = await makeTicket();
    const other = await makeTicket();
    const body = validBody();
    expect((await staff.agent.post(createUrl(ticket.id)).send(body)).status).toBe(201);

    const res = await staff.agent.post(createUrl(other.id)).send(body);

    expect(res.status).toBe(422);
    expect(res.body).toEqual(invalid("clientRequestId"));
    expect(res.body.error.details.clientRequestId).toBe("This request id was already used.");
    expect(await actionsOn(other.id)).toEqual([]);
  });

  it("returns the original action to a retry after the ticket left the open statuses (Amendment 3)", async () => {
    const ticket = await makeTicket();
    const body = validBody();
    const first = await staff.agent.post(createUrl(ticket.id)).send(body);
    await prisma.ticket.update({ where: { id: ticket.id }, data: { currentStatus: "CLOSED" } });

    const retry = await staff.agent.post(createUrl(ticket.id)).send(body);

    expect(retry.status).toBe(200);
    expect(retry.body.data.id).toBe(first.body.data.id);
  });
});

describe("ACT-15 action version (AC-18, BR-29)", () => {
  it("accepts the first of two PATCHes with the same version and refuses the second with STALE_UPDATE", async () => {
    const ticket = await makeTicket();
    const action = await makeAction(ticket.id);

    const first = await patch(staff, action.id, { version: 0, description: "The first change." });
    const second = await patch(staff, action.id, { version: 0, description: "The second change." });

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(second.body).toEqual(errorBody("STALE_UPDATE"));
    expect(second.body.error.message).toBe(
      "This ticket was changed by someone else. Reload to see the latest version.",
    );
    const stored = await actionOf(action.id);
    expect(stored.description).toBe("The first change.");
    expect(stored.version).toBe(1);
  });

  it("lets exactly one of two concurrent PATCHes with the same version win, 20 rounds", async () => {
    for (let round = 0; round < 20; round++) {
      const ticket = await makeTicket();
      const action = await makeAction(ticket.id);

      const results = await Promise.all([
        patch(staff, action.id, { version: 0, description: "Change from tab one." }),
        patch(staff, action.id, { version: 0, description: "Change from tab two." }),
      ]);

      expect(results.map((r) => r.status).sort(), `round ${round}`).toEqual([200, 409]);
      expect((await actionOf(action.id)).version, `round ${round}`).toBe(1);
      expect(await actionEvents(ticket.id), `round ${round}`).toHaveLength(2);
    }
  }, 120_000);

  it("requires version, with 422 details.version", async () => {
    const ticket = await makeTicket();
    const action = await makeAction(ticket.id);

    const res = await patch(staff, action.id, { description: "No version sent." });

    expect(res.status).toBe(422);
    expect(res.body).toEqual(invalid("version"));
    expect(await actionOf(action.id)).toEqual(action);
  });

  it("reports STALE_UPDATE before field rules (Amendment 3)", async () => {
    const ticket = await makeTicket();
    const action = await makeAction(ticket.id);

    const res = await patch(staff, action.id, { version: 3, description: chars(4) });

    expect(res.status).toBe(409);
    expect(res.body).toEqual(errorBody("STALE_UPDATE"));
  });
});

describe("ACT-16 an edit that changes nothing (AC-13, Amendment 1)", () => {
  it("returns 200 with no event and no version change when every value, including status, is unchanged", async () => {
    const ticket = await makeTicket();
    const action = await makeAction(ticket.id, { status: "IN_PROGRESS", performedById: ids.arisa });
    const before = await ticketOf(ticket.id);

    const res = await patch(staff, action.id, {
      version: 0,
      status: "IN_PROGRESS",
      description: action.description,
      actionAt: action.actionAt.toISOString(),
      performedById: ids.arisa,
      followUpRequired: false,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.version).toBe(0);
    expect(await actionOf(action.id)).toEqual(action);
    expect(await actionEvents(ticket.id)).toHaveLength(1);
    const after = await ticketOf(ticket.id);
    expect(after.version).toBe(before.version);
    expect(after.updatedAt).toEqual(before.updatedAt);
  });
});

describe("ACT-17 Administrator (AC-01)", () => {
  it("creates and edits with the same results as IT Staff", async () => {
    const ticket = await makeTicket();

    const created = await create(admin, ticket.id, { performedById: ids.teerapat });
    expect(created.status).toBe(201);
    expect(created.body.data.createdBy.id).toBe(ids.admin);
    expect(created.body.data.performedBy.id).toBe(ids.teerapat);

    const edited = await patch(admin, created.body.data.id, { version: 0, status: "IN_PROGRESS" });
    expect(edited.status).toBe(200);
    expect(edited.body.data.status).toBe("IN_PROGRESS");

    const events = await actionEvents(ticket.id);
    expect(events.map((e) => [e.eventType, e.actorId])).toEqual([
      ["ACTION_CREATED", ids.admin],
      ["ACTION_UPDATED", ids.admin],
    ]);
  });

  it("can be named as the performer", async () => {
    const ticket = await makeTicket();
    const res = await create(staff, ticket.id, { performedById: ids.admin });

    expect(res.status).toBe(201);
    expect(res.body.data.performedBy.id).toBe(ids.admin);
  });
});
