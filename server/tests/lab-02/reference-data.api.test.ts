import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { loginAs, type SignedIn } from "../helpers/session.js";

// API-38 and API-39 from docs/lab-02/tests.md section 2.2. API-40 tested
// GET /dev-requesters, which #37 removed; AUZ-04 supersedes it
// (docs/lab-03/tests.md section 4.1).
//
// The seed provides only active Categories and Related Systems, so this suite
// creates one inactive record of each, asserts it never surfaces, and removes
// it again.
//
// Since Lab 3 #37 the reference data needs a session, so API-38 and API-39
// sign in through loginAs() (docs/lab-03/tests.md REG-01). Assertions are
// unchanged.

const prisma = getPrisma();

const INACTIVE_CATEGORY = "ZZ Retired Category (test fixture)";
const INACTIVE_SYSTEM = "ZZ Decommissioned System (test fixture)";

let requester: SignedIn;

beforeAll(async () => {
  requester = await loginAs("napat.cha@kmutt.ac.th");
  await prisma.category.upsert({
    where: { name: INACTIVE_CATEGORY },
    update: { isActive: false },
    create: { name: INACTIVE_CATEGORY, isActive: false },
  });
  await prisma.relatedSystem.upsert({
    where: { name: INACTIVE_SYSTEM },
    update: { isActive: false },
    create: { name: INACTIVE_SYSTEM, isActive: false },
  });
});

afterAll(async () => {
  await prisma.category.deleteMany({ where: { name: INACTIVE_CATEGORY } });
  await prisma.relatedSystem.deleteMany({ where: { name: INACTIVE_SYSTEM } });
  await prisma.$disconnect();
});

// A non-empty result is asserted before anything else in every case below.
//
// Without it these assertions pass on an empty array and prove nothing:
// toHaveLength(n) where n is read from the same source succeeds at 0 === 0, a
// not.toContain check succeeds against no elements, and a for...of loop over
// the rows runs zero times. This suite was green against a database whose
// Requesters were all inactive, which is a database that renders an empty
// selector.
function expectNonEmpty(data: unknown, what: string): asserts data is unknown[] {
  expect(Array.isArray(data), `${what}: response.data must be an array`).toBe(true);
  expect(
    (data as unknown[]).length,
    `${what}: expected at least one row. An empty result makes every assertion below vacuous, so it is a failure here, not a pass.`,
  ).toBeGreaterThan(0);
}

describe("GET /api/v1/categories (API-38 - AC-11)", () => {
  it("returns active Categories only, inactive absent, sorted by name", async () => {
    const response = await requester.agent.get("/api/v1/categories");

    expect(response.status).toBe(200);
    expect(Object.keys(response.body)).toEqual(["data"]);
    expectNonEmpty(response.body.data, "categories");

    const names = response.body.data.map((c: { name: string }) => c.name);
    expect(names).not.toContain(INACTIVE_CATEGORY);
    expect(names).toContain("Hardware");
    expect(names).toEqual([...names].sort());
  });

  it("exposes only id and name on each Category", async () => {
    const response = await requester.agent.get("/api/v1/categories");

    expectNonEmpty(response.body.data, "categories");

    for (const category of response.body.data) {
      expect(Object.keys(category).sort()).toEqual(["id", "name"]);
    }
  });
});

describe("GET /api/v1/related-systems (API-39 - AC-11)", () => {
  it("returns active Related Systems only, inactive absent, sorted by name", async () => {
    const response = await requester.agent.get("/api/v1/related-systems");

    expect(response.status).toBe(200);
    expect(Object.keys(response.body)).toEqual(["data"]);
    expectNonEmpty(response.body.data, "related systems");

    const names = response.body.data.map((s: { name: string }) => s.name);
    expect(names).not.toContain(INACTIVE_SYSTEM);
    expect(names).toContain("Email");
    expect(names).toEqual([...names].sort());
  });
});

