import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

// API-10 .. API-19 from docs/lab-02/tests.md section 2.2.
//
// This suite creates its OWN Requesters and its own Tickets, rather than
// filtering seeded data, so every expected count is a constant declared here.
// Asserting against prisma.ticket.count() would compare the endpoint to the
// same source it reads from, which cannot fail.
//
// Pimchanok Sonthi is the empty-list fixture for AC-24 and is never given a
// ticket by anything in this file.

const prisma = getPrisma();

const OWNER_EMAIL = "zz.list.owner@kmutt.ac.th";
const OTHER_EMAIL = "zz.list.other@kmutt.ac.th";
const MARKER = "[api-test-17]";

// The fixture set. Every count asserted below is derived from these literals
// by hand, not by querying.
const TOTAL = 12;
const URGENT_COUNT = 3;
const BATTERY_COUNT = 4; // summaries containing "battery"
const PAGE_SIZE = 10;

let ownerId = "";
let otherId = "";
let categoryA = 0;
let categoryB = 0;
let systemA = 0;

/** Distinct, ordered creation times so sort assertions are unambiguous. */
const createdAtFor = (index: number) => new Date(Date.UTC(2026, 0, 1 + index, 12, 0, 0));

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

const get = (query: string, header: string | null = ownerId) => {
  const req = request(app).get(`/api/v1/tickets${query}`);
  return header === null ? req : req.set("X-Dev-Requester-Id", header);
};

beforeAll(async () => {
  const owner = await prisma.requesterUser.upsert({
    where: { email: OWNER_EMAIL },
    update: { isActive: true },
    create: { fullName: "ZZ List Owner", email: OWNER_EMAIL, isActive: true },
  });
  const other = await prisma.requesterUser.upsert({
    where: { email: OTHER_EMAIL },
    update: { isActive: true },
    create: { fullName: "ZZ List Other", email: OTHER_EMAIL, isActive: true },
  });
  ownerId = owner.id;
  otherId = other.id;

  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    take: 2,
  });
  const system = await prisma.relatedSystem.findFirst({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  expect(categories.length, "seed must provide two active Categories").toBe(2);
  expect(system, "seed must provide an active Related System").not.toBeNull();
  categoryA = categories[0].id;
  categoryB = categories[1].id;
  systemA = system!.id;

  await prisma.ticket.deleteMany({ where: { requesterId: { in: [ownerId, otherId] } } });

  // 12 tickets: priorities cycle LOW, MEDIUM, HIGH, URGENT (so 3 URGENT), and
  // every fourth summary mentions a battery (so 4 of them).
  for (let i = 0; i < TOTAL; i += 1) {
    await prisma.ticket.create({
      data: {
        ticketNumber: `TKT-2026-9${String(i).padStart(4, "0")}`,
        requesterId: ownerId,
        categoryId: i % 2 === 0 ? categoryA : categoryB,
        relatedSystemId: systemA,
        summary:
          i % 3 === 0
            ? `${MARKER} Laptop battery drains fast number ${i}`
            : `${MARKER} Campus wifi keeps dropping number ${i}`,
        description: "A description long enough to satisfy the twenty character minimum.",
        requestedPriority: PRIORITIES[i % 4],
        createdAt: createdAtFor(i),
        updatedAt: createdAtFor(i),
      },
    });
  }

  // One ticket owned by somebody else, to prove scoping.
  await prisma.ticket.create({
    data: {
      ticketNumber: "TKT-2026-98888",
      requesterId: otherId,
      categoryId: categoryA,
      relatedSystemId: systemA,
      summary: `${MARKER} Another requester ticket`,
      description: "A description long enough to satisfy the twenty character minimum.",
      requestedPriority: "URGENT",
      createdAt: createdAtFor(99),
      updatedAt: createdAtFor(99),
    },
  });
});

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { requesterId: { in: [ownerId, otherId] } } });
  await prisma.requesterUser.deleteMany({ where: { email: { in: [OWNER_EMAIL, OTHER_EMAIL] } } });
  await prisma.$disconnect();
});

