import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

// API-20 .. API-23 from docs/lab-02/tests.md section 2.2.

const prisma = getPrisma();

const OWNER_EMAIL = "zz.detail.owner@kmutt.ac.th";
const OTHER_EMAIL = "zz.detail.other@kmutt.ac.th";

const SUMMARY = "Detail fixture ticket for API-20";
const DESCRIPTION = "A description long enough to satisfy the twenty character minimum for a ticket.";

let ownerId = "";
let otherId = "";
let ownedTicketId = "";
let foreignTicketId = "";

beforeAll(async () => {
  const owner = await prisma.requesterUser.upsert({
    where: { email: OWNER_EMAIL },
    update: { isActive: true },
    create: { fullName: "ZZ Detail Owner", email: OWNER_EMAIL, isActive: true },
  });
  const other = await prisma.requesterUser.upsert({
    where: { email: OTHER_EMAIL },
    update: { isActive: true },
    create: { fullName: "ZZ Detail Other", email: OTHER_EMAIL, isActive: true },
  });
  ownerId = owner.id;
  otherId = other.id;

  const category = await prisma.category.findFirst({ where: { isActive: true } });
  const system = await prisma.relatedSystem.findFirst({ where: { isActive: true } });
  expect(category, "seed must provide an active Category").not.toBeNull();
  expect(system, "seed must provide an active Related System").not.toBeNull();

  await prisma.ticket.deleteMany({ where: { requesterId: { in: [ownerId, otherId] } } });

  const base = {
    categoryId: category!.id,
    relatedSystemId: system!.id,
    description: DESCRIPTION,
    requestedPriority: "HIGH" as const,
  };

  const owned = await prisma.ticket.create({
    data: { ...base, ticketNumber: "TKT-2026-97001", requesterId: ownerId, summary: SUMMARY },
  });
  const foreign = await prisma.ticket.create({
    data: {
      ...base,
      ticketNumber: "TKT-2026-97002",
      requesterId: otherId,
      summary: "Another requester's detail ticket",
    },
  });
  ownedTicketId = owned.id;
  foreignTicketId = foreign.id;
});

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { requesterId: { in: [ownerId, otherId] } } });
  await prisma.requesterUser.deleteMany({ where: { email: { in: [OWNER_EMAIL, OTHER_EMAIL] } } });
  await prisma.$disconnect();
});

describe("GET /api/v1/tickets/{id} (API-20 - AC-26)", () => {
  it("returns the full Ticket with its attachment list", async () => {
    const response = await request(app)
      .get(`/api/v1/tickets/${ownedTicketId}`)
      .set("X-Dev-Requester-Id", ownerId);

    expect(response.status).toBe(200);
    const ticket = response.body.data;

    expect(ticket.id).toBe(ownedTicketId);
    expect(ticket.ticketNumber).toBe("TKT-2026-97001");
    expect(ticket.summary).toBe(SUMMARY);
    // Detail carries the description that the list omits.
    expect(ticket.description).toBe(DESCRIPTION);
    expect(ticket.currentStatus).toBe("NEW");
    expect(ticket.ticketDate).toBe(ticket.createdAt);
    expect(ticket.requester.id).toBe(ownerId);
    expect(Array.isArray(ticket.attachments)).toBe(true);
    expect(ticket.attachments).toEqual([]);
  });
});

describe("GET /api/v1/tickets/{id} (API-21, API-22 - AC-27)", () => {
  it("answers a foreign Ticket and a missing Ticket identically", async () => {
    const missingId = "3f8b0c22-0000-4000-8000-000000000000";

    const foreign = await request(app)
      .get(`/api/v1/tickets/${foreignTicketId}`)
      .set("X-Dev-Requester-Id", ownerId);
    const missing = await request(app)
      .get(`/api/v1/tickets/${missingId}`)
      .set("X-Dev-Requester-Id", ownerId);

    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);

    // Byte-identical. Any difference at all -- a code, a word, a field -- tells
    // Requester B that Requester A's ticket exists (BR-18, DEC-01).
    expect(JSON.stringify(foreign.body)).toBe(JSON.stringify(missing.body));
    expect(foreign.body.error.code).toBe("NOT_FOUND");
  });

  it("does not leak the foreign Ticket's contents in the refusal", async () => {
    const response = await request(app)
      .get(`/api/v1/tickets/${foreignTicketId}`)
      .set("X-Dev-Requester-Id", ownerId);

    // Guard first: an assertion that something is ABSENT passes against any
    // empty response, including a 404 from a route that does not exist. This
    // pins the refusal to our handler before checking what it withheld.
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");

    const body = JSON.stringify(response.body);
    expect(body).not.toContain("TKT-2026-97002");
    expect(body).not.toContain("Another requester");
    expect(body).not.toContain(otherId);
  });
});

describe("GET /api/v1/tickets/{id} (API-23 - api-spec 3.3)", () => {
  it("rejects a malformed identifier with 400, not 500", async () => {
    const response = await request(app)
      .get("/api/v1/tickets/not-a-uuid")
      .set("X-Dev-Requester-Id", ownerId);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("BAD_REQUEST");
  });
});
