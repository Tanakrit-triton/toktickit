import type { TicketStatus } from "@prisma/client";

// Shared by the dashboard API tests (docs/lab-04/tests.md section 2.5). Every
// value here is written out from the contract, independently of the dashboard
// code, so a test never compares the endpoint with itself.

/** specification.md section 5.4. */
export const ACTIVE: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"];
export const DONE: TicketStatus[] = ["RESOLVED", "CLOSED"];

/**
 * BR-36: 00:00 Asia/Bangkok (fixed +07:00), six calendar days before the
 * Bangkok date of `now`.
 */
export function recentWindowStart(now: Date): Date {
  const BANGKOK_MS = 7 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + BANGKOK_MS);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - 6);
  return new Date(midnight - BANGKOK_MS);
}

/**
 * The API request behind a dashboard link (api-spec section 5): My Tickets is
 * GET /api/v1/tickets, and the Ticket Queue route /staff/queue is
 * GET /api/v1/staff/tickets. The query string is carried over unchanged.
 */
export function apiPathOf(link: string): string {
  const [route, query = ""] = link.split("?");
  const api = { "/tickets": "/api/v1/tickets", "/staff/queue": "/api/v1/staff/tickets" }[route];
  if (api === undefined) throw new Error(`No API list behind the link ${link}`);
  return query === "" ? api : `${api}?${query}`;
}
