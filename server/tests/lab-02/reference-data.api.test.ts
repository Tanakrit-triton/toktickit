import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

// API-38, API-39, API-40 from docs/lab-02/tests.md section 2.2.
//
// The seed provides only active Categories and Related Systems, so this suite
// creates one inactive record of each, asserts it never surfaces, and removes
// it again. The inactive Requester is already a seeded fixture (AC-01, BR-13)
// and is not created here.

const prisma = getPrisma();

const INACTIVE_CATEGORY = "ZZ Retired Category (test fixture)";
const INACTIVE_SYSTEM = "ZZ Decommissioned System (test fixture)";

beforeAll(async () => {
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

describe("GET /api/v1/categories (API-38 - AC-11)", () => {
  it("returns active Categories only, inactive absent, sorted by name", async () => {
    const response = await request(app).get("/api/v1/categories");

    expect(response.status).toBe(200);
    expect(Object.keys(response.body)).toEqual(["data"]);

    const names = response.body.data.map((c: { name: string }) => c.name);
    expect(names).not.toContain(INACTIVE_CATEGORY);
    expect(names).toContain("Hardware");
    expect(names).toEqual([...names].sort());
  });

  it("exposes only id and name on each Category", async () => {
    const response = await request(app).get("/api/v1/categories");

    for (const category of response.body.data) {
      expect(Object.keys(category).sort()).toEqual(["id", "name"]);
    }
  });
});

describe("GET /api/v1/related-systems (API-39 - AC-11)", () => {
  it("returns active Related Systems only, inactive absent, sorted by name", async () => {
    const response = await request(app).get("/api/v1/related-systems");

    expect(response.status).toBe(200);
    expect(Object.keys(response.body)).toEqual(["data"]);

    const names = response.body.data.map((s: { name: string }) => s.name);
    expect(names).not.toContain(INACTIVE_SYSTEM);
    expect(names).toContain("Email");
    expect(names).toEqual([...names].sort());
  });
});

describe("GET /api/v1/dev-requesters (API-40 - AC-01, BR-10)", () => {
  it("omits the seeded inactive Requester", async () => {
    const inactive = await prisma.requesterUser.findFirst({
      where: { isActive: false },
    });
    expect(inactive, "seed must provide an inactive Requester fixture").not.toBeNull();

    const response = await request(app).get("/api/v1/dev-requesters");

    expect(response.status).toBe(200);
    const ids = response.body.data.map((r: { id: string }) => r.id);
    expect(ids).not.toContain(inactive!.id);
  });

  it("returns every active Requester, sorted by fullName", async () => {
    const activeCount = await prisma.requesterUser.count({ where: { isActive: true } });

    const response = await request(app).get("/api/v1/dev-requesters");

    expect(response.body.data).toHaveLength(activeCount);
    const names = response.body.data.map((r: { fullName: string }) => r.fullName);
    expect(names).toEqual([...names].sort());
  });

  it("exposes only id, fullName, and email on each Requester", async () => {
    const response = await request(app).get("/api/v1/dev-requesters");

    for (const requester of response.body.data) {
      expect(Object.keys(requester).sort()).toEqual(["email", "fullName", "id"]);
    }
  });
});
