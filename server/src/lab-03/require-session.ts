import type { NextFunction, Request, Response } from "express";
import { getPrisma } from "../prisma.js";
import { buildError } from "../lab-02/errors.js";
import { CSRF_INVALID, csrfMatches, isStateChanging } from "./csrf.js";
import { readSessionToken } from "./session-cookie.js";
import { isSessionExpired } from "./session-expiry.js";
import { hashSessionToken } from "./sessions.js";

// requireSession (api-spec.md section 1.1, BR-16, BR-19, BR-21).
//
// Implements steps 1 to 4 of the session resolution order:
//   1  a cookie resolving to a live session       else 401 UNAUTHENTICATED
//   2  the session's user is active               else 401 UNAUTHENTICATED
//   3  the CSRF token matches, on a state change  else 403 CSRF_INVALID
//   4  mustChangePassword is false, unless exempt else 403 PASSWORD_CHANGE_REQUIRED
// Step 5 (role) is requireRole, mounted after this on each route family.
//
// The store is injected so UT-06 can drive every branch with a fake clock;
// the exported requireSession is built over Prisma.

export type Role = "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";

/** The CurrentUser DTO (api-spec.md section 1.6). Never carries a secret. */
export type CurrentUser = {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
};

export type SessionRecord = {
  id: string;
  csrfToken: string;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  user: CurrentUser & { isActive: boolean };
};

export type SessionStore = {
  load(token: string): Promise<SessionRecord | null>;
  touch(sessionId: string, at: Date): Promise<void>;
};

export type AuthContext = { sessionId: string; csrfToken: string; user: CurrentUser };

declare module "express-serve-static-core" {
  interface Request {
    /** Set by requireSession. */
    auth?: AuthContext;
  }
}

/** lastSeenAt is rewritten at most once a minute per session (A-03). */
export const LAST_SEEN_WRITE_MS = 60 * 1000;

/** Available while mustChangePassword is true (BR-21). */
const PASSWORD_CHANGE_EXEMPT = new Set([
  "GET /api/v1/auth/me",
  "POST /api/v1/auth/password",
  "POST /api/v1/auth/logout",
]);

const routeOf = (req: Request) => {
  const path = req.originalUrl.split("?")[0].replace(/\/+$/, "");
  return `${req.method} ${path}`;
};

export function toCurrentUser(user: CurrentUser): CurrentUser {
  const { id, fullName, email, role, mustChangePassword } = user;
  return { id, fullName, email, role, mustChangePassword };
}

export function createRequireSession(store: SessionStore) {
  return async function requireSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = readSessionToken(req);
      const session = token === null ? null : await store.load(token);
      const now = new Date();

      // An unknown, revoked, or expired session, and an inactive user, are all
      // treated exactly as no session (BR-16, BR-19).
      if (
        session === null ||
        session.revokedAt !== null ||
        isSessionExpired(session, now) ||
        !session.user.isActive
      ) {
        res.status(401).json(buildError("UNAUTHENTICATED", "Sign in to continue."));
        return;
      }

      // Refused before any change is made (BR-20), and before the
      // password-change gate, which is step 4.
      if (isStateChanging(req) && !csrfMatches(req, session.csrfToken)) {
        res.status(403).json(CSRF_INVALID);
        return;
      }

      if (session.user.mustChangePassword && !PASSWORD_CHANGE_EXEMPT.has(routeOf(req))) {
        res
          .status(403)
          .json(buildError("PASSWORD_CHANGE_REQUIRED", "Change your password to continue."));
        return;
      }

      if (now.getTime() - session.lastSeenAt.getTime() >= LAST_SEEN_WRITE_MS) {
        await store.touch(session.id, now);
      }

      req.auth = {
        sessionId: session.id,
        csrfToken: session.csrfToken,
        user: toCurrentUser(session.user),
      };
      next();
    } catch {
      res.status(500).json(buildError("INTERNAL_ERROR", "Something went wrong. Try again."));
    }
  };
}

const prismaStore: SessionStore = {
  load: (token) =>
    getPrisma().session.findUnique({
      where: { id: hashSessionToken(token) },
      select: {
        id: true,
        csrfToken: true,
        lastSeenAt: true,
        expiresAt: true,
        revokedAt: true,
        user: {
          select: { id: true, fullName: true, email: true, role: true, mustChangePassword: true, isActive: true },
        },
      },
    }),
  touch: async (sessionId, at) => {
    await getPrisma().session.update({ where: { id: sessionId }, data: { lastSeenAt: at } });
  },
};

export const requireSession = createRequireSession(prismaStore);
