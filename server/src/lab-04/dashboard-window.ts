// The dashboards' recent window (docs/lab-04/specification.md BR-36,
// api-spec.md section 5): from 00:00 Asia/Bangkok, six calendar days before
// today, up to the request time. Thailand has no daylight saving, so the zone
// is a fixed +07:00 offset (A-02) and no time-zone database is needed.

export const DASHBOARD_TIME_ZONE = "Asia/Bangkok";

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAYS_BEFORE_TODAY = 6;

export type DashboardWindow = { from: Date; to: Date; timeZone: typeof DASHBOARD_TIME_ZONE };

/** The window for a request made at `now` (UT-06). */
export function dashboardWindow(now: Date = new Date()): DashboardWindow {
  // Shift into Bangkok wall-clock time, take that calendar date, step back six
  // days (Date.UTC carries across month and year ends), and shift back.
  const bangkok = new Date(now.getTime() + BANGKOK_OFFSET_MS);
  const midnight = Date.UTC(
    bangkok.getUTCFullYear(),
    bangkok.getUTCMonth(),
    bangkok.getUTCDate() - DAYS_BEFORE_TODAY,
  );
  return { from: new Date(midnight - BANGKOK_OFFSET_MS), to: now, timeZone: DASHBOARD_TIME_ZONE };
}
