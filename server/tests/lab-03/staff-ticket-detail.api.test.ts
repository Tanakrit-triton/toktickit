import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request, { type Test } from "supertest";
import type { Priority, TicketStatus } from "@prisma/client";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { resetLoginThrottle } from "../../src/lab-03/login-throttle.js";
import { CSRF_HEADER, loginAs, seedPassword, signInFields, type SignedIn } from "../helpers/session.js";

// OPS-01 to OPS-18 from docs/lab-03/tests.md section 2.6 (AC-27, AC-34 to
// AC-45). api-spec.md sections 5.2 to 5.7 and 8 are the contract.
//
// Every ticket here is created by this suite for its own Requester, so no
// seeded ticket is touched. Seeded staff accounts are signed in as and used as
// owners, never altered. Events have no API (BR-57), so they are read through
// Prisma after each operation (tests.md section 1, Lab 3 rules).

const prisma = getPrisma();

const WICHAI = "wichai.pra@kmutt.ac.th"; // IT Staff
const ARISA = "arisa.kon@kmutt.ac.th"; // IT Staff
const TEERAPAT = "teerapat.boo@kmutt.ac.th"; // IT Staff
const ADMIN = "sasithorn.pho@kmutt.ac.th"; // Administrator
const INACTIVE_STAFF = "nattapong.sae@kmutt.ac.th"; // IT Staff, inactive
const SEEDED_REQUESTER = "napat.cha@kmutt.ac.th"; // Requester, active

const REQUESTER = "zz.ops.requester@example.test";
const DEMOTED = "zz.ops.demoted@example.test";
const OWN_USERS = [REQUESTER, DEMOTED];

const MARKER = "[ops-40]";
const RANDOM_UUID = "3f8b0c22-0000-4000-8000-0000000000a7";
const REASON = "Duplicate of another ticket";
const OWNER_MESSAGE = "Choose an active IT Staff or Administrator user.";

const FORBIDDEN = { error: { code: "FORBIDDEN", message: expect.any(String) } };
const NOT_FOUND = { error: { code: "NOT_FOUND", message: expect.any(String) } };
const BAD_REQUEST = { error: { code: "BAD_REQUEST", message: expect.any(String) } };
const ALREADY_CLAIMED = { error: { code: "TICKET_ALREADY_CLAIMED", message: expect.any(String) } };
const STATE_CONFLICT = { error: { code: "TICKET_STATE_CONFLICT", message: expect.any(String) } };
const INVALID_TRANSITION = { error: { code: "INVALID_STATUS_TRANSITION", message: expect.any(String) } };
const OWNER_REQUIRED = { error: { code: "TICKET_OWNER_REQUIRED", message: expect.any(String) } };
const invalidField = (field: string, message: unknown = expect.any(String)) => ({
  error: { code: "VALIDATION_ERROR", message: expect.any(String), details: { [field]: message } },
});

const ids = {
  wichai: "",
  arisa: "",
  teerapat: "",
  admin: "",
  inactiveStaff: "",
  seededRequester: "",
  requester: "",
  demoted: "",
};
let categoryId = 0;
let relatedSystemId = 0;
let ticketCounter = 0;

// ---------------------------------------------------------------------------
// Helpers

const ticketUrl = (ticketId: string, op = "") => `/api/v1/staff/tickets/${ticketId}${op}`;

const claim = (who: SignedIn, ticketId: string) => who.agent.post(ticketUrl(ticketId, "/claim"));
const assign = (who: SignedIn, ticketId: string, ownerId: unknown) =>
  who.agent.put(ticketUrl(ticketId, "/owner")).send({ ownerId });
const setItPriority = (who: SignedIn, ticketId: string, itPriority: unknown) =>
  who.agent.put(ticketUrl(ticketId, "/it-priority")).send({ itPriority });
const changeStatus = (who: SignedIn, ticketId: string, body: Record<string, unknown>) =>
  who.agent.post(ticketUrl(ticketId, "/status")).send(body);

type TicketSetup = {
  status?: TicketStatus;
  ownerId?: string | null;
  requestedPriority?: Priority;
  itPriority?: Priority;
  indicatedResolved?: boolean;
};

async function makeTicket(setup: TicketSetup = {}) {
  ticketCounter += 1;
  const requestedPriority = setup.requestedPriority ?? "MEDIUM";
  return prisma.ticket.create({
    data: {
      ticketNumber: `TKT-2026-97${String(ticketCounter).padStart(3, "0")}`,
      requesterId: ids.requester,
      ownerId: setup.ownerId ?? null,
      categoryId,
      relatedSystemId,
      summary: `${MARKER} ticket ${ticketCounter}`,
      description: "A description long enough to satisfy the twenty character minimum.",
      requestedPriority,
      itPriority: setup.itPriority ?? requestedPriority,
      currentStatus: setup.status ?? "NEW",
      requesterIndicatedResolvedAt: setup.indicatedResolved ? new Date("2026-10-01T09:00:00Z") : null,
    },
  });
}

