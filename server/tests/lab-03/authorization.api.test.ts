import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request, { type Test } from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { resetLoginThrottle } from "../../src/lab-03/login-throttle.js";
import { storedFilenameFor } from "../../src/lab-02/attachment-policy.js";
import { deleteAttachment, saveAttachment } from "../../src/lab-02/attachment-storage.js";
import { CSRF_HEADER, loginAs, seedPassword, signInFields, type SignedIn } from "../helpers/session.js";

// AUZ-01 to AUZ-15 from docs/lab-03/tests.md section 2.4 (AC-02, AC-03,
// AC-12, AC-15, AC-16, AC-17, AC-20, AC-22, AC-24, AC-34, AC-59).
//
// api-spec.md section 10 is the source table. Endpoints that arrive with later
// Issues (comments, notes, appears-resolved, and the routes under /staff and
// /admin) are covered here only through their route-family guards.
//
// Seeded accounts are only signed in as, never altered. Every ticket,
// attachment, and account this suite changes is its own, and afterAll removes
// them.

const prisma = getPrisma();

const STAFF = "wichai.pra@kmutt.ac.th";
const ADMIN = "sasithorn.pho@kmutt.ac.th";
const MUST_CHANGE = "chayanin.boo@kmutt.ac.th";

const REQ_A = "zz.auz.a@example.test";
const REQ_B = "zz.auz.b@example.test";
const CSRF_USER = "zz.auz.csrf@example.test";
const DEACTIVATED = "zz.auz.deactivated@example.test";
const OWN_USERS = [REQ_A, REQ_B, CSRF_USER, DEACTIVATED];

const MARKER = "[auz-37]";
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const RANDOM_UUID = "3f8b0c22-0000-4000-8000-0000000000a7";
const REMOVAL = { removalReason: "No longer relevant to this ticket" };
const NEW_PASSWORD = "a new password 0037";

const UNAUTHENTICATED = { error: { code: "UNAUTHENTICATED", message: expect.any(String) } };
const FORBIDDEN = { error: { code: "FORBIDDEN", message: expect.any(String) } };
const NOT_FOUND = { error: { code: "NOT_FOUND", message: expect.any(String) } };
const CSRF_INVALID = { error: { code: "CSRF_INVALID", message: expect.any(String) } };
const PASSWORD_CHANGE_REQUIRED = { error: { code: "PASSWORD_CHANGE_REQUIRED", message: expect.any(String) } };
const TICKET_STATE_CONFLICT = { error: { code: "TICKET_STATE_CONFLICT", message: expect.any(String) } };

let reqAId = "";
let reqBId = "";
let categoryId = 0;
let relatedSystemId = 0;

// Requester A's tickets, one per state the attachment rules care about, each
// given one active attachment before every test.
const ticketIds = { NEW: "", CLOSED: "", CANCELLED: "" };
const attachmentIds = { NEW: "", CLOSED: "", CANCELLED: "" };
type State = keyof typeof ticketIds;

function ticketBody(overrides: Record<string, unknown> = {}) {
  return {
    categoryId,
    relatedSystemId,
    summary: `${MARKER} Laptop battery drains within one hour`,
    requestedPriority: "HIGH",
    description: "Since the last update the battery drops from full to empty in about an hour.",
    ...overrides,
  };
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** A request with no session at all. */
function anonymous(method: Method, url: string): Test {
  return request(app)[method.toLowerCase() as "get"](url);
}

/** A request through a signed-in agent, which sends the CSRF token by default. */
function as(who: SignedIn, method: Method, url: string): Test {
  return who.agent[method.toLowerCase() as "get"](url);
}

const withoutCsrf = (test: Test) => test.unset(CSRF_HEADER);
const withWrongCsrf = (test: Test) => test.set(CSRF_HEADER, "not-the-session-csrf-token");

const uploadTo = (test: Test) => test.attach("file", PNG, { filename: "evidence.png", contentType: "image/png" });

const isActive = async (attachmentId: string) =>
  (await prisma.attachment.findUniqueOrThrow({ where: { id: attachmentId } })).removedAt === null;

const attachmentCount = (ticketId: string) => prisma.attachment.count({ where: { ticketId } });

async function clearAttachments() {
  const rows = await prisma.attachment.findMany({ where: { ticketId: { in: Object.values(ticketIds) } } });
  for (const row of rows) {
    await deleteAttachment(row.storedFilename);
  }
  await prisma.attachment.deleteMany({ where: { ticketId: { in: Object.values(ticketIds) } } });
}

beforeAll(async () => {
  const fields = await signInFields();
  for (const email of OWN_USERS) {
    const fixture = { fullName: `ZZ AUZ ${email.split("@")[0]}`, role: "REQUESTER" as const, isActive: true, ...fields };
    await prisma.user.upsert({ where: { email }, update: fixture, create: { email, ...fixture } });
  }
  reqAId = (await prisma.user.findUniqueOrThrow({ where: { email: REQ_A } })).id;
  reqBId = (await prisma.user.findUniqueOrThrow({ where: { email: REQ_B } })).id;

  const category = await prisma.category.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
  const system = await prisma.relatedSystem.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
  expect(category, "seed must provide an active Category").not.toBeNull();
  expect(system, "seed must provide an active Related System").not.toBeNull();
  categoryId = category!.id;
  relatedSystemId = system!.id;

  await clearAttachments();
  await prisma.ticket.deleteMany({ where: { requesterId: { in: [reqAId, reqBId] } } });

  const states: State[] = ["NEW", "CLOSED", "CANCELLED"];
  for (const [i, state] of states.entries()) {
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `TKT-2026-9500${i + 1}`,
        requesterId: reqAId,
        categoryId,
        relatedSystemId,
        summary: `${MARKER} Requester A ${state} ticket`,
        description: "A description long enough to satisfy the twenty character minimum.",
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        currentStatus: state,
      },
    });
    ticketIds[state] = ticket.id;
  }
});