describe("GET /api/v1/tickets (API-10 - AC-18)", () => {
  it("returns only the header Requester's Tickets", async () => {
    const response = await get("?pageSize=50");

    expect(response.status).toBe(200);
    expect(response.body.meta.totalItems).toBe(TOTAL);
    expect(response.body.data).toHaveLength(TOTAL);

    const numbers = response.body.data.map((t: { ticketNumber: string }) => t.ticketNumber);
    expect(numbers).not.toContain("TKT-2026-98888");
  });

  it("omits description from list items and reports an active attachment count", async () => {
    const response = await get("");

    const first = response.body.data[0];
    expect(first).not.toHaveProperty("description");
    expect(first.attachmentCount).toBe(0);
    expect(Object.keys(first).sort()).toEqual([
      "attachmentCount",
      "category",
      "createdAt",
      "currentStatus",
      "id",
      "relatedSystem",
      "requestedPriority",
      "summary",
      "ticketNumber",
      "updatedAt",
    ]);
  });
});

describe("GET /api/v1/tickets (API-11 - AC-19)", () => {
  it("matches a summary substring case-insensitively", async () => {
    const response = await get("?q=BATTERY&pageSize=50");

    expect(response.status).toBe(200);
    expect(response.body.meta.totalItems).toBe(BATTERY_COUNT);
    for (const ticket of response.body.data) {
      expect(ticket.summary.toLowerCase()).toContain("battery");
    }
  });

  it("treats a whitespace-only search as absent", async () => {
    const response = await get("?q=%20%20&pageSize=50");

    expect(response.status).toBe(200);
    expect(response.body.meta.totalItems).toBe(TOTAL);
  });
});

describe("GET /api/v1/tickets (API-12 - BR-45)", () => {
  it("matches a partial ticket number", async () => {
    const response = await get("?q=9000&pageSize=50");

    expect(response.status).toBe(200);
    const numbers = response.body.data.map((t: { ticketNumber: string }) => t.ticketNumber);
    expect(numbers).toContain("TKT-2026-90000");
    expect(response.body.meta.totalItems).toBeGreaterThan(0);
  });
});

describe("GET /api/v1/tickets (API-13 - AC-20)", () => {
  it("returns only Tickets in the filtered Category", async () => {
    const response = await get(`?categoryId=${categoryA}&pageSize=50`);

    expect(response.status).toBe(200);
    // Even indices took categoryA, so half of twelve.
    expect(response.body.meta.totalItems).toBe(TOTAL / 2);
    for (const ticket of response.body.data) {
      expect(ticket.category.id).toBe(categoryA);
    }
  });
});

describe("GET /api/v1/tickets (API-14 - AC-21)", () => {
  it("sorts by severity, not alphabetically, on descending priority", async () => {
    const response = await get("?sortBy=requestedPriority&sortOrder=desc&pageSize=50");

    expect(response.status).toBe(200);
    const order = response.body.data.map((t: { requestedPriority: string }) => t.requestedPriority);

    // Alphabetical descending would be MEDIUM, LOW, HIGH, URGENT. Severity
    // descending is URGENT first and LOW last, which is what BR-44 requires.
    expect(order.slice(0, URGENT_COUNT)).toEqual(Array(URGENT_COUNT).fill("URGENT"));
    expect(order[order.length - 1]).toBe("LOW");

    const rank = { LOW: 0, MEDIUM: 1, HIGH: 2, URGENT: 3 } as const;
    const ranks = order.map((p: keyof typeof rank) => rank[p]);
    expect(ranks).toEqual([...ranks].sort((a: number, b: number) => b - a));
  });
});

describe("GET /api/v1/tickets (API-15 - AC-22)", () => {
  it("returns the next set on page 2 with correct pagination metadata", async () => {
    const first = await get(`?page=1&pageSize=${PAGE_SIZE}`);
    const second = await get(`?page=2&pageSize=${PAGE_SIZE}`);

    expect(first.status).toBe(200);
    expect(first.body.data).toHaveLength(PAGE_SIZE);
    expect(first.body.meta).toEqual({
      page: 1,
      pageSize: PAGE_SIZE,
      totalItems: TOTAL,
      totalPages: 2,
    });

    expect(second.body.data).toHaveLength(TOTAL - PAGE_SIZE);
    expect(second.body.meta.page).toBe(2);

    // No ticket appears on both pages.
    const firstIds = first.body.data.map((t: { id: string }) => t.id);
    const secondIds = second.body.data.map((t: { id: string }) => t.id);
    expect(firstIds.filter((id: string) => secondIds.includes(id))).toEqual([]);
  });
});