const reload = (ticketId: string) => prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
const eventsOf = (ticketId: string) =>
  prisma.ticketEvent.findMany({ where: { ticketId }, orderBy: { createdAt: "asc" } });

/** The ticket row and its events are exactly as they were. */
async function expectUnchanged(before: Awaited<ReturnType<typeof makeTicket>>) {
  const after = await reload(before.id);
  expect(after).toEqual(before);
  expect(await eventsOf(before.id)).toEqual([]);
}

async function clearOwnTickets() {
  const where = { OR: [{ requesterId: { in: [ids.requester, ids.demoted] } }, { summary: { contains: MARKER } }] };
  await prisma.ticketEvent.deleteMany({ where: { ticket: where } });
  await prisma.attachment.deleteMany({ where: { ticket: where } });
  await prisma.ticket.deleteMany({ where });
}

// ---------------------------------------------------------------------------

beforeAll(async () => {
  const fields = await signInFields();
  for (const email of OWN_USERS) {
    const fixture = { fullName: `ZZ OPS ${email.split("@")[0]}`, role: "REQUESTER" as const, isActive: true, ...fields };
    await prisma.user.upsert({ where: { email }, update: fixture, create: { email, ...fixture } });
  }

  const idOf = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  ids.wichai = await idOf(WICHAI);
  ids.arisa = await idOf(ARISA);
  ids.teerapat = await idOf(TEERAPAT);
  ids.admin = await idOf(ADMIN);
  ids.inactiveStaff = await idOf(INACTIVE_STAFF);
  ids.seededRequester = await idOf(SEEDED_REQUESTER);
  ids.requester = await idOf(REQUESTER);
  ids.demoted = await idOf(DEMOTED);

  const category = await prisma.category.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
  const system = await prisma.relatedSystem.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
  expect(category, "seed must provide an active Category").not.toBeNull();
  expect(system, "seed must provide an active Related System").not.toBeNull();
  categoryId = category!.id;
  relatedSystemId = system!.id;

  await clearOwnTickets();
});

beforeEach(() => {
  resetLoginThrottle();
});

afterAll(async () => {
  await clearOwnTickets();
  await prisma.session.deleteMany({ where: { user: { email: { in: OWN_USERS } } } });
  await prisma.user.deleteMany({ where: { email: { in: OWN_USERS } } });
  resetLoginThrottle();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------

describe("staff detail (OPS-01 - AC-34)", () => {
  it("returns the api-spec 5.2 detail with Requester, owner, IT Priority, indication, transitions, and attachments", async () => {
    const ticket = await makeTicket({
      status: "IN_PROGRESS",
      ownerId: ids.arisa,
      requestedPriority: "HIGH",
      itPriority: "URGENT",
      indicatedResolved: true,
    });
    const attachment = await prisma.attachment.create({
      data: {
        ticketId: ticket.id,
        originalFilename: "evidence.png",
        storedFilename: "ops-40-not-on-disk.png",
        mimeType: "image/png",
        sizeBytes: 16,
        uploadedById: ids.requester,
      },
    });
    const staff = await loginAs(WICHAI);

    const res = await staff.agent.get(ticketUrl(ticket.id));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        ticketDate: ticket.createdAt.toISOString(),
        requester: { id: ids.requester, fullName: "ZZ OPS zz.ops.requester", email: REQUESTER },
        category: { id: categoryId, name: expect.any(String) },
        relatedSystem: { id: relatedSystemId, name: expect.any(String) },
        summary: ticket.summary,
        description: ticket.description,
        requestedPriority: "HIGH",
        itPriority: "URGENT",
        currentStatus: "IN_PROGRESS",
        owner: { id: ids.arisa, fullName: "Arisa Kongkaew" },
        requesterIndicatedResolvedAt: "2026-10-01T09:00:00.000Z",
        availableTransitions: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
        attachments: [
          {
            id: attachment.id,
            ticketId: ticket.id,
            originalFilename: "evidence.png",
            mimeType: "image/png",
            sizeBytes: 16,
            uploadedAt: attachment.uploadedAt.toISOString(),
            status: "ACTIVE",
            removedAt: null,
            removedReason: null,
          },
        ],
        createdAt: ticket.createdAt.toISOString(),
        updatedAt: ticket.updatedAt.toISOString(),
      },
    });
    expect(res.text).not.toContain("storedFilename");
    expect(res.text).not.toContain("passwordHash");
  });

  it("returns owner null and only owner-free transitions for an unassigned ticket", async () => {
    const fresh = await makeTicket({ status: "NEW" });
    const reopened = await makeTicket({ status: "REOPENED" });
    const staff = await loginAs(WICHAI);

    const newRes = await staff.agent.get(ticketUrl(fresh.id));
    const reopenedRes = await staff.agent.get(ticketUrl(reopened.id));

    expect(newRes.status).toBe(200);
    expect(newRes.body.data.owner).toBeNull();
    expect(newRes.body.data.requesterIndicatedResolvedAt).toBeNull();
    expect(newRes.body.data.attachments).toEqual([]);
    // NEW -> OPEN is performed by claim or assign, never the status endpoint (BR-38).
    expect(newRes.body.data.availableTransitions).toEqual(["CANCELLED"]);
    // REOPENED -> IN_PROGRESS and RESOLVED need an owner (BR-36).
    expect(reopenedRes.body.data.availableTransitions).toEqual(["CANCELLED"]);
  });

  it("answers an unknown id with 404 and a malformed id with 400", async () => {
    const staff = await loginAs(WICHAI);

    const unknown = await staff.agent.get(ticketUrl(RANDOM_UUID));
    const malformed = await staff.agent.get(ticketUrl("not-a-uuid"));

    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual(NOT_FOUND);
    expect(malformed.status).toBe(400);
    expect(malformed.body).toEqual(BAD_REQUEST);
  });
});

