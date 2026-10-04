import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { TicketStatus } from "@prisma/client";
import { getPrisma } from "../../src/prisma.js";
import { resetLoginThrottle } from "../../src/lab-03/login-throttle.js";
import { loginAs, signInFields, type SignedIn } from "../helpers/session.js";

// CMN-01 to CMN-12 from docs/lab-03/tests.md section 2.7 (AC-04, AC-22, AC-25,
// AC-26, AC-43, AC-45 to AC-49). api-spec.md sections 4 and 6 are the contract.
//
// Every ticket here is created by this suite for its own two Requesters, so no
// seeded ticket is touched. Seeded staff accounts are signed in as, never
// altered. Comments, notes, and events are read back through Prisma.

const prisma = getPrisma();

const WICHAI = "wichai.pra@kmutt.ac.th"; // IT Staff
const ADMIN = "sasithorn.pho@kmutt.ac.th"; // Administrator

const REQUESTER_A = "zz.cmn.a@example.test";
const REQUESTER_B = "zz.cmn.b@example.test";
const OWN_USERS = [REQUESTER_A, REQUESTER_B];
const NAME_A = "ZZ CMN Requester A";
const NAME_B = "ZZ CMN Requester B";

const MARKER = "[cmn-41]";
const RANDOM_UUID = "3f8b0c22-0000-4000-8000-0000000000c1";
const COMMENT_MESSAGE = "Comment must be 1–2000 characters.";
const NOTE_MESSAGE = "Note must be 1–2000 characters.";

const FORBIDDEN = { error: { code: "FORBIDDEN", message: expect.any(String) } };
const NOT_FOUND = { error: { code: "NOT_FOUND", message: expect.any(String) } };
const BAD_REQUEST = { error: { code: "BAD_REQUEST", message: expect.any(String) } };
const STATE_CONFLICT = { error: { code: "TICKET_STATE_CONFLICT", message: expect.any(String) } };
const ALREADY_INDICATED = { error: { code: "RESOLUTION_ALREADY_INDICATED", message: expect.any(String) } };
const invalidBody = (message: string) => ({
  error: { code: "VALIDATION_ERROR", message: expect.any(String), details: { body: message } },
});

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const ids = { wichai: "", admin: "", a: "", b: "" };
let categoryId = 0;
let relatedSystemId = 0;
let ticketCounter = 0;

// ---------------------------------------------------------------------------
// Helpers

const commentsUrl = (ticketId: string) => `/api/v1/tickets/${ticketId}/comments`;
const notesUrl = (ticketId: string) => `/api/v1/tickets/${ticketId}/notes`;
const resolvedUrl = (ticketId: string) => `/api/v1/tickets/${ticketId}/appears-resolved`;

const postComment = (who: SignedIn, ticketId: string, body: unknown, extra: Record<string, unknown> = {}) =>
  who.agent.post(commentsUrl(ticketId)).send({ body, ...extra });
const postNote = (who: SignedIn, ticketId: string, body: unknown, extra: Record<string, unknown> = {}) =>
  who.agent.post(notesUrl(ticketId)).send({ body, ...extra });
const indicateResolved = (who: SignedIn, ticketId: string) => who.agent.post(resolvedUrl(ticketId));

type TicketSetup = {
  requesterId?: string;
  status?: TicketStatus;
  ownerId?: string | null;
  indicatedResolved?: boolean;
};

async function makeTicket(setup: TicketSetup = {}) {
  ticketCounter += 1;
  return prisma.ticket.create({
    data: {
      ticketNumber: `TKT-2026-96${String(ticketCounter).padStart(3, "0")}`,
      requesterId: setup.requesterId ?? ids.a,
      ownerId: setup.ownerId ?? null,
      categoryId,
      relatedSystemId,
      summary: `${MARKER} ticket ${ticketCounter}`,
      description: "A description long enough to satisfy the twenty character minimum.",
      requestedPriority: "MEDIUM",
      itPriority: "HIGH",
      currentStatus: setup.status ?? "OPEN",
      requesterIndicatedResolvedAt: setup.indicatedResolved ? new Date("2026-10-01T09:00:00Z") : null,
    },
  });
}

const reload = (ticketId: string) => prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
const eventsOf = (ticketId: string) =>
  prisma.ticketEvent.findMany({ where: { ticketId }, orderBy: { createdAt: "asc" } });