describe("GET /api/v1/tickets (API-16 - AC-23)", () => {
  it("rejects an unsupported page size rather than defaulting it", async () => {
    const response = await get("?pageSize=25");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("BAD_REQUEST");
    // Silently returning ten rows would hide the client defect (BR-46, DEC-03).
    expect(response.body).not.toHaveProperty("data");
  });

  it("accepts exactly the three permitted page sizes", async () => {
    for (const size of [10, 20, 50]) {
      const response = await get(`?pageSize=${size}`);
      expect(response.status, `pageSize=${size} should be accepted`).toBe(200);
      expect(response.body.meta.pageSize).toBe(size);
    }
  });
});

describe("GET /api/v1/tickets (API-17 - BR-47)", () => {
  it("rejects a parameter that is not in the contract", async () => {
    const response = await get("?sortDirection=desc");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("BAD_REQUEST");
  });

  it("rejects invalid values for known parameters", async () => {
    for (const query of [
      "?page=0",
      "?page=-1",
      "?page=abc",
      "?sortBy=summary",
      "?sortOrder=sideways",
      "?requestedPriority=CRITICAL",
      "?categoryId=notanumber",
    ]) {
      const response = await get(query);
      expect(response.status, `${query} should be rejected`).toBe(400);
    }
  });
});

describe("GET /api/v1/tickets (API-18 - BR-48)", () => {
  it("returns an empty page beyond the last, not an error", async () => {
    const response = await get(`?page=99&pageSize=${PAGE_SIZE}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.meta).toEqual({
      page: 99,
      pageSize: PAGE_SIZE,
      totalItems: TOTAL,
      totalPages: 2,
    });
  });
});

describe("GET /api/v1/tickets (API-19 - BR-43)", () => {
  it("defaults to newest first", async () => {
    const response = await get("?pageSize=50");

    const times = response.body.data.map((t: { createdAt: string }) => Date.parse(t.createdAt));
    expect(times).toEqual([...times].sort((a: number, b: number) => b - a));
  });

  it("orders stably across pages, so no ticket is skipped or repeated", async () => {
    // Every fixture ticket shares a priority with two others, so sorting by
    // priority alone is ambiguous. A stable secondary key is what stops a row
    // appearing on both pages or on neither.
    const query = "sortBy=requestedPriority&sortOrder=desc";
    const first = await get(`?${query}&page=1&pageSize=${PAGE_SIZE}`);
    const second = await get(`?${query}&page=2&pageSize=${PAGE_SIZE}`);

    const seen = [
      ...first.body.data.map((t: { id: string }) => t.id),
      ...second.body.data.map((t: { id: string }) => t.id),
    ];
    expect(seen).toHaveLength(TOTAL);
    expect(new Set(seen).size).toBe(TOTAL);
  });

  it("returns the same order when the same query is repeated", async () => {
    const a = await get("?sortBy=requestedPriority&sortOrder=desc&pageSize=50");
    const b = await get("?sortBy=requestedPriority&sortOrder=desc&pageSize=50");

    expect(a.body.data.map((t: { id: string }) => t.id)).toEqual(
      b.body.data.map((t: { id: string }) => t.id),
    );
  });
});

describe("GET /api/v1/tickets (API-42 - FR-18)", () => {
  it("returns only Tickets on the filtered Related System", async () => {
    // Every fixture ticket uses the same Related System, so a filter that was
    // silently ignored would return all twelve and look identical to a filter
    // that worked. The negative case below is what separates them.
    const matching = await get(`?relatedSystemId=${systemA}&pageSize=50`);

    expect(matching.status).toBe(200);
    expect(matching.body.meta.totalItems).toBe(TOTAL);
    for (const ticket of matching.body.data) {
      expect(ticket.relatedSystem.id).toBe(systemA);
    }
  });

  it("returns nothing for a Related System no Ticket uses", async () => {
    const other = await prisma.relatedSystem.findFirst({
      where: { isActive: true, id: { not: systemA } },
      orderBy: { name: "asc" },
    });
    expect(other, "seed must provide a second Related System").not.toBeNull();

    const response = await get(`?relatedSystemId=${other!.id}&pageSize=50`);

    expect(response.status).toBe(200);
    expect(response.body.meta.totalItems).toBe(0);
    expect(response.body.data).toEqual([]);
  });
});