describe("claim a NEW ticket (OPS-02 - AC-35, AC-45, BR-29, BR-31)", () => {
  it("makes the caller owner, moves NEW to OPEN, and records both events with the caller as actor", async () => {
    const ticket = await makeTicket({ status: "NEW" });
    const staff = await loginAs(WICHAI);

    const res = await claim(staff, ticket.id);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(ticket.id);
    expect(res.body.data.owner).toEqual({ id: ids.wichai, fullName: "Wichai Prasert" });
    expect(res.body.data.currentStatus).toBe("OPEN");
    expect(res.body.data.availableTransitions).toEqual(["IN_PROGRESS", "RESOLVED", "CANCELLED"]);

    const saved = await reload(ticket.id);
    expect(saved.ownerId).toBe(ids.wichai);
    expect(saved.currentStatus).toBe("OPEN");

    const events = await eventsOf(ticket.id);
    expect(events).toHaveLength(2);
    const owner = events.filter((e) => e.eventType === "OWNER_CHANGED");
    const status = events.filter((e) => e.eventType === "STATUS_CHANGED");
    expect(owner).toHaveLength(1);
    expect(status).toHaveLength(1);
    expect(owner[0].actorId).toBe(ids.wichai);
    expect(owner[0].payload).toEqual({ fromOwnerId: null, toOwnerId: ids.wichai, cause: "CLAIM" });
    expect(status[0].actorId).toBe(ids.wichai);
    expect(status[0].payload).toEqual({ from: "NEW", to: "OPEN" });
  });
});

describe("concurrent claims (OPS-03 - AC-36, BR-29)", () => {
  it("lets exactly one of two parallel claims succeed, every time", async () => {
    const wichai = await loginAs(WICHAI);
    const arisa = await loginAs(ARISA);

    for (let round = 0; round < 5; round += 1) {
      const ticket = await makeTicket({ status: "NEW" });

      const [a, b] = await Promise.all([claim(wichai, ticket.id), claim(arisa, ticket.id)]);

      expect([a.status, b.status].sort(), `round ${round}`).toEqual([200, 409]);
      const winner = a.status === 200 ? ids.wichai : ids.arisa;
      const loser = a.status === 200 ? b : a;
      expect(loser.body).toEqual(ALREADY_CLAIMED);

      const saved = await reload(ticket.id);
      expect(saved.ownerId).toBe(winner);
      expect(saved.currentStatus).toBe("OPEN");

      const events = await eventsOf(ticket.id);
      expect(events.filter((e) => e.eventType === "OWNER_CHANGED"), `round ${round}`).toHaveLength(1);
      expect(events.filter((e) => e.eventType === "STATUS_CHANGED"), `round ${round}`).toHaveLength(1);
    }
  });
});

describe("claim refusals (OPS-04 - AC-36)", () => {
  it("refuses claiming an owned ticket with TICKET_ALREADY_CLAIMED and changes nothing", async () => {
    const ticket = await makeTicket({ status: "OPEN", ownerId: ids.wichai });
    const arisa = await loginAs(ARISA);

    const res = await claim(arisa, ticket.id);

    expect(res.status).toBe(409);
    expect(res.body).toEqual(ALREADY_CLAIMED);
    await expectUnchanged(ticket);
  });

  it.each(["CLOSED", "RESOLVED", "CANCELLED"] as const)("refuses claiming a %s ticket with TICKET_STATE_CONFLICT and changes nothing", async (status) => {
    const ticket = await makeTicket({ status, ownerId: status === "CANCELLED" ? null : ids.wichai });
    const arisa = await loginAs(ARISA);

    const res = await claim(arisa, ticket.id);

    expect(res.status).toBe(409);
    expect(res.body).toEqual(STATE_CONFLICT);
    await expectUnchanged(ticket);
  });

  it("answers an unknown ticket with 404 and a malformed id with 400", async () => {
    const staff = await loginAs(WICHAI);

    const unknown = await claim(staff, RANDOM_UUID);
    const malformed = await claim(staff, "not-a-uuid");

    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual(NOT_FOUND);
    expect(malformed.status).toBe(400);
    expect(malformed.body).toEqual(BAD_REQUEST);
  });
});

