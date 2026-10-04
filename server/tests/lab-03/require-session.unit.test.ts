import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import {
  LAST_SEEN_WRITE_MS,
  createRequireSession,
  type SessionRecord,
} from "../../src/lab-03/require-session.js";
import { SESSION_COOKIE } from "../../src/lab-03/session-cookie.js";

// UT-06 from docs/lab-03/tests.md section 2.1 (AC-02, AC-09, BR-16, BR-19,
// BR-21).
//
// The middleware is built over an in-memory session store, so each case sets
// the exact row it needs and the clock is faked. The API tests never stub this
// middleware: they reach it through real logins (tests.md section 1).

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const T0 = new Date("2026-10-01T08:00:00.000Z");
const at = (offsetMs: number) => new Date(T0.getTime() + offsetMs);

const TOKEN = "session-token";

const UNAUTHENTICATED = {
  error: { code: "UNAUTHENTICATED", message: expect.any(String) },
};

/** A live row for an active user who need not change their password. */
function record(overrides: Partial<SessionRecord> = {}, user: Partial<SessionRecord["user"]> = {}): SessionRecord {
  return {
    id: "session-hash",
    csrfToken: "csrf-token",
    lastSeenAt: T0,
    expiresAt: at(8 * HOUR),
    revokedAt: null,
    ...overrides,
    user: {
      id: "user-1",
      fullName: "Napat Chaiwong",
      email: "napat.cha@kmutt.ac.th",
      role: "REQUESTER",
      mustChangePassword: false,
      isActive: true,
      ...user,
    },
  };
}

function harness(row: SessionRecord | null) {
  const store = {
    load: vi.fn(async (token: string) => (token === TOKEN ? row : null)),
    touch: vi.fn(async () => {}),
  };
  return { store, requireSession: createRequireSession(store) };
}

type Outcome = { status?: number; body?: unknown; nextCalled: boolean; req: Request };

async function run(
  handler: ReturnType<typeof createRequireSession>,
  { method = "GET", url = "/api/v1/categories", cookie }: { method?: string; url?: string; cookie?: string } = {},
): Promise<Outcome> {
  // Every request carries the session's CSRF token, so these cases exercise
  // steps 1, 2, and 4 and never trip the CSRF check (step 3) that #37 adds.
  const headers = { "x-csrf-token": "csrf-token", ...(cookie === undefined ? {} : { cookie }) };
  const req = { method, originalUrl: url, headers } as unknown as Request;
  const outcome: Outcome = { nextCalled: false, req };
  const res = {
    status(code: number) {
      outcome.status = code;
      return this;
    },
    json(body: unknown) {
      outcome.body = body;
      return this;
    },
  } as unknown as Response;
  const next: NextFunction = () => {
    outcome.nextCalled = true;
  };
  await handler(req, res, next);
  return outcome;
}

const withToken = `${SESSION_COOKIE}=${TOKEN}`;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("requireSession refuses a missing or dead session (UT-06 - AC-09, BR-16)", () => {
  it("returns 401 when no cookie is sent, without reading the store", async () => {
    const { store, requireSession } = harness(record());

    const outcome = await run(requireSession);

    expect(outcome.status).toBe(401);
    expect(outcome.body).toEqual(UNAUTHENTICATED);
    expect(outcome.nextCalled).toBe(false);
    expect(store.load).not.toHaveBeenCalled();
  });

  it("returns 401 for a token that resolves to no session", async () => {
    const { requireSession } = harness(record());

    const outcome = await run(requireSession, { cookie: `${SESSION_COOKIE}=unknown-token` });

    expect(outcome.status).toBe(401);
    expect(outcome.body).toEqual(UNAUTHENTICATED);
    expect(outcome.nextCalled).toBe(false);
  });

  it("finds the session cookie among other cookies", async () => {
    const { requireSession } = harness(record());

    const outcome = await run(requireSession, { cookie: `theme=dark; ${withToken}; lang=en` });

    expect(outcome.nextCalled).toBe(true);
  });

  it("returns 401 for a revoked session", async () => {
    const { requireSession } = harness(record({ revokedAt: T0 }));

    const outcome = await run(requireSession, { cookie: withToken });

    expect(outcome.status).toBe(401);
    expect(outcome.body).toEqual(UNAUTHENTICATED);
    expect(outcome.nextCalled).toBe(false);
  });

  it("accepts a session idle for 29:59 and refuses one idle for 30:00", async () => {
    const { requireSession } = harness(record());

    vi.setSystemTime(at(29 * MINUTE + 59 * 1000));
    expect((await run(requireSession, { cookie: withToken })).nextCalled).toBe(true);

    vi.setSystemTime(at(30 * MINUTE));
    const outcome = await run(requireSession, { cookie: withToken });
    expect(outcome.status).toBe(401);
    expect(outcome.body).toEqual(UNAUTHENTICATED);
  });

  it("refuses a recently used session at its 8-hour absolute limit", async () => {
    const { requireSession } = harness(record({ lastSeenAt: at(8 * HOUR - MINUTE) }));

    vi.setSystemTime(at(8 * HOUR));
    const outcome = await run(requireSession, { cookie: withToken });

    expect(outcome.status).toBe(401);
    expect(outcome.body).toEqual(UNAUTHENTICATED);
  });

  it("returns 401 when the session's user is inactive (BR-19)", async () => {
    const { requireSession } = harness(record({}, { isActive: false }));

    const outcome = await run(requireSession, { cookie: withToken });

    expect(outcome.status).toBe(401);
    expect(outcome.body).toEqual(UNAUTHENTICATED);
    expect(outcome.nextCalled).toBe(false);
  });
});

