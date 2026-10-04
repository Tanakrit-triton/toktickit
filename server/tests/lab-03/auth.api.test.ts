import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request, { type Response } from "supertest";
import { createHash } from "node:crypto";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/lab-03/password-hash.js";
import { resetLoginThrottle } from "../../src/lab-03/login-throttle.js";
import { CSRF_HEADER, loginAs, seedPassword } from "../helpers/session.js";

// API-01 to API-13 from docs/lab-03/tests.md section 2.3 (AC-01, AC-02,
// AC-05 to AC-11, AC-13).
//
// Seeded accounts are read, never left altered: API-10 changes the
// must-change fixture's password, and afterAll restores it. Tests that need an
// account in a special state, or that change a password, create their own
// users, which afterAll deletes.

const prisma = getPrisma();
const PASSWORD = seedPassword();

const ACTIVE = "napat.cha@kmutt.ac.th";
const INACTIVE = "kittipong.won@kmutt.ac.th";
const MUST_CHANGE = "chayanin.boo@kmutt.ac.th";

const NO_HASH = "zz.auth.nohash@example.test";
const TWO_SESSIONS = "zz.auth.two-sessions@example.test";
const SECRETS = "zz.auth.secrets@example.test";
const OWN_USERS = [NO_HASH, TWO_SESSIONS, SECRETS];

const NEW_PASSWORD = "a new password 0001";

const INVALID_CREDENTIALS = {
  error: { code: "INVALID_CREDENTIALS", message: "The email or password is incorrect." },
};
const ACCOUNT_INACTIVE = {
  error: { code: "ACCOUNT_INACTIVE", message: "This account is inactive. Contact your administrator." },
};
const TOO_MANY_ATTEMPTS = {
  error: { code: "TOO_MANY_ATTEMPTS", message: "Too many sign-in attempts. Try again in a few minutes." },
};

const login = (email: string, password: string) =>
  request(app).post("/api/v1/auth/login").send({ email, password });

/** The Set-Cookie line for the session cookie, or undefined. */
function sessionCookie(res: Response): string | undefined {
  const header = res.headers["set-cookie"] as unknown as string[] | undefined;
  return header?.find((line) => line.startsWith("toktickit_sid="));
}

/** The raw session token a response set. */
function tokenOf(res: Response): string {
  const line = sessionCookie(res);
  expect(line, "no toktickit_sid cookie was set").toBeDefined();
  return line!.split(";")[0].slice("toktickit_sid=".length);
}

const sha256Hex = (value: string) => createHash("sha256").update(value).digest("hex");

const me = (token: string) => request(app).get("/api/v1/auth/me").set("Cookie", `toktickit_sid=${token}`);

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD);
  const users = [
    { email: NO_HASH, fullName: "ZZ Auth No Hash", passwordHash: null },
    { email: TWO_SESSIONS, fullName: "ZZ Auth Two Sessions", passwordHash },
    { email: SECRETS, fullName: "ZZ Auth Secrets", passwordHash },
  ];
  for (const { email, fullName, passwordHash: hash } of users) {
    const fixture = { fullName, passwordHash: hash, mustChangePassword: false, isActive: true, role: "REQUESTER" as const };
    await prisma.user.upsert({ where: { email }, update: fixture, create: { email, ...fixture } });
  }
});

beforeEach(() => {
  resetLoginThrottle();
});