const commentsOf = (ticketId: string) => prisma.publicComment.findMany({ where: { ticketId } });
const notesOf = (ticketId: string) => prisma.internalNote.findMany({ where: { ticketId } });

/** Every key anywhere in a JSON value. */
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, inner]) => [key, ...keysOf(inner)]);
  }
  return [];
}

async function clearOwnTickets() {
  const where = { OR: [{ requesterId: { in: [ids.a, ids.b] } }, { summary: { contains: MARKER } }] };
  await prisma.publicComment.deleteMany({ where: { ticket: where } });
  await prisma.internalNote.deleteMany({ where: { ticket: where } });
  await prisma.ticketEvent.deleteMany({ where: { ticket: where } });
  await prisma.attachment.deleteMany({ where: { ticket: where } });
  await prisma.ticket.deleteMany({ where });
}

// ---------------------------------------------------------------------------

beforeAll(async () => {
  const fields = await signInFields();
  for (const [email, fullName] of [
    [REQUESTER_A, NAME_A],
    [REQUESTER_B, NAME_B],
  ]) {
    const fixture = { fullName, role: "REQUESTER" as const, isActive: true, ...fields };
    await prisma.user.upsert({ where: { email }, update: fixture, create: { email, ...fixture } });
  }

  const idOf = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  ids.wichai = await idOf(WICHAI);
  ids.admin = await idOf(ADMIN);
  ids.a = await idOf(REQUESTER_A);
  ids.b = await idOf(REQUESTER_B);

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

describe("staff comment visible to the Requester (CMN-01 - AC-46, BR-48)", () => {
  it("returns 201 with the staff author and a server time, ignoring a body authorId and createdAt", async () => {
    const ticket = await makeTicket({ status: "IN_PROGRESS", ownerId: ids.wichai });
    const staff = await loginAs(WICHAI);
    const requester = await loginAs(REQUESTER_A);

    const before = Date.now();
    const res = await postComment(staff, ticket.id, "Please restart with the charger connected.", {
      authorId: ids.a,
      createdAt: "2000-01-01T00:00:00.000Z",
    });
    const after = Date.now();

    expect(res.status).toBe(201);
    const comment = res.body.data;
    expect(res.body).toEqual({
      data: {
        id: expect.any(String),
        ticketId: ticket.id,
        author: { id: ids.wichai, fullName: "Wichai Prasert", role: "IT_STAFF" },
        body: "Please restart with the charger connected.",
        createdAt: expect.stringMatching(ISO),
      },
    });
    const createdAt = Date.parse(comment.createdAt);
    expect(createdAt).toBeGreaterThanOrEqual(before - 1000);
    expect(createdAt).toBeLessThanOrEqual(after + 1000);

    const stored = await commentsOf(ticket.id);
    expect(stored).toHaveLength(1);
    expect(stored[0].authorId).toBe(ids.wichai);

    const list = await requester.agent.get(commentsUrl(ticket.id));
    expect(list.status).toBe(200);
    expect(list.body).toEqual({ data: [comment] });
  });
});

describe("Requester comment (CMN-02 - AC-25)", () => {
  it("lets the Requester post on their own ticket, and IT Staff and the Administrator read it", async () => {
    const ticket = await makeTicket({ status: "OPEN", ownerId: ids.wichai });
    const requester = await loginAs(REQUESTER_A);
    const staff = await loginAs(WICHAI);
    const admin = await loginAs(ADMIN);

    const res = await postComment(requester, ticket.id, "It still drains after the restart.");

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      id: expect.any(String),
      ticketId: ticket.id,
      author: { id: ids.a, fullName: NAME_A, role: "REQUESTER" },
      body: "It still drains after the restart.",
      createdAt: expect.stringMatching(ISO),
    });

    for (const reader of [staff, admin, requester]) {
      const list = await reader.agent.get(commentsUrl(ticket.id));
      expect(list.status).toBe(200);
      expect(list.body).toEqual({ data: [res.body.data] });
    }
  });

  it("lists comments oldest first", async () => {
    const ticket = await makeTicket({ status: "OPEN", ownerId: ids.wichai });
    const requester = await loginAs(REQUESTER_A);
    const staff = await loginAs(WICHAI);

    const first = await postComment(requester, ticket.id, "first");
    const second = await postComment(staff, ticket.id, "second");
    const third = await postComment(requester, ticket.id, "third");

    const list = await staff.agent.get(commentsUrl(ticket.id));
    expect(list.body.data.map((c: { id: string }) => c.id)).toEqual([
      first.body.data.id,
      second.body.data.id,
      third.body.data.id,
    ]);
  });
});

