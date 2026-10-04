import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
  isSessionExpired,
  sessionExpiresAt,
} from "../../src/lab-03/session-expiry.js";

// UT-03 from docs/lab-03/tests.md section 2.1 (AC-09, BR-16).
//
// The clock is faked, so every boundary is exact to the millisecond.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const T0 = new Date("2026-10-01T08:00:00.000Z");

const at = (offsetMs: number) => new Date(T0.getTime() + offsetMs);

/** A session created at T0 and last used at `lastSeenAt`. */
const session = (lastSeenAt: Date) => ({ lastSeenAt, expiresAt: sessionExpiresAt(T0) });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("session lifetimes (UT-03 - BR-16)", () => {
  it("are 30 minutes idle and 8 hours absolute", () => {
    expect(SESSION_IDLE_MS).toBe(30 * MINUTE);
    expect(SESSION_ABSOLUTE_MS).toBe(8 * HOUR);
    expect(sessionExpiresAt(T0)).toEqual(at(8 * HOUR));
  });
});

describe("isSessionExpired (UT-03 - AC-09, BR-16)", () => {
  it("keeps a session idle for 29:59", () => {
    vi.setSystemTime(at(29 * MINUTE + 59 * 1000));

    expect(isSessionExpired(session(T0))).toBe(false);
  });

  it("expires a session idle for 30:00", () => {
    vi.setSystemTime(at(30 * MINUTE));

    expect(isSessionExpired(session(T0))).toBe(true);
  });

  it("expires an active session at 8 hours, however recently it was used", () => {
    const lastSeenAt = at(8 * HOUR - MINUTE);

    vi.setSystemTime(at(8 * HOUR - 1));
    expect(isSessionExpired(session(lastSeenAt))).toBe(false);

    vi.setSystemTime(at(8 * HOUR));
    expect(isSessionExpired(session(lastSeenAt))).toBe(true);
  });
});