afterAll(async () => {
  await prisma.session.deleteMany({ where: { user: { email: { in: OWN_USERS } } } });
  await prisma.user.deleteMany({ where: { email: { in: OWN_USERS } } });

  // Restore the must-change fixture that API-10 used (specification.md 7.5).
  const fixture = await prisma.user.findUniqueOrThrow({ where: { email: MUST_CHANGE } });
  await prisma.session.updateMany({
    where: { userId: fixture.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await prisma.user.update({
    where: { id: fixture.id },
    data: { passwordHash: await hashPassword(PASSWORD), mustChangePassword: true, passwordChangedAt: null },
  });

  resetLoginThrottle();
  await prisma.$disconnect();
});

describe("POST /api/v1/auth/login (API-01 - AC-01)", () => {
  it("returns 200 with the user, role, and CSRF token", async () => {
    const res = await login(ACTIVE, PASSWORD);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        user: {
          id: expect.any(String),
          fullName: "Napat Chaiwong",
          email: ACTIVE,
          role: "REQUESTER",
          mustChangePassword: false,
        },
        csrfToken: expect.any(String),
      },
    });
    expect(res.body.data.csrfToken.length).toBeGreaterThan(0);
  });

  it("sets toktickit_sid as HttpOnly, SameSite=Lax, Path=/, Max-Age=28800, and not Secure in test", async () => {
    const res = await login(ACTIVE, PASSWORD);

    const cookie = sessionCookie(res);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/; HttpOnly/i);
    expect(cookie).toMatch(/; SameSite=Lax/i);
    expect(cookie).toMatch(/; Path=\/(;|$)/);
    expect(cookie).toMatch(/; Max-Age=28800(;|$)/);
    expect(cookie).not.toMatch(/Secure/i);
  });

  it("stores the session for the user who signed in", async () => {
    const res = await login(ACTIVE, PASSWORD);

    const row = await prisma.session.findUnique({ where: { id: sha256Hex(tokenOf(res)) } });
    expect(row?.userId).toBe(res.body.data.user.id);
    expect(row?.csrfToken).toBe(res.body.data.csrfToken);
  });

  it.each([
    ["email", { password: PASSWORD }],
    ["password", { email: ACTIVE }],
    ["password", { email: ACTIVE, password: "" }],
  ])("returns 422 naming %s when it is missing, and sets no cookie", async (field, body) => {
    const res = await request(app).post("/api/v1/auth/login").send(body);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(res.body.error.details)).toEqual([field]);
    expect(sessionCookie(res)).toBeUndefined();
  });
});

describe("indistinguishable login failures (API-02 - AC-05, BR-07)", () => {
  it("returns byte-identical 401 bodies for a wrong password and an unknown email", async () => {
    const wrongPassword = await login(ACTIVE, "not the password 0001");
    const unknownEmail = await login("nobody.here@kmutt.ac.th", "not the password 0001");

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(INVALID_CREDENTIALS);
    expect(unknownEmail.text).toBe(wrongPassword.text);
    expect(sessionCookie(wrongPassword)).toBeUndefined();
    expect(sessionCookie(unknownEmail)).toBeUndefined();
  });
});

describe("inactive account (API-03 - AC-06, BR-08)", () => {
  it("returns 403 ACCOUNT_INACTIVE for the correct password, with no session", async () => {
    const res = await login(INACTIVE, PASSWORD);

    expect(res.status).toBe(403);
    expect(res.body).toEqual(ACCOUNT_INACTIVE);
    expect(sessionCookie(res)).toBeUndefined();
  });

  it("returns the generic 401 body for a wrong password", async () => {
    const generic = await login(ACTIVE, "not the password 0001");
    const res = await login(INACTIVE, "not the password 0001");

    expect(res.status).toBe(401);
    expect(res.text).toBe(generic.text);
  });
});

describe("account with no password (API-04 - AC-13, BR-14)", () => {
  it("returns the generic 401 body", async () => {
    const generic = await login(ACTIVE, "not the password 0001");
    const res = await login(NO_HASH, PASSWORD);

    expect(res.status).toBe(401);
    expect(res.text).toBe(generic.text);
  });
});

describe("login throttling over HTTP (API-05 - AC-07, BR-09)", () => {
  it("refuses the correct password after five failures, until the throttle is reset", async () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect((await login(ACTIVE, "not the password 0001")).status, `attempt ${attempt}`).toBe(401);
    }

    const throttled = await login(ACTIVE, PASSWORD);
    expect(throttled.status).toBe(429);
    expect(throttled.body).toEqual(TOO_MANY_ATTEMPTS);
    expect(throttled.headers["retry-after"]).toMatch(/^\d+$/);
    const retryAfter = Number(throttled.headers["retry-after"]);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(900);
    expect(sessionCookie(throttled)).toBeUndefined();

    resetLoginThrottle();

    expect((await login(ACTIVE, PASSWORD)).status).toBe(200);
  });
});