describe("cross-Requester comments (CMN-03 - AC-22, BR-24)", () => {
  it("gives Requester B identical 404 bodies for A's ticket and a random UUID, listing and posting", async () => {
    const ticket = await makeTicket({ requesterId: ids.a, status: "OPEN" });
    const owner = await loginAs(REQUESTER_A);
    const other = await loginAs(REQUESTER_B);
    // The refusal a missing ticket gets from GET /tickets/{id} (AC-22).
    const missingTicket = await other.agent.get(`/api/v1/tickets/${RANDOM_UUID}`);
    expect(missingTicket.status).toBe(404);
    // The ticket's own Requester can reach the comments, so B's 404 is a refusal.
    expect((await owner.agent.get(commentsUrl(ticket.id))).status).toBe(200);

    const responses = [
      await other.agent.get(commentsUrl(ticket.id)),
      await other.agent.get(commentsUrl(RANDOM_UUID)),
      await postComment(other, ticket.id, "Can I see this?"),
      await postComment(other, RANDOM_UUID, "Can I see this?"),
    ];

    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual(NOT_FOUND);
      expect(res.text).toBe(missingTicket.text);
    }
    expect(await commentsOf(ticket.id)).toEqual([]);
  });

  it("answers a malformed ticket id with 400", async () => {
    const requester = await loginAs(REQUESTER_A);

    const list = await requester.agent.get(commentsUrl("not-a-uuid"));
    const post = await postComment(requester, "not-a-uuid", "hello");

    expect(list.status).toBe(400);
    expect(list.body).toEqual(BAD_REQUEST);
    expect(post.status).toBe(400);
    expect(post.body).toEqual(BAD_REQUEST);
  });

  it("answers staff on an unknown ticket with 404", async () => {
    const staff = await loginAs(WICHAI);
    const missingTicket = await staff.agent.get(`/api/v1/staff/tickets/${RANDOM_UUID}`);

    const list = await staff.agent.get(commentsUrl(RANDOM_UUID));
    const post = await postComment(staff, RANDOM_UUID, "hello");

    expect(list.status).toBe(404);
    expect(list.text).toBe(missingTicket.text);
    expect(post.status).toBe(404);
    expect(post.text).toBe(missingTicket.text);
  });
});

describe("notes for staff (CMN-04 - AC-47, BR-50, BR-51)", () => {
  it("lets IT Staff and the Administrator post notes and both list them oldest first", async () => {
    const ticket = await makeTicket({ status: "IN_PROGRESS", ownerId: ids.wichai });
    const staff = await loginAs(WICHAI);
    const admin = await loginAs(ADMIN);

    const first = await postNote(staff, ticket.id, "Battery health reads 61 percent.");
    const second = await postNote(admin, ticket.id, "Approved the replacement part.", {
      authorId: ids.wichai,
      createdAt: "2000-01-01T00:00:00.000Z",
    });

    expect(first.status).toBe(201);
    expect(first.body).toEqual({
      data: {
        id: expect.any(String),
        ticketId: ticket.id,
        author: { id: ids.wichai, fullName: "Wichai Prasert", role: "IT_STAFF" },
        body: "Battery health reads 61 percent.",
        createdAt: expect.stringMatching(ISO),
      },
    });
    expect(second.status).toBe(201);
    expect(second.body.data.author).toEqual({ id: ids.admin, fullName: "Sasithorn Pholchai", role: "ADMINISTRATOR" });
    expect(second.body.data.createdAt).not.toBe("2000-01-01T00:00:00.000Z");

    for (const reader of [staff, admin]) {
      const list = await reader.agent.get(notesUrl(ticket.id));
      expect(list.status).toBe(200);
      expect(list.body).toEqual({ data: [first.body.data, second.body.data] });
    }
  });

  it("stores notes apart from comments, so neither list shows the other", async () => {
    const ticket = await makeTicket({ status: "IN_PROGRESS", ownerId: ids.wichai });
    const staff = await loginAs(WICHAI);

    const note = await postNote(staff, ticket.id, "Internal only.");
    const comment = await postComment(staff, ticket.id, "Public reply.");

    expect(await notesOf(ticket.id)).toHaveLength(1);
    expect(await commentsOf(ticket.id)).toHaveLength(1);
    expect((await staff.agent.get(notesUrl(ticket.id))).body.data.map((n: { id: string }) => n.id)).toEqual([
      note.body.data.id,
    ]);
    expect((await staff.agent.get(commentsUrl(ticket.id))).body.data.map((c: { id: string }) => c.id)).toEqual([
      comment.body.data.id,
    ]);
  });

  it("answers an unknown ticket with 404 and a malformed id with 400", async () => {
    const staff = await loginAs(WICHAI);

    expect((await staff.agent.get(notesUrl(RANDOM_UUID))).status).toBe(404);
    expect((await postNote(staff, RANDOM_UUID, "hello")).status).toBe(404);
    expect((await staff.agent.get(notesUrl("not-a-uuid"))).body).toEqual(BAD_REQUEST);
    expect((await postNote(staff, "not-a-uuid", "hello")).status).toBe(400);
  });
});

