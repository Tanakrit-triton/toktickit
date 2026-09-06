import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

// API-01 .. API-09 from docs/lab-02/tests.md section 2.2.
//
// POST /api/v1/tickets is the first Scoped endpoint in the sprint, so it is
// also the first route the X-Dev-Requester-Id middleware from #14 can be proved
// against: API-08 and API-09 live here for that reason.
//
// Every expected value below is a constant declared in this file. Nothing
// asserts a count read back from prisma, because an expectation derived from
// the same source it is testing cannot fail.

const prisma = getPrisma();

// Marks rows this suite creates so cleanup cannot touch anything else.
const MARKER = "[api-test-16]";

const INACTIVE_CATEGORY = "ZZ Retired Category (create-ticket fixture)";

let requesterId = "";
let otherRequesterId = "";
let inactiveRequesterId = "";
let categoryId = 0;
let categoryName = "";
let relatedSystemId = 0;
let relatedSystemName = "";
let inactiveCategoryId = 0;

/** A body that passes every rule, so each test can spoil exactly one thing. */
function validBody(overrides: Record<string, unknown> = {}) {
  return {
    categoryId,
    relatedSystemId,
    summary: MARKER + " Laptop battery drains within one hour",
    requestedPriority: "HIGH",
    description:
      "Since the last Windows update the battery drops from 100% to 5% in about an hour, even with only a browser open.",
    ...overrides,
  };
}

const post = (body: Record<string, unknown>, header: string | null = requesterId) => {
  const req = request(app).post("/api/v1/tickets");
  return header === null ? req.send(body) : req.set("X-Dev-Requester-Id", header).send(body);
};

beforeAll(async () => {
  const active = await prisma.requesterUser.findMany({
    where: { isActive: true },
    orderBy: { fullName: "asc" },
    select: { id: true },
  });
  expect(active.length, "seed must provide at least two active Requesters").toBeGreaterThan(1);
  requesterId = active[0].id;
  otherRequesterId = active[1].id;

  const inactive = await prisma.requesterUser.findFirst({ where: { isActive: false } });
  expect(inactive, "seed must provide an inactive Requester fixture").not.toBeNull();
  inactiveRequesterId = inactive!.id;

  const category = await prisma.category.findFirst({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  const system = await prisma.relatedSystem.findFirst({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  expect(category, "seed must provide an active Category").not.toBeNull();
  expect(system, "seed must provide an active Related System").not.toBeNull();
  categoryId = category!.id;
  categoryName = category!.name;
  relatedSystemId = system!.id;
  relatedSystemName = system!.name;

  const retired = await prisma.category.upsert({
    where: { name: INACTIVE_CATEGORY },
    update: { isActive: false },
    create: { name: INACTIVE_CATEGORY, isActive: false },
  });
  inactiveCategoryId = retired.id;
});

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { summary: { contains: MARKER } } });
  await prisma.category.deleteMany({ where: { name: INACTIVE_CATEGORY } });
  await prisma.$disconnect();
});

describe("POST /api/v1/tickets (API-01 - AC-07, AC-09)", () => {
  it("creates one Ticket and returns the generated Ticket Number", async () => {
    const response = await post(validBody());

    expect(response.status).toBe(201);
    const ticket = response.body.data;

    const year = new Date().getUTCFullYear();
    // Literal regex: a pattern built by string concatenation loses its
    // escapes and silently matches the wrong thing.
    expect(ticket.ticketNumber).toMatch(/^TKT-\d{4}-\d{5}$/);
    expect(ticket.ticketNumber.startsWith("TKT-" + year + "-")).toBe(true);

    const saved = await prisma.ticket.findUnique({
      where: { ticketNumber: ticket.ticketNumber },
    });
    expect(saved, "the returned Ticket Number must identify a stored row").not.toBeNull();
    expect(saved!.id).toBe(ticket.id);

    expect(ticket.category).toEqual({ id: categoryId, name: categoryName });
    expect(ticket.relatedSystem).toEqual({ id: relatedSystemId, name: relatedSystemName });
    expect(ticket.ticketDate).toBe(ticket.createdAt);
  });
});

describe("POST /api/v1/tickets (API-02 - AC-08)", () => {
  it("owns the Ticket to the header Requester and starts it at NEW", async () => {
    const response = await post(validBody());

    expect(response.status).toBe(201);
    expect(response.body.data.currentStatus).toBe("NEW");
    expect(response.body.data.requester.id).toBe(requesterId);

    const saved = await prisma.ticket.findUnique({
      where: { ticketNumber: response.body.data.ticketNumber },
    });
    expect(saved!.requesterId).toBe(requesterId);
    expect(saved!.currentStatus).toBe("NEW");
  });
});

describe("POST /api/v1/tickets (API-03 - AC-10)", () => {
  it("gives two consecutive Tickets different numbers", async () => {
    const first = await post(validBody());
    const second = await post(validBody());

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.ticketNumber).not.toBe(first.body.data.ticketNumber);
  });
});