describe("login rotation (API-06 - AC-01, BR-17)", () => {
  it("revokes the session presented with a login and issues a new one", async () => {
    const agent = request.agent(app);
    const first = await agent.post("/api/v1/auth/login").send({ email: ACTIVE, password: PASSWORD });
    const firstToken = tokenOf(first);

    const second = await agent.post("/api/v1/auth/login").send({ email: ACTIVE, password: PASSWORD });
    const secondToken = tokenOf(second);

    expect(second.status).toBe(200);
    expect(secondToken).not.toBe(firstToken);
    const oldRow = await prisma.session.findUniqueOrThrow({ where: { id: sha256Hex(firstToken) } });
    expect(oldRow.revokedAt).not.toBeNull();
    expect((await me(firstToken)).status).toBe(401);
    expect((await me(secondToken)).status).toBe(200);
  });
});

describe("case-insensitive email (API-07 - AC-01, BR-06)", () => {
  it("signs in with a padded, upper-case email", async () => {
    const res = await login(" NAPAT.CHA@KMUTT.AC.TH ", PASSWORD);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(ACTIVE);
  });
});

describe("GET /api/v1/auth/me (API-08 - AC-01)", () => {
  it("returns the current user and the session's CSRF token", async () => {
    const { agent, csrfToken, user } = await loginAs(ACTIVE);

    const res = await agent.get("/api/v1/auth/me");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { user, csrfToken } });
  });

  it("returns 401 UNAUTHENTICATED without a session", async () => {
    const res = await request(app).get("/api/v1/auth/me");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: "UNAUTHENTICATED", message: expect.any(String) } });
  });

  it("is available to a user who must change their password (BR-21)", async () => {
    const { agent } = await loginAs(MUST_CHANGE);

    const res = await agent.get("/api/v1/auth/me");

    expect(res.status).toBe(200);
    expect(res.body.data.user.mustChangePassword).toBe(true);
  });
});

describe("POST /api/v1/auth/logout (API-09 - AC-08, BR-18)", () => {
  it("returns 204, clears the cookie, and ends the session", async () => {
    const res = await login(ACTIVE, PASSWORD);
    const token = tokenOf(res);

    const out = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", `toktickit_sid=${token}`)
      .set(CSRF_HEADER, res.body.data.csrfToken);

    expect(out.status).toBe(204);
    expect(out.text).toBe("");
    expect(sessionCookie(out)).toMatch(/^toktickit_sid=;/);
    expect(sessionCookie(out)).toMatch(/; Max-Age=0(;|$)/);
    expect((await me(token)).status).toBe(401);
  });

  it("returns 204 without a session", async () => {
    const res = await request(app).post("/api/v1/auth/logout");

    expect(res.status).toBe(204);
  });
});

describe("POST /api/v1/auth/password success (API-10 - AC-02, AC-10, BR-12)", () => {
  it("lets the must-change fixture set a new password, which replaces the old one", async () => {
    const { agent, csrfToken } = await loginAs(MUST_CHANGE);

    const res = await agent
      .post("/api/v1/auth/password")
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ email: MUST_CHANGE, mustChangePassword: false });
    expect(res.body.data.csrfToken).toEqual(expect.any(String));
    expect(res.body.data.csrfToken).not.toBe(csrfToken);

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: MUST_CHANGE } });
    expect(stored.mustChangePassword).toBe(false);
    expect(stored.passwordChangedAt).not.toBeNull();

    expect((await login(MUST_CHANGE, NEW_PASSWORD)).status).toBe(200);
    expect((await login(MUST_CHANGE, PASSWORD)).body).toEqual(INVALID_CREDENTIALS);
  });
});