describe("notes refused to the Requester (CMN-05 - AC-04, BR-23)", () => {
  it("gives identical 403 bodies, with no note content, for own, another's, unknown, and malformed ids", async () => {
    const own = await makeTicket({ requesterId: ids.a, status: "IN_PROGRESS", ownerId: ids.wichai });
    const others = await makeTicket({ requesterId: ids.b, status: "IN_PROGRESS", ownerId: ids.wichai });
    await prisma.internalNote.create({ data: { ticketId: own.id, authorId: ids.wichai, body: "NOTE-SECRET-OWN" } });
    await prisma.internalNote.create({ data: { ticketId: others.id, authorId: ids.wichai, body: "NOTE-SECRET-OTHER" } });
    const requester = await loginAs(REQUESTER_A);

    const responses = [];
    for (const ticketId of [own.id, others.id, RANDOM_UUID, "not-a-uuid"]) {
      responses.push(await requester.agent.get(notesUrl(ticketId)));
      responses.push(await postNote(requester, ticketId, "Let me write a note."));
    }

    for (const res of responses) {
      expect(res.status).toBe(403);
      expect(res.body).toEqual(FORBIDDEN);
      expect(res.text).toBe(responses[0].text);
      expect(res.text).not.toContain("NOTE-SECRET");
    }
    expect(await notesOf(own.id)).toHaveLength(1);
    expect(await notesOf(others.id)).toHaveLength(1);
  });
});

describe("no note leakage (CMN-06 - AC-47, BR-53)", () => {
  it("keeps note body, id, and count out of ticket detail, comments, and My Tickets", async () => {
    const ticket = await makeTicket({ requesterId: ids.a, status: "IN_PROGRESS", ownerId: ids.wichai });
    const staff = await loginAs(WICHAI);
    const noteA = await postNote(staff, ticket.id, "LEAKCHECK first internal remark");
    const noteB = await postNote(staff, ticket.id, "LEAKCHECK second internal remark");
    const comment = await postComment(staff, ticket.id, "A public reply for the Requester.");
    expect(noteA.status).toBe(201);
    expect(noteB.status).toBe(201);
    expect(comment.status).toBe(201);
    const requester = await loginAs(REQUESTER_A);

    const detail = await requester.agent.get(`/api/v1/tickets/${ticket.id}`);
    const comments = await requester.agent.get(commentsUrl(ticket.id));
    const myTickets = await requester.agent.get("/api/v1/tickets");

    // Each response is the real one, so the absence below means something.
    expect(detail.status).toBe(200);
    expect(detail.body.data.id).toBe(ticket.id);
    expect(comments.status).toBe(200);
    expect(comments.body.data.map((c: { id: string }) => c.id)).toEqual([comment.body.data.id]);
    expect(myTickets.status).toBe(200);
    expect(myTickets.body.data.map((t: { id: string }) => t.id)).toContain(ticket.id);

    for (const res of [detail, comments, myTickets]) {
      expect(res.text).not.toContain("LEAKCHECK");
      expect(res.text).not.toContain(noteA.body.data.id);
      expect(res.text).not.toContain(noteB.body.data.id);
      expect(keysOf(res.body).filter((key) => /note/i.test(key))).toEqual([]);
    }
  });
});