describe("assign eligibility (OPS-05 - AC-37, BR-28, BR-31)", () => {
  it.each([
    ["an active IT Staff user", "arisa", "Arisa Kongkaew"],
    ["an active Administrator", "admin", "Sasithorn Pholchai"],
  ] as const)("assigns a NEW ticket to %s, moving it to OPEN", async (_label, who, fullName) => {
    const ticket = await makeTicket({ status: "NEW" });
    const staff = await loginAs(WICHAI);

    const res = await assign(staff, ticket.id, ids[who]);

    expect(res.status).toBe(200);
    expect(res.body.data.owner).toEqual({ id: ids[who], fullName });
    expect(res.body.data.currentStatus).toBe("OPEN");

    const events = await eventsOf(ticket.id);
    expect(events).toHaveLength(2);
    const owner = events.find((e) => e.eventType === "OWNER_CHANGED")!;
    const status = events.find((e) => e.eventType === "STATUS_CHANGED")!;
    expect(owner.actorId).toBe(ids.wichai);
    expect(owner.payload).toEqual({ fromOwnerId: null, toOwnerId: ids[who], cause: "ASSIGN" });
    expect(status.actorId).toBe(ids.wichai);
    expect(status.payload).toEqual({ from: "NEW", to: "OPEN" });
  });

  it("rejects a Requester, the inactive IT Staff, an unknown UUID, a malformed id, and no id with 422 details.ownerId", async () => {
    const staff = await loginAs(WICHAI);
    const candidates: [string, unknown][] = [
      ["a Requester", ids.seededRequester],
      ["the inactive IT Staff", ids.inactiveStaff],
      ["an unknown UUID", RANDOM_UUID],
      ["a malformed id", "not-a-uuid"],
      ["no id", undefined],
    ];

    for (const [label, ownerId] of candidates) {
      const ticket = await makeTicket({ status: "NEW" });

      const res = await assign(staff, ticket.id, ownerId);

      expect(res.status, label).toBe(422);
      expect(res.body, label).toEqual(invalidField("ownerId", OWNER_MESSAGE));
      await expectUnchanged(ticket);
    }
  });
});

describe("reassign and no-op (OPS-06 - AC-37, AC-45, BR-30)", () => {
  it("records OWNER_CHANGED with from and to on reassignment, and keeps a non-NEW status", async () => {
    const ticket = await makeTicket({ status: "IN_PROGRESS", ownerId: ids.wichai });
    const teerapat = await loginAs(TEERAPAT);

    const res = await assign(teerapat, ticket.id, ids.arisa);

    expect(res.status).toBe(200);
    expect(res.body.data.owner.id).toBe(ids.arisa);
    expect(res.body.data.currentStatus).toBe("IN_PROGRESS");

    const events = await eventsOf(ticket.id);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("OWNER_CHANGED");
    expect(events[0].actorId).toBe(ids.teerapat);
    expect(events[0].payload).toEqual({ fromOwnerId: ids.wichai, toOwnerId: ids.arisa, cause: "ASSIGN" });
  });

  it("answers assigning the current owner with 200, no change, and no event", async () => {
    const ticket = await makeTicket({ status: "OPEN", ownerId: ids.arisa });
    const staff = await loginAs(WICHAI);

    const res = await assign(staff, ticket.id, ids.arisa);

    expect(res.status).toBe(200);
    expect(res.body.data.owner.id).toBe(ids.arisa);
    await expectUnchanged(ticket);
  });
});

describe("IT Priority on create (OPS-07 - AC-38, BR-33)", () => {
  it.each(["LOW", "MEDIUM", "HIGH", "URGENT"] as const)(
    "gives a ticket created with Requested Priority %s the same IT Priority",
    async (priority) => {
      const requester = await loginAs(REQUESTER);
      const staff = await loginAs(WICHAI);

      const created = await requester.agent.post("/api/v1/tickets").send({
        categoryId,
        relatedSystemId,
        summary: `${MARKER} created with ${priority}`,
        requestedPriority: priority,
        description: "Since the last update the battery drops from full to empty in about an hour.",
      });
      expect(created.status).toBe(201);

      const res = await staff.agent.get(ticketUrl(created.body.data.id));

      expect(res.status).toBe(200);
      expect(res.body.data.requestedPriority).toBe(priority);
      expect(res.body.data.itPriority).toBe(priority);
    },
  );
});