beforeEach(async () => {
  resetLoginThrottle();

  await clearAttachments();
  for (const state of Object.keys(ticketIds) as State[]) {
    const storedFilename = storedFilenameFor("evidence.png");
    await saveAttachment(storedFilename, PNG);
    const row = await prisma.attachment.create({
      data: {
        ticketId: ticketIds[state],
        originalFilename: "evidence.png",
        storedFilename,
        mimeType: "image/png",
        sizeBytes: PNG.length,
        uploadedById: reqAId,
      },
    });
    attachmentIds[state] = row.id;
  }
});

afterAll(async () => {
  await clearAttachments();
  await prisma.ticket.deleteMany({
    where: { OR: [{ requesterId: { in: [reqAId, reqBId] } }, { summary: { contains: MARKER } }] },
  });
  await prisma.session.deleteMany({ where: { user: { email: { in: OWN_USERS } } } });
  await prisma.user.deleteMany({ where: { email: { in: OWN_USERS } } });
  resetLoginThrottle();
  await prisma.$disconnect();
});

describe("no session, table-driven (AUZ-01 - AC-15, BR-22)", () => {
  it("answers every protected /api/v1 endpoint with 401 UNAUTHENTICATED", async () => {
    const endpoints: [Method, string][] = [
      ["GET", "/api/v1/auth/me"],
      ["POST", "/api/v1/auth/password"],
      ["GET", "/api/v1/categories"],
      ["GET", "/api/v1/related-systems"],
      ["POST", "/api/v1/tickets"],
      ["GET", "/api/v1/tickets"],
      ["GET", `/api/v1/tickets/${ticketIds.NEW}`],
      ["GET", `/api/v1/tickets/${ticketIds.NEW}/attachments`],
      ["POST", `/api/v1/tickets/${ticketIds.NEW}/attachments`],
      ["GET", `/api/v1/attachments/${attachmentIds.NEW}/download`],
      ["DELETE", `/api/v1/attachments/${attachmentIds.NEW}`],
      ["GET", "/api/v1/staff/tickets"],
      ["GET", `/api/v1/staff/tickets/${ticketIds.NEW}`],
      ["GET", "/api/v1/admin/users"],
      ["POST", "/api/v1/admin/users"],
    ];

    for (const [method, url] of endpoints) {
      const res = await anonymous(method, url);
      expect(res.status, `${method} ${url}`).toBe(401);
      expect(res.body, `${method} ${url}`).toEqual(UNAUTHENTICATED);
    }

    expect(await isActive(attachmentIds.NEW), "nothing may change without a session").toBe(true);
  });
});

