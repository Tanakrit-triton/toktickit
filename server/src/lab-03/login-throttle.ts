// Login throttle (BR-09, AC-07, DEC-06).
//
// Failures are counted per client address and normalised email over a
// sliding 15-minute window. The fifth failure blocks the pair until the
// oldest failure in the window ages out, even for the correct password. No
// lockout is stored, so no account ever needs unlocking.
//
// State is held in process memory (A-02) and is lost on restart. Only test
// code calls resetLoginThrottle(); throttling is never disabled.

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export type ThrottleState = { blocked: false } | { blocked: true; retryAfterSeconds: number };

/** Failure timestamps (ms) per pair, oldest first. */
const failures = new Map<string, number[]>();

const keyOf = (ip: string, email: string) => `${ip}\n${email}`;

/** The pair's failures still inside the window, pruning the rest. */
function recent(key: string, now: number): number[] {
  const kept = (failures.get(key) ?? []).filter((at) => now - at < LOGIN_WINDOW_MS);
  if (kept.length === 0) {
    failures.delete(key);
  } else {
    failures.set(key, kept);
  }
  return kept;
}

export function checkLoginThrottle(ip: string, email: string): ThrottleState {
  const now = Date.now();
  const kept = recent(keyOf(ip, email), now);
  if (kept.length < LOGIN_MAX_FAILURES) {
    return { blocked: false };
  }
  // Unblocked once enough failures age out to drop below the limit.
  const releaseAt = kept[kept.length - LOGIN_MAX_FAILURES] + LOGIN_WINDOW_MS;
  return { blocked: true, retryAfterSeconds: Math.max(1, Math.ceil((releaseAt - now) / 1000)) };
}

export function recordLoginFailure(ip: string, email: string): void {
  const now = Date.now();
  const key = keyOf(ip, email);
  failures.set(key, [...recent(key, now), now]);
}

/** A successful login clears the pair's counter. */
export function clearLoginFailures(ip: string, email: string): void {
  failures.delete(keyOf(ip, email));
}

/** Test hook (api-spec.md section 2.1). It has no HTTP route. */
export function resetLoginThrottle(): void {
  failures.clear();
}
