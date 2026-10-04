import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { isSessionExpired, sessionExpiresAt } from "./session-expiry.js";

// The session store (BR-15, BR-16, BR-64, DEC-05).
//
// The browser holds a 32-byte random token. The database holds only its
// SHA-256 hash, as the row id, so a leaked sessions table cannot be replayed.
// The CSRF token lives on the same row (synchronizer token, DEC-05).
//
// Cookie handling, lastSeenAt refresh, and the isActive re-check belong to the
// request middleware, require-session.ts.

const TOKEN_BYTES = 32;

type Db = Prisma.TransactionClient;

export type ResolvedSession = {
  sessionId: string;
  userId: string;
  csrfToken: string;
  lastSeenAt: Date;
  expiresAt: Date;
};

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const randomToken = () => randomBytes(TOKEN_BYTES).toString("base64url");

/** Creates a session for `userId`. The raw token is returned once and never stored. */
export async function createSession(
  userId: string,
  db: Db = getPrisma(),
): Promise<{ token: string; csrfToken: string; expiresAt: Date }> {
  const token = randomToken();
  const csrfToken = randomToken();
  const createdAt = new Date();
  const expiresAt = sessionExpiresAt(createdAt);

  await db.session.create({
    data: {
      id: hashSessionToken(token),
      userId,
      csrfToken,
      createdAt,
      lastSeenAt: createdAt,
      expiresAt,
    },
  });

  return { token, csrfToken, expiresAt };
}

/**
 * The live session for `token`, or null when it is unknown, revoked, or past
 * either expiry limit. All three are treated exactly as no session (BR-16).
 */
export async function resolveSession(
  token: string,
  db: Db = getPrisma(),
): Promise<ResolvedSession | null> {
  const row = await db.session.findUnique({ where: { id: hashSessionToken(token) } });
  if (row === null || row.revokedAt !== null || isSessionExpired(row)) {
    return null;
  }
  return {
    sessionId: row.id,
    userId: row.userId,
    csrfToken: row.csrfToken,
    lastSeenAt: row.lastSeenAt,
    expiresAt: row.expiresAt,
  };
}

/** Revokes the session for `token`, if it is live. Unknown tokens are ignored. */
export async function revokeSessionByToken(token: string, db: Db = getPrisma()): Promise<void> {
  await db.session.updateMany({
    where: { id: hashSessionToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Revokes every live session of `userId` and returns how many were revoked. */
export async function revokeAllSessions(userId: string, db: Db = getPrisma()): Promise<number> {
  const { count } = await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return count;
}