describe("change IT Priority (OPS-08 - AC-38, AC-45, BR-33)", () => {
  it("changes IT Priority, records IT_PRIORITY_CHANGED, and leaves Requested Priority alone", async () => {
    const ticket = await makeTicket({ status: "OPEN", ownerId: ids.wichai, requestedPriority: "MEDIUM" });
    const staff = await loginAs(ARISA);

    const res = await setItPriority(staff, ticket.id, "URGENT");

    expect(res.status).toBe(200);
    expect(res.body.data.itPriority).toBe("URGENT");
    expect(res.body.data.requestedPriority).toBe("MEDIUM");

    const saved = await reload(ticket.id);
    expect(saved.itPriority).toBe("URGENT");
    expect(saved.requestedPriority).toBe("MEDIUM");

    const events = await eventsOf(ticket.id);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("IT_PRIORITY_CHANGED");
    expect(events[0].actorId).toBe(ids.arisa);
    expect(events[0].payload).toEqual({ from: "MEDIUM", to: "URGENT" });
  });

  it("answers the same value with 200 and no event", async () => {
    const ticket = await makeTicket({ status: "IN_PROGRESS", ownerId: ids.wichai, itPriority: "HIGH" });
    const staff = await loginAs(WICHAI);

    const res = await setItPriority(staff, ticket.id, "HIGH");

    expect(res.status).toBe(200);
    expect(res.body.data.itPriority).toBe("HIGH");
    await expectUnchanged(ticket);
  });

  it.each(["CLOSED", "CANCELLED"] as const)("refuses a change on a %s ticket with 409 TICKET_STATE_CONFLICT", async (status) => {
    const ticket = await makeTicket({ status, ownerId: status === "CLOSED" ? ids.wichai : null });
    const staff = await loginAs(WICHAI);

    const res = await setItPriority(staff, ticket.id, "URGENT");

    expect(res.status).toBe(409);
    expect(res.body).toEqual(STATE_CONFLICT);
    await expectUnchanged(ticket);
  });

  it.each([["urgent"], ["CRITICAL"], [undefined], [3]])("rejects %s with 422 details.itPriority", async (value) => {
    const ticket = await makeTicket({ status: "OPEN", ownerId: ids.wichai });
    const staff = await loginAs(WICHAI);

    const res = await setItPriority(staff, ticket.id, value);

    expect(res.status).toBe(422);
    expect(res.body).toEqual(invalidField("itPriority"));
    await expectUnchanged(ticket);
  });
});

/** The 17 rows of the matrix the status endpoint performs (all but NEW -> OPEN). */
const STATUS_ENDPOINT_ROWS: [TicketStatus, TicketStatus][] = [
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

describe("permitted transitions (OPS-09 - AC-39, AC-45)", () => {
  it("has 17 status-endpoint rows", () => {
    expect(STATUS_ENDPOINT_ROWS).toHaveLength(17);
  });

  it.each(STATUS_ENDPOINT_ROWS)("%s -> %s gives 200 and one STATUS_CHANGED event", async (from, to) => {
    // An owner wherever the ticket could have one, so only the matrix decides.
    const ticket = await makeTicket({ status: from, ownerId: from === "NEW" ? null : ids.wichai });
    const staff = await loginAs(WICHAI);
    const needsReason = to === "CANCELLED" || to === "REOPENED";

    // A reason is sent on every row: it is stored, trimmed, only where the
    // matrix asks for one, and ignored otherwise (api-spec 5.7).
    const res = await changeStatus(staff, ticket.id, { status: to, reason: `  ${REASON}  ` });

    expect(res.status).toBe(200);
    expect(res.body.data.currentStatus).toBe(to);
    expect((await reload(ticket.id)).currentStatus).toBe(to);

    const events = await eventsOf(ticket.id);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("STATUS_CHANGED");
    expect(events[0].actorId).toBe(ids.wichai);
    expect(events[0].payload).toEqual(needsReason ? { from, to, reason: REASON } : { from, to });
  });
});

describe("refused transitions (OPS-10 - AC-39, BR-35, BR-38)", () => {
  const refused: [TicketStatus, TicketStatus][] = [
    ["NEW", "OPEN"],
    ["NEW", "RESOLVED"],
    ["RESOLVED", "CANCELLED"],
    ["CLOSED", "CANCELLED"],
    ["OPEN", "NEW"],
    ["OPEN", "OPEN"],
  ];

  it.each(refused)("%s -> %s gives 409 INVALID_STATUS_TRANSITION with no change and no event", async (from, to) => {
    const ticket = await makeTicket({ status: from, ownerId: from === "NEW" ? null : ids.wichai });
    const staff = await loginAs(WICHAI);

    const res = await changeStatus(staff, ticket.id, { status: to, reason: REASON });

    expect(res.status).toBe(409);
    expect(res.body).toEqual(INVALID_TRANSITION);
    await expectUnchanged(ticket);
  });

  it("names both statuses by display name in the message", async () => {
    const ticket = await makeTicket({ status: "NEW" });
    const staff = await loginAs(WICHAI);

    const res = await changeStatus(staff, ticket.id, { status: "RESOLVED" });

    expect(res.body.error.message).toBe("This ticket cannot move from New to Resolved.");
  });

  it("reports an impossible transition as such even when the reason is also missing", async () => {
    const ticket = await makeTicket({ status: "RESOLVED", ownerId: ids.wichai });
    const staff = await loginAs(WICHAI);

    const res = await changeStatus(staff, ticket.id, { status: "CANCELLED" });

    expect(res.status).toBe(409);
    expect(res.body).toEqual(INVALID_TRANSITION);
    await expectUnchanged(ticket);
  });

  it.each([["DONE"], ["open"], [undefined]])("rejects status %s with 422 details.status", async (status) => {
    const ticket = await makeTicket({ status: "OPEN", ownerId: ids.wichai });
    const staff = await loginAs(WICHAI);

    const res = await changeStatus(staff, ticket.id, { status });

    expect(res.status).toBe(422);
    expect(res.body).toEqual(invalidField("status"));
    await expectUnchanged(ticket);
  });
});

describe("owner required (OPS-11 - AC-40, BR-36)", () => {
  it("refuses REOPENED -> IN_PROGRESS with no owner, then allows it after a claim", async () => {
    const ticket = await makeTicket({ status: "REOPENED" });
    const staff = await loginAs(WICHAI);

    const refused = await changeStatus(staff, ticket.id, { status: "IN_PROGRESS" });

    expect(refused.status).toBe(409);
    expect(refused.body).toEqual(OWNER_REQUIRED);
    expect(refused.body.error.message).toBe("Assign a Ticket Owner before moving this ticket to In Progress.");
    await expectUnchanged(ticket);

    const claimed = await claim(staff, ticket.id);
    expect(claimed.status).toBe(200);
    // Only a NEW ticket moves to OPEN on claim (BR-31).
    expect(claimed.body.data.currentStatus).toBe("REOPENED");

    const allowed = await changeStatus(staff, ticket.id, { status: "IN_PROGRESS" });
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.currentStatus).toBe("IN_PROGRESS");
  });
});

