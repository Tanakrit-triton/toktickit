import { Router, type Request, type Response } from "express";
import type { Prisma } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { buildError } from "../lab-02/errors.js";

// GET /staff/tickets/{ticketId}/history (docs/lab-04/api-spec.md section 3.4,
// BR-34, DEC-13).
//
// Mounted under /api/v1/staff, behind the route-family guard in app.ts, so a
// Requester is refused with 403 before any lookup. Read-only: there is no
// write endpoint for events.

export const staffHistoryRouter = Router();

const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Every UUID-shaped string anywhere in a payload. Non-user ids simply find no user. */
function idsIn(value: Prisma.JsonValue, found: Set<string>): Set<string> {
  if (typeof value === "string") {
    if (UUID_PATTERN.test(value)) found.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) idsIn(item, found);
  } else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) idsIn(item ?? null, found);
  }
  return found;
}

staffHistoryRouter.get("/tickets/:ticketId/history", async (req: Request, res: Response) => {
  const { ticketId } = req.params;
  if (!UUID_PATTERN.test(ticketId)) {
    res.status(400).json(buildError("BAD_REQUEST", "The ticket identifier is not valid."));
    return;
  }
  try {
    const prisma = getPrisma();
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true } });
    if (ticket === null) {
      res.status(404).json(buildError("NOT_FOUND", "The requested resource does not exist."));
      return;
    }

    // Oldest first, then by id, so events with the same time list stably.
    const events = await prisma.ticketEvent.findMany({
      where: { ticketId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { actor: { select: { id: true, fullName: true } } },
    });

    // Every user id a payload mentions, so the client never resolves ids.
    const mentioned = new Set<string>();
    for (const event of events) idsIn(event.payload, mentioned);
    const users = await prisma.user.findMany({
      where: { id: { in: [...mentioned] } },
      select: { id: true, fullName: true },
    });

    res.status(200).json({
      data: events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        // null only for the L3-BR-40 owner clearance.
        actor: event.actor,
        payload: event.payload,
        createdAt: event.createdAt.toISOString(),
      })),
      users: Object.fromEntries(users.map((user) => [user.id, user.fullName])),
    });
  } catch {
    res.status(500).json(buildError("INTERNAL_ERROR", "Could not load the history. Try again."));
  }
});