describe("POST /api/v1/auth/password failures (API-11 - AC-10)", () => {
  const MESSAGES = {
    current: "Current password is incorrect.",
    length: "Password must be 12–128 characters.",
    same: "New password must be different from the current password.",
    mismatch: "Passwords do not match.",
  };

  it.each([
    ["a wrong current password", { currentPassword: "not the password 0001", newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }, { currentPassword: MESSAGES.current }],
    ["11 code points", { currentPassword: PASSWORD, newPassword: "a".repeat(11), confirmPassword: "a".repeat(11) }, { newPassword: MESSAGES.length }],
    ["a new password equal to the current one", { currentPassword: PASSWORD, newPassword: PASSWORD, confirmPassword: PASSWORD }, { newPassword: MESSAGES.same }],
    ["a mismatched confirmation", { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD + "x" }, { confirmPassword: MESSAGES.mismatch }],
    [
      "every failure at once",
      { currentPassword: "not the password 0001", newPassword: "a".repeat(11), confirmPassword: "b" },
      { currentPassword: MESSAGES.current, newPassword: MESSAGES.length, confirmPassword: MESSAGES.mismatch },
    ],
  ])("returns 422 for %s, naming each failing field, and changes nothing", async (_case, body, details) => {
    const before = await prisma.user.findUniqueOrThrow({ where: { email: ACTIVE } });
    const { agent } = await loginAs(ACTIVE);

    const res = await agent.post("/api/v1/auth/password").send(body);

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: { code: "VALIDATION_ERROR", message: "One or more fields are invalid.", details },
    });
    const after = await prisma.user.findUniqueOrThrow({ where: { email: ACTIVE } });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.passwordChangedAt).toEqual(before.passwordChangedAt);
  });

  it("returns 401 without a session", async () => {
    const res = await request(app)
      .post("/api/v1/auth/password")
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("other sessions revoked on password change (API-12 - AC-11, BR-12)", () => {
  it("ends agent B's session while agent A continues with a rotated cookie and CSRF token", async () => {
    const a = await loginAs(TWO_SESSIONS);
    const b = await loginAs(TWO_SESSIONS);
    expect((await a.agent.get("/api/v1/auth/me")).status).toBe(200);
    expect((await b.agent.get("/api/v1/auth/me")).status).toBe(200);

    const res = await a.agent
      .post("/api/v1/auth/password")
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });

    expect(res.status).toBe(200);
    const newCsrf = res.body.data.csrfToken;
    expect(newCsrf).not.toBe(a.csrfToken);
    const rotatedToken = tokenOf(res);

    expect((await b.agent.get("/api/v1/auth/me")).status).toBe(401);

    a.agent.set(CSRF_HEADER, newCsrf);
    const aAfter = await a.agent.get("/api/v1/auth/me");
    expect(aAfter.status).toBe(200);
    expect(aAfter.body.data.csrfToken).toBe(newCsrf);

    const live = await prisma.session.findMany({
      where: { user: { email: TWO_SESSIONS }, revokedAt: null },
    });
    expect(live.map((row) => row.id)).toEqual([sha256Hex(rotatedToken)]);
  });
});

describe("no secrets in auth responses (API-13 - AC-01, BR-10, BR-68)", () => {
  it("never returns a password hash, an Argon2 string, or the session token", async () => {
    const stored = await prisma.user.findUniqueOrThrow({ where: { email: SECRETS } });
    const agent = request.agent(app);

    const loggedIn = await agent.post("/api/v1/auth/login").send({ email: SECRETS, password: PASSWORD });
    const tokens = [tokenOf(loggedIn)];
    agent.set(CSRF_HEADER, loggedIn.body.data.csrfToken);

    const responses = [
      loggedIn,
      await login(SECRETS, "not the password 0001"),
      await agent.get("/api/v1/auth/me"),
      await agent.post("/api/v1/auth/password").send({ currentPassword: "wrong", newPassword: "x", confirmPassword: "y" }),
    ];
    const changed = await agent
      .post("/api/v1/auth/password")
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
    expect(changed.status).toBe(200);
    tokens.push(tokenOf(changed));
    responses.push(changed, await agent.post("/api/v1/auth/logout"));

    for (const res of responses) {
      const body = res.text;
      expect(body).not.toContain("passwordHash");
      expect(body).not.toContain("$argon2");
      expect(body).not.toContain(stored.passwordHash!);
      for (const token of tokens) {
        expect(body).not.toContain(token);
      }
    }
  });
});
