import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { resetLoginThrottle } from "../../src/lab-03/login-throttle.js";
import { verifyPassword } from "../../src/lab-03/password-hash.js";
import { loginAs, seedPassword, signInFields, type SignedIn } from "../helpers/session.js";

// ADM-01 to ADM-14 from docs/lab-03/tests.md section 2.8 (AC-51 to AC-60).
//
// Seeded accounts are only signed in as, never altered: every user this suite
// edits, deactivates, or promotes is its own, under the "zz.adm." email
// prefix, and afterAll removes them. Tests that need a second Administrator
// create it themselves and remove it, so the seeded Administrator stays the
// only active one between tests (ADM-09 depends on that).

const prisma = getPrisma();

const ADMIN = "sasithorn.pho@kmutt.ac.th";
const STAFF = "wichai.pra@kmutt.ac.th";

const PREFIX = "zz.adm.";
const TARGET = `${PREFIX}target@example.test`;
const OWNER = `${PREFIX}owner@example.test`;
const CLOSED_OWNER = `${PREFIX}closed-owner@example.test`;
const MARKER = "[adm-42]";
const RANDOM_UUID = "3f8b0c22-0000-4000-8000-0000000000a9";
const NEW_PASSWORD = "an initial password 0042";

const FORBIDDEN = { error: { code: "FORBIDDEN", message: expect.any(String) } };
const NOT_FOUND = { error: { code: "NOT_FOUND", message: expect.any(String) } };
const BAD_REQUEST = { error: { code: "BAD_REQUEST", message: expect.any(String) } };
const UNAUTHENTICATED = { error: { code: "UNAUTHENTICATED", message: expect.any(String) } };
const conflict = (code: string) => ({ error: { code, message: expect.any(String) } });

const ADMIN_USER_KEYS = [
  "createdAt",
  "email",
  "fullName",
  "id",
  "isActive",
  "mustChangePassword",
  "role",
  "updatedAt",
].sort();

type Role = "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";

let fields: Awaited<ReturnType<typeof signInFields>>;
let admin: SignedIn;
let categoryId = 0;
let relatedSystemId = 0;
const ids = { target: "", owner: "", closedOwner: "" };