describe("Lab 1 stays public (AUZ-02 - AC-15, A-04)", () => {
  it("answers GET /api/categories with the unchanged Lab 1 body and no session", async () => {
    const res = await anonymous("GET", "/api/categories");

    expect(res.status).toBe(200);
    expect(res.body.map((c: { name: string }) => c.name)).toEqual([
      "Account and Access",
      "Hardware",
      "Software",
      "Network",
    ]);
    for (const category of res.body) {
      expect(Object.keys(category).sort()).toEqual(["id", "name"]);
    }
  });

  it("answers GET /api/health with the unchanged Lab 1 body and no session", async () => {
    const res = await anonymous("GET", "/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "TokTickIT API" });
  });
});

describe("reference data needs a session (AUZ-03 - AC-15)", () => {
  it.each(["/api/v1/categories", "/api/v1/related-systems"])("%s is 401 without a session and 200 for each role", async (url) => {
    const res = await anonymous("GET", url);
    expect(res.status).toBe(401);
    expect(res.body).toEqual(UNAUTHENTICATED);

    for (const email of [REQ_A, STAFF, ADMIN]) {
      const signedIn = await as(await loginAs(email), "GET", url);
      expect(signedIn.status, email).toBe(200);
      expect(signedIn.body.data.length, email).toBeGreaterThan(0);
    }
  });
});

describe("selector endpoint removed (AUZ-04 - AC-21)", () => {
  it("answers GET /api/v1/dev-requesters with 404 NOT_FOUND, with or without a session", async () => {
    const res = await anonymous("GET", "/api/v1/dev-requesters");
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);

    for (const email of [REQ_A, STAFF, ADMIN]) {
      const signedIn = await as(await loginAs(email), "GET", "/api/v1/dev-requesters");
      expect(signedIn.status, email).toBe(404);
      expect(signedIn.body, email).toEqual(NOT_FOUND);
    }
  });
});

describe("route-family guard: Requester (AUZ-05 - AC-16, BR-23)", () => {
  it("refuses every /staff and /admin path with an identical 403, existing or not", async () => {
    const requester = await loginAs(REQ_A);
    const urls = [
      "/api/v1/staff/tickets",
      `/api/v1/staff/tickets/${ticketIds.NEW}`,
      `/api/v1/staff/tickets/${RANDOM_UUID}`,
      "/api/v1/staff/no-such-endpoint",
      "/api/v1/admin/users",
      "/api/v1/admin/no-such-endpoint",
    ];

    const responses = [];
    for (const url of urls) {
      const res = await as(requester, "GET", url);
      expect(res.status, url).toBe(403);
      expect(res.body, url).toEqual(FORBIDDEN);
      responses.push(res);
    }
    for (const res of responses) {
      expect(res.text).toBe(responses[0].text);
    }
  });
});

describe("route-family guard: IT Staff (AUZ-06 - AC-17)", () => {
  it("refuses GET and POST /admin/users with 403", async () => {
    const staff = await loginAs(STAFF);
    const email = "zz.auz.never-created@example.test";

    const list = await as(staff, "GET", "/api/v1/admin/users");
    const create = await as(staff, "POST", "/api/v1/admin/users").send({
      fullName: "Never Created",
      email,
      role: "IT_STAFF",
      isActive: true,
      initialPassword: NEW_PASSWORD,
    });

    for (const res of [list, create]) {
      expect(res.status).toBe(403);
      expect(res.body).toEqual(FORBIDDEN);
    }
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });
});

describe("Requester-only endpoints (AUZ-07 - AC-20, BR-25)", () => {
  it.each([STAFF, ADMIN])("refuses %s on POST /tickets, GET /tickets, and GET /tickets/{id}, creating nothing", async (email) => {
    const staff = await loginAs(email);
    const summary = `${MARKER} created by ${email}`;

    const responses = [
      await as(staff, "POST", "/api/v1/tickets").send(ticketBody({ summary })),
      await as(staff, "GET", "/api/v1/tickets"),
      await as(staff, "GET", `/api/v1/tickets/${ticketIds.NEW}`),
    ];

    for (const res of responses) {
      expect(res.status).toBe(403);
      expect(res.body).toEqual(FORBIDDEN);
    }
    expect(await prisma.ticket.count({ where: { summary } })).toBe(0);
  });
});

describe("body requesterId ignored (AUZ-08 - AC-03, BR-03)", () => {
  it("makes the session user the Requester of a ticket created with another Requester's id", async () => {
    const requester = await loginAs(REQ_A);

    const res = await as(requester, "POST", "/api/v1/tickets").send(ticketBody({ requesterId: reqBId }));

    expect(res.status).toBe(201);
    expect(res.body.data.requester.id).toBe(reqAId);
    const saved = await prisma.ticket.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(saved.requesterId).toBe(reqAId);
    expect(await prisma.ticket.count({ where: { requesterId: reqBId } })).toBe(0);
  });
});

