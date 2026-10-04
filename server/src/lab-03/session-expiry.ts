// Session lifetimes (BR-16, AC-09).
//
// A session ends 30 minutes after its last use or 8 hours after creation,
// whichever comes first. The absolute limit is stored on the row as
// expiresAt; the idle limit is measured from lastSeenAt.

export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000;

export function sessionExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + SESSION_ABSOLUTE_MS);
}

/** Both limits are exclusive: a session is expired at exactly 30:00 idle or 8 h. */
export function isSessionExpired(
  session: { lastSeenAt: Date; expiresAt: Date },
  now: Date = new Date(),
): boolean {
  const t = now.getTime();
  return t >= session.expiresAt.getTime() || t - session.lastSeenAt.getTime() >= SESSION_IDLE_MS;
}
