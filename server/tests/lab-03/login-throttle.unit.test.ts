import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW_MS,
  checkLoginThrottle,
  clearLoginFailures,
  recordLoginFailure,
  resetLoginThrottle,
} from "../../src/lab-03/login-throttle.js";

// UT-05 from docs/lab-03/tests.md section 2.1 (AC-07, BR-09).
//
// The clock is faked, so the 15-minute window is exact to the millisecond.
// Every test starts from an empty throttle through resetLoginThrottle(), the
// test-only hook BR-09 allows. The throttle itself is never disabled.

const MINUTE = 60 * 1000;
const T0 = new Date("2026-10-01T08:00:00.000Z");

const IP = "203.0.113.10";
const OTHER_IP = "203.0.113.11";
const EMAIL = "napat.cha@kmutt.ac.th";
const OTHER_EMAIL = "siriporn.mee@kmutt.ac.th";

const fail = (times: number, ip = IP, email = EMAIL) => {
  for (let i = 0; i < times; i += 1) recordLoginFailure(ip, email);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  resetLoginThrottle();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("login throttle limits (UT-05 - BR-09)", () => {
  it("allows five failures in 15 minutes", () => {
    expect(LOGIN_MAX_FAILURES).toBe(5);
    expect(LOGIN_WINDOW_MS).toBe(15 * MINUTE);
  });
});

describe("login throttle (UT-05 - AC-07, BR-09)", () => {
  it("allows the first five attempts and blocks the sixth", () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect(checkLoginThrottle(IP, EMAIL).blocked, `attempt ${attempt}`).toBe(false);
      recordLoginFailure(IP, EMAIL);
    }

    expect(checkLoginThrottle(IP, EMAIL).blocked).toBe(true);
  });

  it("reports the seconds until the window passes", () => {
    fail(5);

    expect(checkLoginThrottle(IP, EMAIL)).toEqual({ blocked: true, retryAfterSeconds: 900 });

    vi.setSystemTime(new Date(T0.getTime() + 10 * MINUTE));
    expect(checkLoginThrottle(IP, EMAIL)).toEqual({ blocked: true, retryAfterSeconds: 300 });
  });

  it("does not block a different email from the same address", () => {
    fail(5);

    expect(checkLoginThrottle(IP, OTHER_EMAIL).blocked).toBe(false);
  });

  it("does not block the same email from a different address", () => {
    fail(5);

    expect(checkLoginThrottle(OTHER_IP, EMAIL).blocked).toBe(false);
  });

  it("clears the counter on success", () => {
    fail(4);
    clearLoginFailures(IP, EMAIL);
    fail(4);

    expect(checkLoginThrottle(IP, EMAIL).blocked).toBe(false);
  });

  it("lets the block expire when the 15-minute window passes", () => {
    fail(5);

    vi.setSystemTime(new Date(T0.getTime() + LOGIN_WINDOW_MS - 1));
    expect(checkLoginThrottle(IP, EMAIL).blocked).toBe(true);

    vi.setSystemTime(new Date(T0.getTime() + LOGIN_WINDOW_MS));
    expect(checkLoginThrottle(IP, EMAIL).blocked).toBe(false);
  });

  it("counts only failures inside the window", () => {
    fail(4);
    vi.setSystemTime(new Date(T0.getTime() + LOGIN_WINDOW_MS));
    fail(1);

    expect(checkLoginThrottle(IP, EMAIL).blocked).toBe(false);
  });

  it("forgets every address and email on resetLoginThrottle()", () => {
    fail(5, IP, EMAIL);
    fail(5, OTHER_IP, OTHER_EMAIL);

    resetLoginThrottle();

    expect(checkLoginThrottle(IP, EMAIL).blocked).toBe(false);
    expect(checkLoginThrottle(OTHER_IP, OTHER_EMAIL).blocked).toBe(false);
  });
});
