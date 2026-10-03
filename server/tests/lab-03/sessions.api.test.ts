import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash } from "node:crypto";
import { getPrisma } from "../../src/prisma.js";
import { createSession, resolveSession, revokeAllSessions } from "../../src/lab-03/sessions.js";

// SES-01 and SES-02 from docs/lab-03/tests.md section 2.2 (BR-15, BR-64,
// AC-11).
//
// This suite creates its own two users rather than borrowing seeded accounts,
// so revoking every session of one of them cannot disturb another suite.

const prisma = getPrisma();

const USER_A_EMAIL = "zz.sessions.a@example.test";
const USER_B_EMAIL = "zz.sessions.b@example.test";
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

let userA = "";
let userB = "";

const sha256Hex = (value: string) => createHash("sha256").update(value).digest("hex");

beforeAll(async () => {
  const a = await prisma.user.upsert({
    where: { email: USER_A_EMAIL },
    update: { isActive: true },
    create: { fullName: "ZZ Sessions A", email: USER_A_EMAIL },
  });
  const b = await prisma.user.upsert({
    where: { email: USER_B_EMAIL },
    update: { isActive: true },
    create: { fullName: "ZZ Sessions B", email: USER_B_EMAIL },
  });
  userA = a.id;
  userB = b.id;
  await prisma.session.deleteMany({ where: { userId: { in: [userA, userB] } } });
});

afterAll(async () => {
  await prisma.session.deleteMany({ where: { userId: { in: [userA, userB] } } });
  await prisma.user.deleteMany({ where: { email: { in: [USER_A_EMAIL, USER_B_EMAIL] } } });
  await prisma.$disconnect();
});

describe("createSession (SES-01 - BR-15)", () => {
  it("issues a 32-byte random token", async () => {
    const { token } = await createSession(userA);

    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("stores the SHA-256 of the token as the row id, and never the token", async () => {
    const { token } = await createSession(userA);

    const row = await prisma.session.findUnique({ where: { id: sha256Hex(token) } });
    expect(row, "no session row is keyed by the token's SHA-256").not.toBeNull();
    expect(row!.userId).toBe(userA);

    for (const [column, value] of Object.entries(row!)) {
      expect(String(value), `column ${column} contains the raw token`).not.toContain(token);
    }
  });

  it("stores a CSRF token distinct from the session token", async () => {
    const { token, csrfToken } = await createSession(userA);

    const row = await prisma.session.findUniqueOrThrow({ where: { id: sha256Hex(token) } });
    expect(csrfToken.length).toBeGreaterThan(0);
    expect(csrfToken).not.toBe(token);
    expect(row.csrfToken).toBe(csrfToken);
  });

  it("starts unrevoked, with an absolute expiry 8 hours after creation", async () => {
    const { token } = await createSession(userA);

    const row = await prisma.session.findUniqueOrThrow({ where: { id: sha256Hex(token) } });
    expect(row.revokedAt).toBeNull();
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(EIGHT_HOURS_MS);
  });
});

describe("revokeAllSessions (SES-02 - AC-11, BR-64)", () => {
  it("revokes every session of the user and no one else's", async () => {
    const a1 = await createSession(userA);
    const a2 = await createSession(userA);
    const b1 = await createSession(userB);

    expect((await resolveSession(a1.token))?.userId).toBe(userA);

    await revokeAllSessions(userA);

    const aRows = await prisma.session.findMany({ where: { userId: userA } });
    expect(aRows.length).toBeGreaterThanOrEqual(2);
    for (const row of aRows) {
      expect(row.revokedAt, `session ${row.id} of user A is still live`).not.toBeNull();
    }

    const bRows = await prisma.session.findMany({ where: { userId: userB } });
    expect(bRows).toHaveLength(1);
    expect(bRows[0].revokedAt).toBeNull();

    expect(await resolveSession(a1.token)).toBeNull();
    expect(await resolveSession(a2.token)).toBeNull();
    expect((await resolveSession(b1.token))?.userId).toBe(userB);
  });
});