describe("cross-Requester isolation (AUZ-09 - AC-22, BR-24)", () => {
  it("answers B's requests for A's ticket and attachment exactly as for a random UUID", async () => {
    const b = await loginAs(REQ_B);
    const ticket = ticketIds.NEW;
    const attachment = attachmentIds.NEW;

    const responses = [
      await as(b, "GET", `/api/v1/tickets/${ticket}`),
      await as(b, "GET", `/api/v1/tickets/${ticket}/attachments`),
      await as(b, "GET", `/api/v1/attachments/${attachment}/download`),
      await as(b, "DELETE", `/api/v1/attachments/${attachment}`).send(REMOVAL),
      await as(b, "GET", `/api/v1/tickets/${RANDOM_UUID}`),
      await as(b, "GET", `/api/v1/tickets/${RANDOM_UUID}/attachments`),
      await as(b, "GET", `/api/v1/attachments/${RANDOM_UUID}/download`),
      await as(b, "DELETE", `/api/v1/attachments/${RANDOM_UUID}`).send(REMOVAL),
    ];

    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual(NOT_FOUND);
      expect(res.text).toBe(responses[0].text);
    }
    expect(await isActive(attachment), "A's attachment must stay active").toBe(true);
  });
});

describe("CSRF enforced (AUZ-10 - AC-12, BR-20)", () => {
  const spoilers = [
    ["a missing", withoutCsrf],
    ["a wrong", withWrongCsrf],
  ] as const;

  it.each(spoilers)("refuses POST /tickets with %s X-CSRF-Token and creates nothing", async (_case, spoil) => {
    const requester = await loginAs(REQ_A);
    const summary = `${MARKER} must not be created`;

    const res = await spoil(as(requester, "POST", "/api/v1/tickets")).send(ticketBody({ summary }));

    expect(res.status).toBe(403);
    expect(res.body).toEqual(CSRF_INVALID);
    expect(await prisma.ticket.count({ where: { summary } })).toBe(0);
  });

  it.each(spoilers)("refuses an upload with %s X-CSRF-Token and stores nothing", async (_case, spoil) => {
    const requester = await loginAs(REQ_A);

    const res = await uploadTo(spoil(as(requester, "POST", `/api/v1/tickets/${ticketIds.NEW}/attachments`)));

    expect(res.status).toBe(403);
    expect(res.body).toEqual(CSRF_INVALID);
    expect(await attachmentCount(ticketIds.NEW)).toBe(1);
  });

  it.each(spoilers)("refuses DELETE /attachments/{id} with %s X-CSRF-Token and leaves it active", async (_case, spoil) => {
    const requester = await loginAs(REQ_A);

    const res = await spoil(as(requester, "DELETE", `/api/v1/attachments/${attachmentIds.NEW}`)).send(REMOVAL);

    expect(res.status).toBe(403);
    expect(res.body).toEqual(CSRF_INVALID);
    expect(await isActive(attachmentIds.NEW)).toBe(true);
  });

  it.each(spoilers)("refuses POST /auth/password with %s X-CSRF-Token and keeps the password", async (_case, spoil) => {
    // Restored first, so a change let through by one case cannot break the next.
    await prisma.user.update({ where: { email: CSRF_USER }, data: await signInFields() });
    const before = await prisma.user.findUniqueOrThrow({ where: { email: CSRF_USER } });
    const user = await loginAs(CSRF_USER);

    const res = await spoil(as(user, "POST", "/api/v1/auth/password")).send({
      currentPassword: seedPassword(),
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });

    expect(res.status).toBe(403);
    expect(res.body).toEqual(CSRF_INVALID);
    const after = await prisma.user.findUniqueOrThrow({ where: { email: CSRF_USER } });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.passwordChangedAt).toEqual(before.passwordChangedAt);
  });

  it.each(spoilers)("refuses POST /auth/logout with %s X-CSRF-Token and keeps the session", async (_case, spoil) => {
    const requester = await loginAs(REQ_A);

    const res = await spoil(as(requester, "POST", "/api/v1/auth/logout"));

    expect(res.status).toBe(403);
    expect(res.body).toEqual(CSRF_INVALID);
    expect((await as(requester, "GET", "/api/v1/auth/me")).status).toBe(200);
  });

  it("checks CSRF before the password-change gate (api-spec 1.1 steps 3 and 4)", async () => {
    const mustChange = await loginAs(MUST_CHANGE);

    const res = await withoutCsrf(as(mustChange, "POST", "/api/v1/tickets")).send(ticketBody());

    expect(res.status).toBe(403);
    expect(res.body).toEqual(CSRF_INVALID);
  });
});

describe("CSRF exemptions (AUZ-11 - AC-12)", () => {
  it("accepts POST /auth/login without the header", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email: REQ_A, password: seedPassword() });

    expect(res.status).toBe(200);
  });

  it("accepts every GET without the header", async () => {
    const requester = await loginAs(REQ_A);
    const urls = [
      "/api/v1/auth/me",
      "/api/v1/categories",
      "/api/v1/related-systems",
      "/api/v1/tickets",
      `/api/v1/tickets/${ticketIds.NEW}`,
      `/api/v1/tickets/${ticketIds.NEW}/attachments`,
      `/api/v1/attachments/${attachmentIds.NEW}/download`,
    ];

    for (const url of urls) {
      const res = await withoutCsrf(as(requester, "GET", url));
      expect(res.status, url).toBe(200);
    }
  });
});

