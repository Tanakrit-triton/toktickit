import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { loginAs, type SignedIn } from "../helpers/session.js";

// API-01 .. API-07 and API-41 from docs/lab-02/tests.md section 2.2.
//
// Since Lab 3 #37 these tests sign in through loginAs() instead of sending
// X-Dev-Requester-Id (docs/lab-03/tests.md REG-01). Assertions are unchanged.
// API-08 and API-09 tested that header and were superseded by AUZ-01, AUZ-14,
// and API-03 (docs/lab-03/tests.md section 4.1).
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
let categoryId = 0;
let categoryName = "";
let relatedSystemId = 0;
let relatedSystemName = "";
let inactiveCategoryId = 0;
let requester: SignedIn;

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

const create = (body: Record<string, unknown>) => requester.agent.post("/api/v1/tickets").send(body);

beforeAll(async () => {
  // role: REQUESTER since Lab 3 #35, when the table began holding IT Staff and
  // Administrators too (docs/lab-03/tests.md section 4.2). mustChangePassword:
  // false since #37, because the must-change fixture cannot use /tickets.
  const active = await prisma.user.findMany({
    where: { isActive: true, role: "REQUESTER", mustChangePassword: false },
    orderBy: { fullName: "asc" },
    select: { id: true, email: true },
  });
  expect(active.length, "seed must provide at least two active Requesters").toBeGreaterThan(1);
  requesterId = active[0].id;
  otherRequesterId = active[1].id;
  requester = await loginAs(active[0].email);

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
    const response = await create(validBody());

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
    const response = await create(validBody());

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
    const first = await create(validBody());
    const second = await create(validBody());

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.ticketNumber).not.toBe(first.body.data.ticketNumber);
  });
});

describe("POST /api/v1/tickets (API-04 - AC-12, AC-13)", () => {
  it("rejects a missing summary with a field-level message", async () => {
    const { summary, ...withoutSummary } = validBody();
    void summary;

    const response = await create(withoutSummary);

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.details.summary).toEqual(expect.any(String));
  });

  it("rejects a 9-character summary and accepts 10", async () => {
    const short = await create(validBody({ summary: "x".repeat(9) }));
    expect(short.status).toBe(422);
    expect(short.body.error.details.summary).toEqual(expect.any(String));

    const ok = await create(validBody({ summary: MARKER + " " + "x".repeat(10) }));
    expect(ok.status).toBe(201);
  });
});

describe("POST /api/v1/tickets (API-05 - AC-14)", () => {
  it("reports every failing field in one response", async () => {
    const response = await create({
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
    const response = await create(validBody({ requesterId: otherRequesterId }));

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
    const response = await create(validBody({ categoryId: inactiveCategoryId }));

    expect(response.status).toBe(422);
    expect(response.body.error.details.categoryId).toEqual(expect.any(String));
  });

  it("rejects a Category that does not exist", async () => {
    const response = await create(validBody({ categoryId: 987654321 }));

    expect(response.status).toBe(422);
    expect(response.body.error.details.categoryId).toEqual(expect.any(String));
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
      Array.from({ length: PARALLEL }, () => create(validBody())),
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