describe("reason rules (OPS-12 - AC-41, BR-37)", () => {
  const cases = [
    ["cancel", "OPEN", "CANCELLED"],
    ["reopen", "RESOLVED", "REOPENED"],
  ] as const;

  it.each(cases)("%s: rejects no reason, an empty one, and 4 characters with 422 details.reason", async (_label, from, to) => {
    const staff = await loginAs(WICHAI);
    const bodies: Record<string, unknown>[] = [
      { status: to },
      { status: to, reason: "" },
      { status: to, reason: "abcd" },
      { status: to, reason: "   abcd   " },
      { status: to, reason: "x".repeat(501) },
      { status: to, reason: 12345 },
    ];

    for (const body of bodies) {
      const ticket = await makeTicket({ status: from, ownerId: ids.wichai });

      const res = await changeStatus(staff, ticket.id, body);

      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(res.body, JSON.stringify(body)).toEqual(invalidField("reason"));
      await expectUnchanged(ticket);
    }
  });

  it.each(cases)("%s: accepts 5 and 500 characters and stores the reason in the event", async (_label, from, to) => {
    const staff = await loginAs(WICHAI);

    for (const reason of ["abcde", "y".repeat(500)]) {
      const ticket = await makeTicket({ status: from, ownerId: ids.wichai });

      const res = await changeStatus(staff, ticket.id, { status: to, reason });

      expect(res.status, `${reason.length} characters`).toBe(200);
      const events = (await eventsOf(ticket.id)).filter((e) => e.eventType === "STATUS_CHANGED");
      expect(events).toHaveLength(1);
      expect(events[0].payload).toEqual({ from, to, reason });
    }
  });
});

describe("reopen side effects (OPS-13 - AC-42, BR-40)", () => {
  it.each([
    ["inactive", "inactiveStaff"],
    ["no longer IT Staff or Administrator", "demoted"],
  ] as const)("clears the indication and an owner who is %s, with a null-actor OWNER_CHANGED", async (_label, who) => {
    const ownerId = ids[who];
    const ticket = await makeTicket({ status: "RESOLVED", ownerId, indicatedResolved: true });
    const staff = await loginAs(WICHAI);

    const res = await changeStatus(staff, ticket.id, { status: "REOPENED", reason: REASON });

    expect(res.status).toBe(200);
    expect(res.body.data.currentStatus).toBe("REOPENED");
    expect(res.body.data.owner).toBeNull();
    expect(res.body.data.requesterIndicatedResolvedAt).toBeNull();

    const saved = await reload(ticket.id);
    expect(saved.ownerId).toBeNull();
    expect(saved.requesterIndicatedResolvedAt).toBeNull();

    const events = await eventsOf(ticket.id);
    expect(events).toHaveLength(2);
    const status = events.find((e) => e.eventType === "STATUS_CHANGED")!;
    const owner = events.find((e) => e.eventType === "OWNER_CHANGED")!;
    expect(status.actorId).toBe(ids.wichai);
    expect(status.payload).toEqual({ from: "RESOLVED", to: "REOPENED", reason: REASON });
    expect(owner.actorId).toBeNull();
    expect(owner.payload).toEqual({ fromOwnerId: ownerId, toOwnerId: null, cause: "OWNER_INELIGIBLE_ON_REOPEN" });
  });

  it("keeps an eligible owner and still clears the indication", async () => {
    const ticket = await makeTicket({ status: "RESOLVED", ownerId: ids.arisa, indicatedResolved: true });
    const staff = await loginAs(WICHAI);

    const res = await changeStatus(staff, ticket.id, { status: "REOPENED", reason: REASON });

    expect(res.status).toBe(200);
    expect(res.body.data.owner).toEqual({ id: ids.arisa, fullName: "Arisa Kongkaew" });
    expect(res.body.data.requesterIndicatedResolvedAt).toBeNull();

    const saved = await reload(ticket.id);
    expect(saved.ownerId).toBe(ids.arisa);
    expect(saved.requesterIndicatedResolvedAt).toBeNull();

    const events = await eventsOf(ticket.id);
    expect(events.map((e) => e.eventType)).toEqual(["STATUS_CHANGED"]);
  });
});