describe("password-change gate applied (AUZ-12 - AC-02, BR-21)", () => {
  it("refuses the must-change fixture everywhere but GET /auth/me", async () => {
    const mustChange = await loginAs(MUST_CHANGE);

    const responses = [
      await as(mustChange, "GET", "/api/v1/tickets"),
      await as(mustChange, "POST", "/api/v1/tickets").send(ticketBody()),
      await as(mustChange, "GET", "/api/v1/categories"),
      await as(mustChange, "GET", "/api/v1/staff/tickets"),
      await as(mustChange, "GET", "/api/v1/admin/users"),
    ];
    for (const res of responses) {
      expect(res.status, res.req.path).toBe(403);
      expect(res.body, res.req.path).toEqual(PASSWORD_CHANGE_REQUIRED);
    }

    const me = await as(mustChange, "GET", "/api/v1/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.data.user.mustChangePassword).toBe(true);
  });
});

describe("attachment state lock (AUZ-13 - AC-24, BR-59)", () => {
  it.each(["CLOSED", "CANCELLED"] as const)("refuses upload and removal on the Requester's own %s ticket", async (state) => {
    const requester = await loginAs(REQ_A);

    const upload = await uploadTo(as(requester, "POST", `/api/v1/tickets/${ticketIds[state]}/attachments`));
    const removal = await as(requester, "DELETE", `/api/v1/attachments/${attachmentIds[state]}`).send(REMOVAL);

    for (const res of [upload, removal]) {
      expect(res.status).toBe(409);
      expect(res.body).toEqual(TICKET_STATE_CONFLICT);
    }
    expect(await attachmentCount(ticketIds[state])).toBe(1);
    expect(await isActive(attachmentIds[state])).toBe(true);
  });

  it("still allows upload and removal on a NEW ticket", async () => {
    const requester = await loginAs(REQ_A);

    const upload = await uploadTo(as(requester, "POST", `/api/v1/tickets/${ticketIds.NEW}/attachments`));
    const removal = await as(requester, "DELETE", `/api/v1/attachments/${attachmentIds.NEW}`).send(REMOVAL);

    expect(upload.status).toBe(201);
    expect(removal.status).toBe(200);
    expect(await isActive(attachmentIds.NEW)).toBe(false);
  });
});

describe("deactivation takes effect immediately (AUZ-14 - AC-59, BR-19)", () => {
  it("makes a signed-in user's next request 401 once isActive is false", async () => {
    const user = await loginAs(DEACTIVATED);
    expect((await as(user, "GET", "/api/v1/tickets")).status, "the session must work first").toBe(200);

    await prisma.user.update({ where: { email: DEACTIVATED }, data: { isActive: false } });

    for (const url of ["/api/v1/tickets", "/api/v1/categories", "/api/v1/auth/me"]) {
      const res = await as(user, "GET", url);
      expect(res.status, url).toBe(401);
      expect(res.body, url).toEqual(UNAUTHENTICATED);
    }
  });
});

describe("staff attachment access (AUZ-15 - AC-34, BR-58)", () => {
  it.each([STAFF, ADMIN])("lets %s list and download any ticket's attachments, but not upload or remove", async (email) => {
    const staff = await loginAs(email);

    const list = await as(staff, "GET", `/api/v1/tickets/${ticketIds.NEW}/attachments`);
    expect(list.status).toBe(200);
    expect(list.body.data.map((a: { id: string }) => a.id)).toEqual([attachmentIds.NEW]);

    const download = await as(staff, "GET", `/api/v1/attachments/${attachmentIds.NEW}/download`);
    expect(download.status).toBe(200);
    expect(Buffer.from(download.body)).toEqual(PNG);

    const upload = await uploadTo(as(staff, "POST", `/api/v1/tickets/${ticketIds.NEW}/attachments`));
    const removal = await as(staff, "DELETE", `/api/v1/attachments/${attachmentIds.NEW}`).send(REMOVAL);
    for (const res of [upload, removal]) {
      expect(res.status).toBe(403);
      expect(res.body).toEqual(FORBIDDEN);
    }
    expect(await attachmentCount(ticketIds.NEW)).toBe(1);
    expect(await isActive(attachmentIds.NEW)).toBe(true);
  });
});