describe("POST /api/v1/tickets (API-04 - AC-12, AC-13)", () => {
  it("rejects a missing summary with a field-level message", async () => {
    const { summary, ...withoutSummary } = validBody();
    void summary;

    const response = await post(withoutSummary);

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.details.summary).toEqual(expect.any(String));
  });

  it("rejects a 9-character summary and accepts 10", async () => {
    const short = await post(validBody({ summary: "x".repeat(9) }));
    expect(short.status).toBe(422);
    expect(short.body.error.details.summary).toEqual(expect.any(String));

    const ok = await post(validBody({ summary: MARKER + " " + "x".repeat(10) }));
    expect(ok.status).toBe(201);
  });
});

describe("POST /api/v1/tickets (API-05 - AC-14)", () => {
  it("reports every failing field in one response", async () => {
    const response = await post({
      summary: "short",
      requestedPriority: "CRITICAL",
      description: "too short",
    });

    expect(response.status).toBe(422);
    // All five, in one pass, so the Requester can fix everything at once (BR-26).
    expect(Object.keys(response.body.error.details).sort()).toEqual([
      "categoryId",
      "description",
      "relatedSystemId",
      "requestedPriority",
      "summary",
    ]);
  });
});

describe("POST /api/v1/tickets (API-06 - BR-08)", () => {
  it("ignores a requesterId in the body and owns the Ticket to the header", async () => {
    const response = await post(validBody({ requesterId: otherRequesterId }));

    expect(response.status).toBe(201);
    expect(response.body.data.requester.id).toBe(requesterId);

    const saved = await prisma.ticket.findUnique({
      where: { ticketNumber: response.body.data.ticketNumber },
    });
    expect(saved!.requesterId).toBe(requesterId);
    expect(saved!.requesterId).not.toBe(otherRequesterId);
  });
});

describe("POST /api/v1/tickets (API-07 - BR-22)", () => {
  it("rejects an inactive Category", async () => {
    const response = await post(validBody({ categoryId: inactiveCategoryId }));

    expect(response.status).toBe(422);
    expect(response.body.error.details.categoryId).toEqual(expect.any(String));
  });

  it("rejects a Category that does not exist", async () => {
    const response = await post(validBody({ categoryId: 987654321 }));

    expect(response.status).toBe(422);
    expect(response.body.error.details.categoryId).toEqual(expect.any(String));
  });
});

describe("POST /api/v1/tickets (API-08 - BR-11)", () => {
  it("returns 428 when the Scoped request carries no X-Dev-Requester-Id", async () => {
    const response = await post(validBody(), null);

    expect(response.status).toBe(428);
    expect(response.body.error.code).toBe("REQUESTER_NOT_SELECTED");
    expect(response.body.error).not.toHaveProperty("details");
  });

  it("returns 428 when the header names a Requester that does not exist", async () => {
    const response = await post(validBody(), "3f8b0c22-0000-4000-8000-000000000000");

    expect(response.status).toBe(428);
    expect(response.body.error.code).toBe("REQUESTER_NOT_SELECTED");
  });
});

describe("POST /api/v1/tickets (API-09 - BR-13)", () => {
  it("returns 403 when the header names an inactive Requester", async () => {
    const response = await post(validBody(), inactiveRequesterId);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("REQUESTER_INACTIVE");
  });

  it("creates nothing when the Requester is refused", async () => {
    await post(validBody(), inactiveRequesterId);

    // The inactive Requester is never a ticket owner, so zero is the only
    // correct answer here and it is stated outright rather than compared to a
    // count taken moments earlier.
    const owned = await prisma.ticket.count({ where: { requesterId: inactiveRequesterId } });
    expect(owned).toBe(0);
  });
});

describe("POST /api/v1/tickets (API-41 - BR-05)", () => {
  // Concurrent allocation. BR-05 requires that no gap or duplicate can result
  // from concurrent creation, which the transaction alone does not deliver: a
  // value computed in application code from a stale read lets two requests
  // reach the same number, and only the unique constraint stops one of them
  // reaching the table.
  const PARALLEL = 8;

  it("gives every concurrent creation a distinct number and leaves no gap", async () => {
    const responses = await Promise.all(
      Array.from({ length: PARALLEL }, () => post(validBody())),
    );

    const failed = responses.filter((r) => r.status !== 201);
    expect(
      failed.map((r) => `${r.status} ${JSON.stringify(r.body)}`),
      "every concurrent creation must succeed, not lose a race",
    ).toEqual([]);

    const numbers = responses.map((r) => r.body.data.ticketNumber as string);
    expect(new Set(numbers).size, "ticket numbers must be distinct").toBe(PARALLEL);

    // Contiguous: the allocated suffixes form an unbroken run, so no value was
    // consumed and thrown away.
    const suffixes = numbers.map((n) => Number(n.slice(-5))).sort((a, b) => a - b);
    expect(suffixes[suffixes.length - 1] - suffixes[0]).toBe(PARALLEL - 1);

    const sequence = await prisma.ticketNumberSequence.findUnique({
      where: { year: new Date().getUTCFullYear() },
    });
    expect(sequence!.lastValue).toBe(suffixes[suffixes.length - 1]);
  });
});