describe("CLOSED lock for operations (OPS-14 - AC-43, BR-39)", () => {
  it("refuses claim, assign, and IT Priority with TICKET_STATE_CONFLICT, then allows reopening", async () => {
    const ticket = await makeTicket({ status: "CLOSED", ownerId: ids.wichai });
    const arisa = await loginAs(ARISA);

    const responses = [
      await claim(arisa, ticket.id),
      await assign(arisa, ticket.id, ids.arisa),
      await setItPriority(arisa, ticket.id, "URGENT"),
    ];
    for (const res of responses) {
      expect(res.status).toBe(409);
      expect(res.body).toEqual(STATE_CONFLICT);
    }
    await expectUnchanged(ticket);

    const reopen = await changeStatus(arisa, ticket.id, { status: "REOPENED", reason: REASON });
    expect(reopen.status).toBe(200);
    expect(reopen.body.data.currentStatus).toBe("REOPENED");
  });
});

describe("Administrator parity (OPS-15 - AC-44, BR-26)", () => {
  it("claims, assigns, changes IT Priority, and changes status with the same outcomes and events", async () => {
    const admin = await loginAs(ADMIN);

    const claimed = await makeTicket({ status: "NEW" });
    const claimRes = await claim(admin, claimed.id);
    expect(claimRes.status).toBe(200);
    expect(claimRes.body.data.owner.id).toBe(ids.admin);
    expect(claimRes.body.data.currentStatus).toBe("OPEN");

    const assigned = await makeTicket({ status: "NEW" });
    const assignRes = await assign(admin, assigned.id, ids.arisa);
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.data.owner.id).toBe(ids.arisa);
    expect(assignRes.body.data.currentStatus).toBe("OPEN");

    const priorityRes = await setItPriority(admin, claimed.id, "URGENT");
    expect(priorityRes.status).toBe(200);
    expect(priorityRes.body.data.itPriority).toBe("URGENT");

    const statusRes = await changeStatus(admin, claimed.id, { status: "IN_PROGRESS" });
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.currentStatus).toBe("IN_PROGRESS");

    const claimedEvents = await eventsOf(claimed.id);
    expect(claimedEvents.map((e) => [e.eventType, e.actorId, e.payload])).toEqual(
      expect.arrayContaining([
        ["OWNER_CHANGED", ids.admin, { fromOwnerId: null, toOwnerId: ids.admin, cause: "CLAIM" }],
        ["STATUS_CHANGED", ids.admin, { from: "NEW", to: "OPEN" }],
        ["IT_PRIORITY_CHANGED", ids.admin, { from: "MEDIUM", to: "URGENT" }],
        ["STATUS_CHANGED", ids.admin, { from: "OPEN", to: "IN_PROGRESS" }],
      ]),
    );
    expect(claimedEvents).toHaveLength(4);

    const assignedEvents = await eventsOf(assigned.id);
    expect(assignedEvents.map((e) => [e.eventType, e.actorId, e.payload])).toEqual(
      expect.arrayContaining([
        ["OWNER_CHANGED", ids.admin, { fromOwnerId: null, toOwnerId: ids.arisa, cause: "ASSIGN" }],
        ["STATUS_CHANGED", ids.admin, { from: "NEW", to: "OPEN" }],
      ]),
    );
    expect(assignedEvents).toHaveLength(2);
  });
});

describe("Requester refused (OPS-16 - AC-27)", () => {
  it("gives identical 403 bodies on the Requester's own ticket and on a random UUID, changing nothing", async () => {
    const ticket = await makeTicket({ status: "RESOLVED", ownerId: ids.wichai });
    const requester = await loginAs(REQUESTER);

    // Built lazily: a Supertest request starts its server when created.
    const calls = (ticketId: string): (() => Test)[] => [
      () => claim(requester, ticketId),
      () => assign(requester, ticketId, ids.wichai),
      () => setItPriority(requester, ticketId, "URGENT"),
      () => changeStatus(requester, ticketId, { status: "CLOSED" }),
      () => changeStatus(requester, ticketId, { status: "CANCELLED", reason: REASON }),
      () => changeStatus(requester, ticketId, { status: "REOPENED", reason: REASON }),
    ];

    const responses: request.Response[] = [];
    for (const call of [...calls(ticket.id), ...calls(RANDOM_UUID)]) {
      responses.push(await call());
    }

    for (const res of responses) {
      expect(res.status).toBe(403);
      expect(res.body).toEqual(FORBIDDEN);
      expect(res.text).toBe(responses[0].text);
    }
    await expectUnchanged(ticket);
  });
});

