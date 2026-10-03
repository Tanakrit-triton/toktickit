import { randomBytes } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { getPrisma } from "../prisma.js";
import { buildError, type ErrorDetails } from "../lab-02/errors.js";
import { normaliseEmail } from "./email.js";
import { hashPassword, verifyPassword } from "./password-hash.js";
import { validatePasswordChange } from "./password-policy.js";
import { checkLoginThrottle, clearLoginFailures, recordLoginFailure } from "./login-throttle.js";
import { requireSession, toCurrentUser } from "./require-session.js";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "./session-cookie.js";
import { createSession, resolveSession, revokeAllSessions, revokeSessionByToken } from "./sessions.js";

// Authentication endpoints (api-spec.md section 2, FR-01 to FR-05).
//
// No response here ever carries a password, a hash, or a session token
// (BR-10, BR-68): users leave through toCurrentUser, and the token travels
// only in the HttpOnly cookie.
//
// CSRF on logout and password change is enforced by #37 (tests.md section 3),
// which adds it to requireSession for every state-changing request.

export const authRouter = Router();

const INVALID_CREDENTIALS = buildError("INVALID_CREDENTIALS", "The email or password is incorrect.");

const currentUserSelect = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  mustChangePassword: true,
} as const;

// Unknown users and users without a password are verified against this hash,
// so a login takes the same time whether or not the account exists (BR-07).
// It hashes a random value, so nothing can ever verify against it.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword(randomBytes(32).toString("base64url")));

/** POST /api/v1/auth/login (section 2.1). Public and exempt from CSRF. */
authRouter.post("/auth/login", async (req: Request, res: Response) => {
  try {
    const { email: rawEmail, password } = (req.body ?? {}) as Record<string, unknown>;

    // 1. Validation. The email is only required here: an address that cannot
    // exist simply fails to log in.
    const details: ErrorDetails = {};
    if (typeof rawEmail !== "string" || rawEmail.trim() === "") {
      details.email = "Enter your email.";
    }
    if (typeof password !== "string" || password === "") {
      details.password = "Enter your password.";
    }
    if (Object.keys(details).length > 0) {
      res.status(422).json(buildError("VALIDATION_ERROR", "One or more fields are invalid.", details));
      return;
    }

    const email = normaliseEmail(rawEmail as string);
    const ip = req.ip ?? "";

    // 2. Throttle (BR-09).
    const throttle = checkLoginThrottle(ip, email);
    if (throttle.blocked) {
      res
        .status(429)
        .set("Retry-After", String(throttle.retryAfterSeconds))
        .json(buildError("TOO_MANY_ATTEMPTS", "Too many sign-in attempts. Try again in a few minutes."));
      return;
    }

    // 3–4. Look up and verify, always running one verification (BR-07, BR-14).
    const user = await getPrisma().user.findUnique({
      where: { email },
      select: { ...currentUserSelect, isActive: true, passwordHash: true },
    });
    const storedHash = user?.passwordHash ?? null;
    const verified = await verifyPassword(storedHash ?? (await getDummyHash()), password as string);
    if (user === null || storedHash === null || !verified) {
      recordLoginFailure(ip, email);
      res.status(401).json(INVALID_CREDENTIALS);
      return;
    }

    // 5. Inactive is revealed only after the password verified (BR-08), and
    // is not counted as a failure.
    if (!user.isActive) {
      res
        .status(403)
        .json(buildError("ACCOUNT_INACTIVE", "This account is inactive. Contact your administrator."));
      return;
    }

    // 6. Success: clear the counter, revoke any presented session, issue a new one (BR-17).
    clearLoginFailures(ip, email);
    const presented = readSessionToken(req);
    if (presented !== null) {
      await revokeSessionByToken(presented);
    }
    const { token, csrfToken } = await createSession(user.id);

    setSessionCookie(res, token);
    res.status(200).json({ data: { user: toCurrentUser(user), csrfToken } });
  } catch {
    res.status(500).json(buildError("INTERNAL_ERROR", "Could not sign in. Try again."));
  }
});

/** POST /api/v1/auth/logout (section 2.2). Without a live session it does nothing (BR-18). */
authRouter.post("/auth/logout", async (req: Request, res: Response) => {
  try {
    const token = readSessionToken(req);
    if (token !== null && (await resolveSession(token)) !== null) {
      await revokeSessionByToken(token);
      clearSessionCookie(res);
    }
    res.status(204).end();
  } catch {
    res.status(500).json(buildError("INTERNAL_ERROR", "Could not sign out. Try again."));
  }
});

/** GET /api/v1/auth/me (section 2.3). Exempt from the password-change gate. */
authRouter.get("/auth/me", requireSession, (req: Request, res: Response) => {
  const { user, csrfToken } = req.auth!;
  res.status(200).json({ data: { user, csrfToken } });
});

/** POST /api/v1/auth/password (section 2.4, BR-11, BR-12). */
authRouter.post("/auth/password", requireSession, async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const userId = req.auth!.user.id;
    const prisma = getPrisma();

    const { passwordHash } = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true },
    });
    const currentVerified =
      passwordHash !== null &&
      typeof body.currentPassword === "string" &&
      (await verifyPassword(passwordHash, body.currentPassword));

    // Every failing field is reported together.
    const details: ErrorDetails = {
      ...(currentVerified ? {} : { currentPassword: "Current password is incorrect." }),
      ...validatePasswordChange({
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
        confirmPassword: body.confirmPassword,
      }),
    };
    if (Object.keys(details).length > 0) {
      res.status(422).json(buildError("VALIDATION_ERROR", "One or more fields are invalid.", details));
      return;
    }

    const newHash = await hashPassword(body.newPassword as string);

    // One transaction: the new hash, every session revoked (the current one
    // included), and a fresh session to rotate onto.
    const { user, session } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { passwordHash: newHash, mustChangePassword: false, passwordChangedAt: new Date() },
        select: currentUserSelect,
      });
      await revokeAllSessions(userId, tx);
      const session = await createSession(userId, tx);
      return { user, session };
    });

    setSessionCookie(res, session.token);
    res.status(200).json({ data: { user: toCurrentUser(user), csrfToken: session.csrfToken } });
  } catch {
    res.status(500).json(buildError("INTERNAL_ERROR", "Could not change the password. Try again."));
  }
});