describe("body bounds over HTTP (CMN-07 - AC-48, BR-47)", () => {
  const refused: [string, unknown][] = [
    ["empty", ""],
    ["whitespace-only", "  \n\t  "],
    ["2001 characters", "x".repeat(2001)],
    ["missing", undefined],
    ["a number", 42],
  ];

  it.each(refused)("refuses a %s comment with 422 details.body and stores nothing", async (_label, body) => {
    const ticket = await makeTicket({ status: "OPEN", ownerId: ids.wichai });
    const requester = await loginAs(REQUESTER_A);

    const res = await postComment(requester, ticket.id, body);

    expect(res.status).toBe(422);
    expect(res.body).toEqual(invalidBody(COMMENT_MESSAGE));
    expect(await commentsOf(ticket.id)).toEqual([]);
  });

  it.each(refused)("refuses a %s note with 422 details.body and stores nothing", async (_label, body) => {
    const ticket = await makeTicket({ status: "OPEN", ownerId: ids.wichai });
    const staff = await loginAs(WICHAI);

    const res = await postNote(staff, ticket.id, body);

    expect(res.status).toBe(422);
    expect(res.body).toEqual(invalidBody(NOTE_MESSAGE));
    expect(await notesOf(ticket.id)).toEqual([]);
  });

  it("accepts 1 and 2000 characters for comments and notes", async () => {
    const ticket = await makeTicket({ status: "OPEN", ownerId: ids.wichai });
    const requester = await loginAs(REQUESTER_A);
    const staff = await loginAs(WICHAI);
    const long = "y".repeat(2000);

    for (const body of ["a", long]) {
      const comment = await postComment(requester, ticket.id, body);
      const note = await postNote(staff, ticket.id, body);
      expect(comment.status).toBe(201);
      expect(comment.body.data.body).toBe(body);
      expect(note.status).toBe(201);
      expect(note.body.data.body).toBe(body);
    }
  });
});

describe("CLOSED refuses, CANCELLED allows (CMN-08 - AC-43, BR-52)", () => {
  it("refuses comments and notes on a CLOSED ticket with 409 and stores nothing", async () => {
    const ticket = await makeTicket({ status: "CLOSED", ownerId: ids.wichai });
    const requester = await loginAs(REQUESTER_A);
    const staff = await loginAs(WICHAI);

    const responses = [
      await postComment(requester, ticket.id, "Still broken."),
      await postComment(staff, ticket.id, "Closing remark."),
      await postNote(staff, ticket.id, "Internal closing remark."),
    ];

    for (const res of responses) {
      expect(res.status).toBe(409);
      expect(res.body).toEqual(STATE_CONFLICT);
    }
    expect(await commentsOf(ticket.id)).toEqual([]);
    expect(await notesOf(ticket.id)).toEqual([]);
  });

  it("still lists comments and notes on a CLOSED ticket", async () => {
    const ticket = await makeTicket({ status: "CLOSED", ownerId: ids.wichai });
    await prisma.publicComment.create({ data: { ticketId: ticket.id, authorId: ids.wichai, body: "Earlier reply." } });
    await prisma.internalNote.create({ data: { ticketId: ticket.id, authorId: ids.wichai, body: "Earlier note." } });
    const requester = await loginAs(REQUESTER_A);
    const staff = await loginAs(WICHAI);

    const comments = await requester.agent.get(commentsUrl(ticket.id));
    const notes = await staff.agent.get(notesUrl(ticket.id));

    expect(comments.status).toBe(200);
    expect(comments.body.data.map((c: { body: string }) => c.body)).toEqual(["Earlier reply."]);
    expect(notes.status).toBe(200);
    expect(notes.body.data.map((n: { body: string }) => n.body)).toEqual(["Earlier note."]);
  });

  it("accepts comments and notes on a CANCELLED ticket", async () => {
    const ticket = await makeTicket({ status: "CANCELLED" });
    const requester = await loginAs(REQUESTER_A);
    const staff = await loginAs(WICHAI);

    expect((await postComment(requester, ticket.id, "Why was this cancelled?")).status).toBe(201);
    expect((await postComment(staff, ticket.id, "It duplicated another ticket.")).status).toBe(201);
    expect((await postNote(staff, ticket.id, "Duplicate of an older ticket.")).status).toBe(201);
  });
});