describe("assignee list (OPS-18 - AC-37, BR-28)", () => {
  it.each([WICHAI, ADMIN])("returns exactly the active IT Staff and Administrators, sorted by name, to %s", async (email) => {
    const staff = await loginAs(email);

    const res = await staff.agent.get("/api/v1/staff/assignees");

    expect(res.status).toBe(200);
    const expected = await prisma.user.findMany({
      where: { isActive: true, role: { in: ["IT_STAFF", "ADMINISTRATOR"] } },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, role: true },
    });
    expect(res.body).toEqual({ data: expected });

    const names = res.body.data.map((u: { fullName: string }) => u.fullName);
    const seeded = ["Arisa Kongkaew", "Sasithorn Pholchai", "Teerapat Boonsri", "Wichai Prasert"];
    expect(names.filter((n: string) => seeded.includes(n))).toEqual(seeded);
    expect(names).not.toContain("Nattapong Saelim");
    const returnedIds = res.body.data.map((u: { id: string }) => u.id);
    expect(returnedIds).not.toContain(ids.seededRequester);
    expect(returnedIds).not.toContain(ids.inactiveStaff);
  });

  it("refuses a Requester with 403", async () => {
    const requester = await loginAs(REQUESTER);

    const res = await requester.agent.get("/api/v1/staff/assignees");

    expect(res.status).toBe(403);
    expect(res.body).toEqual(FORBIDDEN);
  });
});

// Runs last, so it sees the events written by every operation above as well
// as its own.
describe("event payload safety (OPS-17 - AC-45, BR-56)", () => {
  it("writes no secret into any event payload, and every event has ticketId, eventType, and createdAt", async () => {
    // A raw sign-in, so the session token itself is known and can be searched for.
    const login = await request(app).post("/api/v1/auth/login").send({ email: WICHAI, password: seedPassword() });
    expect(login.status).toBe(200);
    const cookie = ([] as string[]).concat(login.headers["set-cookie"] ?? [])[0].split(";")[0];
    const sessionToken = cookie.split("=")[1];
    const csrfToken: string = login.body.data.csrfToken;
    const send = (test: Test) => test.set("Cookie", cookie).set(CSRF_HEADER, csrfToken);

    const ticket = await makeTicket({ status: "NEW" });
    const operations = [
      () => send(request(app).post(ticketUrl(ticket.id, "/claim"))),
      () => send(request(app).put(ticketUrl(ticket.id, "/it-priority"))).send({ itPriority: "HIGH" }),
      () => send(request(app).put(ticketUrl(ticket.id, "/owner"))).send({ ownerId: ids.arisa }),
      () => send(request(app).post(ticketUrl(ticket.id, "/status"))).send({ status: "IN_PROGRESS" }),
      () => send(request(app).post(ticketUrl(ticket.id, "/status"))).send({ status: "CANCELLED", reason: REASON }),
      () => send(request(app).post(ticketUrl(ticket.id, "/status"))).send({ status: "REOPENED", reason: REASON }),
    ];
    for (const operation of operations) {
      expect((await operation()).status).toBe(200);
    }

    const users = await prisma.user.findMany({ where: { email: { in: [WICHAI, ARISA, TEERAPAT, ADMIN, INACTIVE_STAFF, ...OWN_USERS] } } });
    const sessions = await prisma.session.findMany({ where: { userId: { in: users.map((u) => u.id) } } });
    const secrets = [
      seedPassword(),
      sessionToken,
      csrfToken,
      ...users.map((u) => u.passwordHash).filter((h): h is string => h !== null),
      ...sessions.flatMap((s) => [s.id, s.csrfToken]),
    ];

    // Claim writes two events; the other five operations one each.
    expect(await eventsOf(ticket.id)).toHaveLength(7);
    const events = await prisma.ticketEvent.findMany({ where: { ticket: { summary: { contains: MARKER } } } });

    const allowedKeys: Record<string, string[][]> = {
      OWNER_CHANGED: [["cause", "fromOwnerId", "toOwnerId"]],
      STATUS_CHANGED: [["from", "to"], ["from", "reason", "to"]],
      IT_PRIORITY_CHANGED: [["from", "to"]],
    };
    for (const event of events) {
      expect(event.ticketId).toEqual(expect.any(String));
      expect(event.eventType).toEqual(expect.any(String));
      expect(event.createdAt).toBeInstanceOf(Date);

      const text = JSON.stringify(event.payload);
      expect(text).not.toContain("$argon2");
      for (const secret of secrets) {
        expect(text.includes(secret), `${event.eventType} payload holds a secret`).toBe(false);
      }
      expect(allowedKeys[event.eventType], event.eventType).toContainEqual(
        Object.keys(event.payload as object).sort(),
      );
    }
  });
});