describe("requireSession attaches the identity (UT-06 - AC-09)", () => {
  it("passes a live session through with the user and CSRF token, and no secret", async () => {
    const { requireSession } = harness(record());

    const outcome = await run(requireSession, { cookie: withToken });

    expect(outcome.status).toBeUndefined();
    expect(outcome.nextCalled).toBe(true);
    expect(outcome.req.auth).toEqual({
      sessionId: "session-hash",
      csrfToken: "csrf-token",
      user: {
        id: "user-1",
        fullName: "Napat Chaiwong",
        email: "napat.cha@kmutt.ac.th",
        role: "REQUESTER",
        mustChangePassword: false,
      },
    });
  });

  it("writes lastSeenAt once it is 60 seconds old, and not before (A-03)", async () => {
    expect(LAST_SEEN_WRITE_MS).toBe(MINUTE);
    const { store, requireSession } = harness(record());

    vi.setSystemTime(at(MINUTE - 1));
    await run(requireSession, { cookie: withToken });
    expect(store.touch).not.toHaveBeenCalled();

    vi.setSystemTime(at(MINUTE));
    await run(requireSession, { cookie: withToken });
    expect(store.touch).toHaveBeenCalledWith("session-hash", at(MINUTE));
  });
});

describe("requireSession password-change gate (UT-06 - AC-02, BR-21)", () => {
  const PASSWORD_CHANGE_REQUIRED = {
    error: { code: "PASSWORD_CHANGE_REQUIRED", message: expect.any(String) },
  };

  it.each([
    ["GET", "/api/v1/categories"],
    ["GET", "/api/v1/tickets"],
    ["POST", "/api/v1/tickets"],
    ["GET", "/api/v1/staff/tickets"],
    ["GET", "/api/v1/admin/users"],
    // The method matters: only POST /auth/password is exempt.
    ["GET", "/api/v1/auth/password"],
  ])("refuses %s %s with 403 PASSWORD_CHANGE_REQUIRED", async (method, url) => {
    const { requireSession } = harness(record({}, { mustChangePassword: true }));

    const outcome = await run(requireSession, { method, url, cookie: withToken });

    expect(outcome.status).toBe(403);
    expect(outcome.body).toEqual(PASSWORD_CHANGE_REQUIRED);
    expect(outcome.nextCalled).toBe(false);
  });

  it.each([
    ["GET", "/api/v1/auth/me"],
    ["POST", "/api/v1/auth/password"],
    ["POST", "/api/v1/auth/logout"],
    ["GET", "/api/v1/auth/me?fresh=1"],
  ])("lets %s %s through", async (method, url) => {
    const { requireSession } = harness(record({}, { mustChangePassword: true }));

    const outcome = await run(requireSession, { method, url, cookie: withToken });

    expect(outcome.nextCalled).toBe(true);
    expect(outcome.req.auth?.user.mustChangePassword).toBe(true);
  });

  it("checks the session before the gate: a dead must-change session gets 401", async () => {
    const { requireSession } = harness(record({ revokedAt: T0 }, { mustChangePassword: true }));

    const outcome = await run(requireSession, { cookie: withToken });

    expect(outcome.status).toBe(401);
  });
});