describe("problem appears resolved (CMN-09 - AC-26, AC-45, BR-43, BR-55)", () => {
  it("records the indication and one RESOLUTION_INDICATED event, leaves the status, and shows it to staff", async () => {
    const ticket = await makeTicket({ status: "OPEN", ownerId: ids.wichai });
    const requester = await loginAs(REQUESTER_A);
    const staff = await loginAs(WICHAI);

    const before = Date.now();
    const res = await indicateResolved(requester, ticket.id);
    const after = Date.now();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { requesterIndicatedResolvedAt: expect.stringMatching(ISO) } });
    const indicatedAt = res.body.data.requesterIndicatedResolvedAt as string;
    expect(Date.parse(indicatedAt)).toBeGreaterThanOrEqual(before - 1000);
    expect(Date.parse(indicatedAt)).toBeLessThanOrEqual(after + 1000);

    const stored = await reload(ticket.id);
    expect(stored.requesterIndicatedResolvedAt?.toISOString()).toBe(indicatedAt);
    expect(stored.currentStatus).toBe("OPEN");
    expect(stored.ownerId).toBe(ids.wichai);

    const events = await eventsOf(ticket.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventType: "RESOLUTION_INDICATED", actorId: ids.a, payload: {} });

    // IT Staff see the indication on the staff detail (api-spec 5.2). The
    // queue item is covered by QUE-01 in #39 (tests.md section 2.7 note).
    const detail = await staff.agent.get(`/api/v1/staff/tickets/${ticket.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.requesterIndicatedResolvedAt).toBe(indicatedAt);
    expect(detail.body.data.currentStatus).toBe("OPEN");
  });

  it.each(["OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"] as const)(
    "is accepted in %s",
    async (status) => {
      const ticket = await makeTicket({ status, ownerId: ids.wichai });
      const requester = await loginAs(REQUESTER_A);

      const res = await indicateResolved(requester, ticket.id);

      expect(res.status).toBe(200);
      expect((await reload(ticket.id)).currentStatus).toBe(status);
      expect((await eventsOf(ticket.id)).map((e) => e.eventType)).toEqual(["RESOLUTION_INDICATED"]);
    },
  );
});

describe("appears-resolved refusals (CMN-10 - AC-26, BR-44)", () => {
  it.each(["NEW", "RESOLVED", "CLOSED", "CANCELLED"] as const)(
    "refuses %s with 409 TICKET_STATE_CONFLICT and changes nothing",
    async (status) => {
      const ticket = await makeTicket({ status, ownerId: status === "NEW" || status === "CANCELLED" ? null : ids.wichai });
      const requester = await loginAs(REQUESTER_A);

      const res = await indicateResolved(requester, ticket.id);

      expect(res.status).toBe(409);
      expect(res.body).toEqual(STATE_CONFLICT);
      expect(await reload(ticket.id)).toEqual(ticket);
      expect(await eventsOf(ticket.id)).toEqual([]);
    },
  );

  it("refuses a second indication with 409 RESOLUTION_ALREADY_INDICATED and keeps the first", async () => {
    const ticket = await makeTicket({ status: "IN_PROGRESS", ownerId: ids.wichai });
    const requester = await loginAs(REQUESTER_A);

    const first = await indicateResolved(requester, ticket.id);
    const second = await indicateResolved(requester, ticket.id);

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(second.body).toEqual(ALREADY_INDICATED);
    expect((await reload(ticket.id)).requesterIndicatedResolvedAt?.toISOString()).toBe(
      first.body.data.requesterIndicatedResolvedAt,
    );
    expect(await eventsOf(ticket.id)).toHaveLength(1);
  });

  it("reports the status before the earlier indication on a RESOLVED ticket", async () => {
    const ticket = await makeTicket({ status: "RESOLVED", ownerId: ids.wichai, indicatedResolved: true });
    const requester = await loginAs(REQUESTER_A);

    const res = await indicateResolved(requester, ticket.id);

    expect(res.status).toBe(409);
    expect(res.body).toEqual(STATE_CONFLICT);
  });

  it("gives another Requester the same 404 as a random UUID, and 400 for a malformed id", async () => {
    const ticket = await makeTicket({ requesterId: ids.a, status: "OPEN", ownerId: ids.wichai });
    const other = await loginAs(REQUESTER_B);
    const missingTicket = await other.agent.get(`/api/v1/tickets/${RANDOM_UUID}`);

    const foreign = await indicateResolved(other, ticket.id);
    const unknown = await indicateResolved(other, RANDOM_UUID);
    const malformed = await indicateResolved(other, "not-a-uuid");

    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(NOT_FOUND);
    expect(foreign.text).toBe(missingTicket.text);
    expect(unknown.text).toBe(missingTicket.text);
    expect(malformed.status).toBe(400);
    expect(await reload(ticket.id)).toEqual(ticket);
    expect(await eventsOf(ticket.id)).toEqual([]);
  });

  it("refuses IT Staff and the Administrator with identical 403 bodies", async () => {
    const ticket = await makeTicket({ status: "OPEN", ownerId: ids.wichai });
    const staff = await loginAs(WICHAI);
    const admin = await loginAs(ADMIN);

    const responses = [
      await indicateResolved(staff, ticket.id),
      await indicateResolved(admin, ticket.id),
      await indicateResolved(staff, RANDOM_UUID),
    ];

    for (const res of responses) {
      expect(res.status).toBe(403);
      expect(res.body).toEqual(FORBIDDEN);
      expect(res.text).toBe(responses[0].text);
    }
    expect(await reload(ticket.id)).toEqual(ticket);
    expect(await eventsOf(ticket.id)).toEqual([]);
  });
});

describe("body stored verbatim (CMN-11 - AC-49, BR-49)", () => {
  const raw = "  <script>alert(1)</script>\nline two  ";
  const trimmed = "<script>alert(1)</script>\nline two";

  it("stores and returns a comment exactly as trimmed, without escaping or stripping", async () => {
    const ticket = await makeTicket({ status: "OPEN", ownerId: ids.wichai });
    const requester = await loginAs(REQUESTER_A);
    const staff = await loginAs(WICHAI);

    const res = await postComment(requester, ticket.id, raw);

    expect(res.status).toBe(201);
    expect(res.body.data.body).toBe(trimmed);
    expect((await commentsOf(ticket.id))[0].body).toBe(trimmed);
    expect((await staff.agent.get(commentsUrl(ticket.id))).body.data[0].body).toBe(trimmed);
  });

  it("stores and returns a note exactly as trimmed, without escaping or stripping", async () => {
    const ticket = await makeTicket({ status: "OPEN", ownerId: ids.wichai });
    const staff = await loginAs(WICHAI);

    const res = await postNote(staff, ticket.id, raw);

    expect(res.status).toBe(201);
    expect(res.body.data.body).toBe(trimmed);
    expect((await notesOf(ticket.id))[0].body).toBe(trimmed);
    expect((await staff.agent.get(notesUrl(ticket.id))).body.data[0].body).toBe(trimmed);
  });
});

describe("Requester detail additions (CMN-12 - AC-26)", () => {
  it("includes owner and requesterIndicatedResolvedAt, and no itPriority", async () => {
    const ticket = await makeTicket({ status: "IN_PROGRESS", ownerId: ids.wichai, indicatedResolved: true });
    const requester = await loginAs(REQUESTER_A);

    const res = await requester.agent.get(`/api/v1/tickets/${ticket.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.owner).toEqual({ id: ids.wichai, fullName: "Wichai Prasert" });
    expect(res.body.data.requesterIndicatedResolvedAt).toBe("2026-10-01T09:00:00.000Z");
    expect(res.body.data).not.toHaveProperty("itPriority");
  });

  it("returns owner null and requesterIndicatedResolvedAt null for an unassigned ticket", async () => {
    const ticket = await makeTicket({ status: "NEW" });
    const requester = await loginAs(REQUESTER_A);

    const res = await requester.agent.get(`/api/v1/tickets/${ticket.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("owner", null);
    expect(res.body.data).toHaveProperty("requesterIndicatedResolvedAt", null);
    expect(res.body.data).not.toHaveProperty("itPriority");
  });

  // Added assertion (tests.md section 2, #41): api-spec section 4, POST /tickets.
  it("adds itPriority, owner null, and requesterIndicatedResolvedAt null to the create response", async () => {
    const requester = await loginAs(REQUESTER_A);

    const res = await requester.agent.post("/api/v1/tickets").send({
      categoryId,
      relatedSystemId,
      summary: `${MARKER} create response check`,
      requestedPriority: "HIGH",
      description: "The create response must echo the stored IT Priority and owner.",
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty("itPriority", "HIGH");
    expect(res.body.data).toHaveProperty("owner", null);
    expect(res.body.data).toHaveProperty("requesterIndicatedResolvedAt", null);
  });
});