/** Every user, session, and ticket this suite created, removed in dependency order. */
async function removeOwnRows() {
  const users = await prisma.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const tickets = await prisma.ticket.findMany({
    where: { OR: [{ summary: { contains: MARKER } }, { requesterId: { in: userIds } }, { ownerId: { in: userIds } }] },
    select: { id: true },
  });
  const ticketIds = tickets.map((t) => t.id);
  await prisma.ticketEvent.deleteMany({ where: { OR: [{ ticketId: { in: ticketIds } }, { actorId: { in: userIds } }] } });
  await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

/** Creates or resets one of the suite's own users so it can sign in. */
async function ownUser(email: string, fullName: string, role: Role, isActive = true) {
  const fixture = { fullName, role, isActive, ...fields };
  const user = await prisma.user.upsert({ where: { email }, update: fixture, create: { email, ...fixture } });
  await prisma.session.deleteMany({ where: { userId: user.id } });
  return user.id;
}

async function ownTicket(n: number, ownerId: string, currentStatus: "OPEN" | "IN_PROGRESS" | "CLOSED") {
  await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-2026-942${String(n).padStart(2, "0")}`,
      requesterId: ids.target,
      ownerId,
      categoryId,
      relatedSystemId,
      summary: `${MARKER} ${currentStatus} ticket owned for the open-ticket rule`,
      description: "A description long enough to satisfy the twenty character minimum.",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus,
    },
  });
}

/** A second (or third) active Administrator, created by the test that needs it. */
async function extraAdministrator(name: string): Promise<{ id: string; email: string }> {
  const email = `${PREFIX}${name}@example.test`;
  const id = await ownUser(email, `ZZ Adm ${name}`, "ADMINISTRATOR");
  return { id, email };
}

async function removeUsers(emails: string[]) {
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

const activeAdministrators = () => prisma.user.count({ where: { role: "ADMINISTRATOR", isActive: true } });

const patch = (who: SignedIn, userId: string, body: Record<string, unknown>) =>
  who.agent.patch(`/api/v1/admin/users/${userId}`).send(body);

const login = (email: string, password: string) =>
  request(app).post("/api/v1/auth/login").send({ email, password });

const validCreate = (overrides: Record<string, unknown> = {}) => ({
  fullName: "ZZ Adm Created",
  email: `${PREFIX}created@example.test`,
  role: "IT_STAFF",
  isActive: true,
  initialPassword: NEW_PASSWORD,
  ...overrides,
});

beforeAll(async () => {
  fields = await signInFields();
  await removeOwnRows();

  const category = await prisma.category.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
  const system = await prisma.relatedSystem.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
  expect(category, "seed must provide an active Category").not.toBeNull();
  expect(system, "seed must provide an active Related System").not.toBeNull();
  categoryId = category!.id;
  relatedSystemId = system!.id;

  ids.target = await ownUser(TARGET, "ZZ Adm Target", "REQUESTER");
  ids.owner = await ownUser(OWNER, "ZZ Adm Owner", "IT_STAFF");
  ids.closedOwner = await ownUser(CLOSED_OWNER, "ZZ Adm Closed Owner", "IT_STAFF");

  await ownTicket(1, ids.owner, "OPEN");
  await ownTicket(2, ids.owner, "IN_PROGRESS");
  await ownTicket(3, ids.owner, "CLOSED");
  await ownTicket(4, ids.closedOwner, "CLOSED");
});

beforeEach(async () => {
  resetLoginThrottle();

  // Edits in one test must not leak into the next. ADM-06 changes the target's
  // email, so it is reset by id rather than upserted by email.
  await prisma.user.update({
    where: { id: ids.target },
    data: { email: TARGET, fullName: "ZZ Adm Target", role: "REQUESTER", isActive: true, ...fields },
  });
  for (const id of [ids.owner, ids.closedOwner]) {
    await prisma.user.update({ where: { id }, data: { role: "IT_STAFF", isActive: true, ...fields } });
  }
  await prisma.session.deleteMany({ where: { userId: { in: Object.values(ids) } } });
  await removeUsers([`${PREFIX}created@example.test`, `${PREFIX}second@example.test`]);

  expect(await activeAdministrators(), "the seeded Administrator must be the only active one").toBe(1);
  admin = await loginAs(ADMIN);
});

afterAll(async () => {
  await removeOwnRows();
  resetLoginThrottle();
  await prisma.$disconnect();
});

describe("user list (ADM-01 - AC-51)", () => {
  it("returns every user with exactly the AdminUser fields, sorted by fullName, and no password hash", async () => {
    const res = await admin.agent.get("/api/v1/admin/users");

    expect(res.status).toBe(200);
    const expected = await prisma.user.findMany({ orderBy: [{ fullName: "asc" }, { id: "asc" }], select: { id: true } });
    expect(res.body.data.map((u: { id: string }) => u.id)).toEqual(expected.map((u) => u.id));
    for (const user of res.body.data) {
      expect(Object.keys(user).sort()).toEqual(ADMIN_USER_KEYS);
    }
    expect(res.text).not.toContain("passwordHash");
    expect(res.text).not.toContain("$argon2");
    expect(res.body.meta).toBeUndefined();
  });
});

describe("search and role filter (ADM-02 - AC-51, BR-66)", () => {
  const idsOf = (res: request.Response) => res.body.data.map((u: { id: string }) => u.id);

  it("matches part of a name and part of an email, case-insensitively", async () => {
    const byName = await admin.agent.get("/api/v1/admin/users").query({ q: "aDM tARG" });
    expect(byName.status).toBe(200);
    expect(idsOf(byName)).toEqual([ids.target]);

    const byEmail = await admin.agent.get("/api/v1/admin/users").query({ q: "ADM.TARGET@EXAMPLE" });
    expect(byEmail.status).toBe(200);
    expect(idsOf(byEmail)).toEqual([ids.target]);
  });

  it("filters by one role, alone and combined with q", async () => {
    const staff = await admin.agent.get("/api/v1/admin/users").query({ role: "IT_STAFF" });
    expect(staff.status).toBe(200);
    expect(staff.body.data.length).toBe(await prisma.user.count({ where: { role: "IT_STAFF" } }));
    expect(staff.body.data.every((u: { role: string }) => u.role === "IT_STAFF")).toBe(true);

    const both = await admin.agent.get("/api/v1/admin/users").query({ q: "zz adm", role: "IT_STAFF" });
    expect(both.status).toBe(200);
    expect(new Set(idsOf(both))).toEqual(new Set([ids.owner, ids.closedOwner]));
  });

  it("rejects role=AGENT and an unknown parameter with 400", async () => {
    for (const query of [{ role: "AGENT" }, { foo: "1" }]) {
      const res = await admin.agent.get("/api/v1/admin/users").query(query);
      expect(res.status, JSON.stringify(query)).toBe(400);
      expect(res.body).toEqual(BAD_REQUEST);
    }
  });
});

describe("create user (ADM-03 - AC-52, BR-62)", () => {
  it("creates a user who must change the password, can log in, and is then gated", async () => {
    const res = await admin.agent.post("/api/v1/admin/users").send(validCreate({ email: ` ${PREFIX.toUpperCase()}Created@Example.TEST ` }));

    expect(res.status).toBe(201);
    expect(Object.keys(res.body.data).sort()).toEqual(ADMIN_USER_KEYS);
    expect(res.body.data).toMatchObject({
      fullName: "ZZ Adm Created",
      email: `${PREFIX}created@example.test`,
      role: "IT_STAFF",
      isActive: true,
      mustChangePassword: true,
    });
    expect(res.text).not.toContain("$argon2");

    const created = await loginAs(`${PREFIX}created@example.test`, NEW_PASSWORD);
    expect(created.user.mustChangePassword).toBe(true);
    const gated = await created.agent.get("/api/v1/categories");
    expect(gated.status).toBe(403);
    expect(gated.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
  });
});

describe("duplicate email (ADM-04 - AC-53, BR-61)", () => {
  it("refuses creating a user with an existing email in different case", async () => {
    const res = await admin.agent.post("/api/v1/admin/users").send(validCreate({ email: TARGET.toUpperCase() }));
    expect(res.status).toBe(409);
    expect(res.body).toEqual(conflict("EMAIL_ALREADY_EXISTS"));
    expect(await prisma.user.count({ where: { email: TARGET } })).toBe(1);
  });

  it("refuses editing a user to another user's email", async () => {
    const res = await patch(admin, ids.target, { email: OWNER.toUpperCase() });
    expect(res.status).toBe(409);
    expect(res.body).toEqual(conflict("EMAIL_ALREADY_EXISTS"));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.target } })).email).toBe(TARGET);
  });
});

describe("create validation (ADM-05 - AC-53, BR-60)", () => {
  it("reports an invalid role, a missing name, an invalid email, and a short password together", async () => {
    const res = await admin.agent
      .post("/api/v1/admin/users")
      .send({ role: "AGENT", email: "not-an-email", isActive: true, initialPassword: "elevenchars" });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(res.body.error.details).sort()).toEqual(["email", "fullName", "initialPassword", "role"]);
    expect([..."elevenchars"].length).toBe(11);
  });

  it("rejects a 1-character name", async () => {
    const res = await admin.agent.post("/api/v1/admin/users").send(validCreate({ fullName: " Z " }));
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.error.details)).toEqual(["fullName"]);
    expect(await prisma.user.count({ where: { email: `${PREFIX}created@example.test` } })).toBe(0);
  });
});

describe("edit user (ADM-06 - AC-54, BR-62)", () => {
  it("persists name, email, role, and isActive, and ignores a password in the body", async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: ids.target } });

    const res = await patch(admin, ids.target, {
      fullName: "  ZZ Adm Renamed  ",
      email: " ZZ.ADM.Renamed@Example.test ",
      role: "IT_STAFF",
      isActive: false,
      password: "a password that must be ignored",
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: ids.target,
      fullName: "ZZ Adm Renamed",
      email: `${PREFIX}renamed@example.test`,
      role: "IT_STAFF",
      isActive: false,
    });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: ids.target } });
    expect(after).toMatchObject({
      fullName: "ZZ Adm Renamed",
      email: `${PREFIX}renamed@example.test`,
      role: "IT_STAFF",
      isActive: false,
      passwordHash: before.passwordHash,
      mustChangePassword: before.mustChangePassword,
    });
  });
});

describe("new initial password (ADM-07 - AC-55, BR-13)", () => {
  it("sets mustChangePassword, ends the target's session, and replaces the password", async () => {
    const target = await loginAs(TARGET);

    const res = await admin.agent
      .post(`/api/v1/admin/users/${ids.target}/initial-password`)
      .send({ initialPassword: NEW_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: ids.target, mustChangePassword: true });
    expect(res.text).not.toContain("$argon2");

    const stale = await target.agent.get("/api/v1/auth/me");
    expect(stale.status).toBe(401);
    expect(stale.body).toEqual(UNAUTHENTICATED);

    const withNew = await login(TARGET, NEW_PASSWORD);
    expect(withNew.status).toBe(200);
    expect(withNew.body.data.user.mustChangePassword).toBe(true);

    const withOld = await login(TARGET, seedPassword());
    expect(withOld.status).toBe(401);
    expect(withOld.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects an 11-code-point password with 422 details.initialPassword and changes nothing", async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: ids.target } });
    const res = await admin.agent
      .post(`/api/v1/admin/users/${ids.target}/initial-password`)
      .send({ initialPassword: "elevenchars" });

    expect(res.status).toBe(422);
    expect(Object.keys(res.body.error.details)).toEqual(["initialPassword"]);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: ids.target } });
    expect(await verifyPassword(after.passwordHash!, seedPassword())).toBe(true);
    expect(after.mustChangePassword).toBe(before.mustChangePassword);
  });
});

describe("self-protection (ADM-08 - AC-56, BR-63)", () => {
  it("with a second active Administrator, refuses self-deactivation and self role change, and allows a self name change", async () => {
    const second = await extraAdministrator("second");
    try {
      const self = await loginAs(second.email);

      const deactivate = await patch(self, second.id, { isActive: false });
      expect(deactivate.status).toBe(409);
      expect(deactivate.body).toEqual(conflict("CANNOT_DEACTIVATE_SELF"));

      const demote = await patch(self, second.id, { role: "IT_STAFF" });
      expect(demote.status).toBe(409);
      expect(demote.body).toEqual(conflict("CANNOT_CHANGE_OWN_ROLE"));

      const rename = await patch(self, second.id, { fullName: "ZZ Adm Second Renamed" });
      expect(rename.status).toBe(200);
      expect(rename.body.data.fullName).toBe("ZZ Adm Second Renamed");

      const row = await prisma.user.findUniqueOrThrow({ where: { id: second.id } });
      expect(row).toMatchObject({ role: "ADMINISTRATOR", isActive: true });
    } finally {
      await removeUsers([second.email]);
    }
  });
});

describe("last Administrator, serial (ADM-09 - AC-57)", () => {
  it("refuses the sole active Administrator deactivating self or changing own role", async () => {
    const self = admin.user.id;

    const deactivate = await patch(admin, self, { isActive: false });
    expect(deactivate.status).toBe(409);
    expect(deactivate.body).toEqual({
      error: { code: "LAST_ADMINISTRATOR", message: "At least one active Administrator must remain." },
    });

    const demote = await patch(admin, self, { role: "IT_STAFF" });
    expect(demote.status).toBe(409);
    expect(demote.body.error.code).toBe("LAST_ADMINISTRATOR");

    expect(await prisma.user.findUniqueOrThrow({ where: { id: self } })).toMatchObject({
      role: "ADMINISTRATOR",
      isActive: true,
    });
  });
});

describe("last Administrator, concurrent (ADM-10 - AC-57, BR-63)", () => {
  // The seeded Administrator is never altered, so the two Administrators that
  // demote each other are both the test's own. The rule under test is the
  // same: under the lock, the second request finds its actor no longer an
  // active Administrator, so exactly one demotion succeeds.
  it("lets exactly one of two Administrators demoting each other succeed", async () => {
    for (let round = 0; round < 5; round++) {
      const b = await extraAdministrator("concurrent-b");
      const c = await extraAdministrator("concurrent-c");
      try {
        const [asB, asC] = await Promise.all([loginAs(b.email), loginAs(c.email)]);

        const [bDemotesC, cDemotesB] = await Promise.all([
          patch(asB, c.id, { role: "IT_STAFF" }),
          patch(asC, b.id, { role: "IT_STAFF" }),
        ]);

        const statuses = [bDemotesC.status, cDemotesB.status];
        expect(statuses.filter((s) => s === 200), `round ${round}: ${statuses}`).toHaveLength(1);
        // The loser is refused at the actor re-check (403), or, if the
        // winner's session revocation landed first, at the session (401).
        expect([401, 403], `round ${round}: ${statuses}`).toContain(statuses.find((s) => s !== 200));

        const stillAdmin = await prisma.user.count({
          where: { id: { in: [b.id, c.id] }, role: "ADMINISTRATOR", isActive: true },
        });
        expect(stillAdmin, `round ${round}`).toBe(1);
        expect(await activeAdministrators()).toBeGreaterThanOrEqual(1);
      } finally {
        await removeUsers([b.email, c.email]);
      }
    }
  });
});

describe("open-ticket block (ADM-11 - AC-58, BR-63)", () => {
  it("refuses deactivating, or demoting to Requester, an IT Staff member who owns two open tickets", async () => {
    for (const body of [{ isActive: false }, { role: "REQUESTER" }]) {
      const res = await patch(admin, ids.owner, body);
      expect(res.status, JSON.stringify(body)).toBe(409);
      expect(res.body).toEqual(conflict("USER_HAS_OPEN_TICKETS"));
      expect(res.body.error.message).toContain("2");
    }
    expect(await prisma.user.findUniqueOrThrow({ where: { id: ids.owner } })).toMatchObject({
      role: "IT_STAFF",
      isActive: true,
    });
  });

  it("allows deactivating an IT Staff member who owns only CLOSED tickets", async () => {
    const res = await patch(admin, ids.closedOwner, { isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });
});

describe("session revocation (ADM-12 - AC-59, BR-64)", () => {
  it("ends a signed-in user's session when they are deactivated, and their login is then ACCOUNT_INACTIVE", async () => {
    const target = await loginAs(TARGET);

    const res = await patch(admin, ids.target, { isActive: false });
    expect(res.status).toBe(200);

    const next = await target.agent.get("/api/v1/auth/me");
    expect(next.status).toBe(401);
    expect(next.body).toEqual(UNAUTHENTICATED);

    const relogin = await login(TARGET, seedPassword());
    expect(relogin.status).toBe(403);
    expect(relogin.body.error.code).toBe("ACCOUNT_INACTIVE");
  });

  it("ends a signed-in user's session when their role changes, revoking the session row", async () => {
    const target = await loginAs(TARGET);

    const res = await patch(admin, ids.target, { role: "IT_STAFF" });
    expect(res.status).toBe(200);

    const next = await target.agent.get("/api/v1/auth/me");
    expect(next.status).toBe(401);
    expect(await prisma.session.count({ where: { userId: ids.target, revokedAt: null } })).toBe(0);
  });

  it("keeps the session on a name-only edit", async () => {
    const target = await loginAs(TARGET);

    const res = await patch(admin, ids.target, { fullName: "ZZ Adm Target Renamed" });
    expect(res.status).toBe(200);

    const next = await target.agent.get("/api/v1/auth/me");
    expect(next.status).toBe(200);
    expect(next.body.data.user.fullName).toBe("ZZ Adm Target Renamed");
  });
});

describe("non-Administrators refused (ADM-13 - AC-60)", () => {
  it("answers Requester and IT Staff with 403 on every /admin/users endpoint and changes nothing", async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: ids.closedOwner } });
    const userCount = await prisma.user.count();

    for (const who of [await loginAs(TARGET), await loginAs(STAFF)]) {
      const responses: [string, request.Response][] = [
        ["GET /admin/users", await who.agent.get("/api/v1/admin/users")],
        ["POST /admin/users", await who.agent.post("/api/v1/admin/users").send(validCreate())],
        ["PATCH /admin/users/{id}", await patch(who, ids.closedOwner, { isActive: false })],
        [
          "POST /admin/users/{id}/initial-password",
          await who.agent
            .post(`/api/v1/admin/users/${ids.closedOwner}/initial-password`)
            .send({ initialPassword: NEW_PASSWORD }),
        ],
      ];
      for (const [label, res] of responses) {
        expect(res.status, `${who.user.email} ${label}`).toBe(403);
        expect(res.body).toEqual(FORBIDDEN);
      }
    }

    expect(await prisma.user.count()).toBe(userCount);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: ids.closedOwner } })).toEqual(before);
  });
});

describe("unknown and malformed ids (ADM-14 - AC-54)", () => {
  it("answers an unknown UUID with 404 on PATCH and initial-password", async () => {
    const edit = await patch(admin, RANDOM_UUID, { fullName: "ZZ Adm Nobody" });
    expect(edit.status).toBe(404);
    expect(edit.body).toEqual(NOT_FOUND);

    const reset = await admin.agent
      .post(`/api/v1/admin/users/${RANDOM_UUID}/initial-password`)
      .send({ initialPassword: NEW_PASSWORD });
    expect(reset.status).toBe(404);
    expect(reset.body).toEqual(NOT_FOUND);
  });

  it("answers a malformed id with 400 on PATCH and initial-password", async () => {
    const edit = await patch(admin, "not-a-uuid", { fullName: "ZZ Adm Nobody" });
    expect(edit.status).toBe(400);
    expect(edit.body).toEqual(BAD_REQUEST);

    const reset = await admin.agent
      .post("/api/v1/admin/users/not-a-uuid/initial-password")
      .send({ initialPassword: NEW_PASSWORD });
    expect(reset.status).toBe(400);
    expect(reset.body).toEqual(BAD_REQUEST);
  });
});
