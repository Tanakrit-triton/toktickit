import { Router, type Request, type Response } from "express";
import type { Prisma } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { buildError, type ErrorBody } from "../lab-02/errors.js";
import { normaliseBody } from "./comment-body.js";
import { requireRole } from "./require-role.js";
import { requireSession, type CurrentUser } from "./require-session.js";

// Public Comments, Internal Notes, and the resolution indication
// (docs/lab-03/api-spec.md section 6, BR-43 to BR-53).
//
// Comments and notes live in separate tables behind separate endpoints, so no
// flag can make a note public (BR-50). Each route runs api-spec.md section 1.1
// steps 1 to 5 through its middleware, before any lookup; the handler does
// step 6 in the documented order: path, body, lookup and ownership, domain.

export const commentsNotesRouter = Router();

const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const anyRole = [requireSession];
const staffOnly = [requireSession, requireRole("IT_STAFF", "ADMINISTRATOR")];
const requesterOnly = [requireSession, requireRole("REQUESTER")];

/** BR-43: the statuses in which a Requester may indicate "appears resolved". */
const INDICATABLE_STATUSES = new Set(["OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"]);

/** A refusal decided inside a transaction; thrown so the transaction rolls back. */
class Refused extends Error {
  constructor(
    readonly status: number,
    readonly body: ErrorBody,
  ) {
    super(body.error.code);
  }
}

// The same body as the ownership refusal on GET /tickets/{id}, so a foreign
// ticket and a missing one are byte-identical (AC-22, BR-24).
const notFound = () =>
  new Refused(404, buildError("NOT_FOUND", "The requested resource does not exist."));
const stateConflict = (message: string) => new Refused(409, buildError("TICKET_STATE_CONFLICT", message));

/** A Requester reaches only their own tickets (BR-24); staff reach every ticket. */
const canReach = (user: CurrentUser, requesterId: string) =>
  user.role !== "REQUESTER" || user.id === requesterId;

type Tx = Prisma.TransactionClient;

/**
 * Reads the ticket for `user`, or throws the 404. With `lock`, the row is held
 * FOR SHARE, so a concurrent status change waits and the CLOSED check cannot
 * go stale before the insert (BR-52).
 */
async function reachableTicket(db: Tx, ticketId: string, user: CurrentUser, lock = false) {
  if (lock) {
    await db.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${ticketId} FOR SHARE`;
  }
  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    select: { requesterId: true, currentStatus: true, requesterIndicatedResolvedAt: true },
  });
  if (ticket === null || !canReach(user, ticket.requesterId)) {
    throw notFound();
  }
  return ticket;
}

/**
 * Answers a refusal with its documented response; anything else is a safe
 * 500. A malformed path id is answered before `work` runs.
 */
async function respond(
  req: Request,
  res: Response,
  failure: string,
  work: (ticketId: string) => Promise<{ status: number; data: unknown }>,
) {
  const { ticketId } = req.params;
  if (!UUID_PATTERN.test(ticketId)) {
    res.status(400).json(buildError("BAD_REQUEST", "The ticket identifier is not valid."));
    return;
  }
  try {
    const { status, data } = await work(ticketId);
    res.status(status).json({ data });
  } catch (error) {
    if (error instanceof Refused) {
      res.status(error.status).json(error.body);
      return;
    }
    res.status(500).json(buildError("INTERNAL_ERROR", failure));
  }
}

// ---------------------------------------------------------------------------
// Comments and notes share one shape (api-spec.md section 1.6) and one set of
// rules; only the table and the wording differ.

const ENTRY_SELECT = {
  id: true,
  ticketId: true,
  body: true,
  createdAt: true,
  author: { select: { id: true, fullName: true, role: true } },
} as const;

type EntryRow = {
  id: string;
  ticketId: string;
  body: string;
  createdAt: Date;
  author: { id: string; fullName: string; role: string };
};

const toEntry = (row: EntryRow) => ({
  id: row.id,
  ticketId: row.ticketId,
  author: row.author,
  body: row.body,
  createdAt: row.createdAt.toISOString(),
});

type EntryKind = {
  label: string;
  noun: string;
  list: (db: Tx, ticketId: string) => Promise<EntryRow[]>;
  create: (db: Tx, data: { ticketId: string; authorId: string; body: string }) => Promise<EntryRow>;
};

const COMMENTS: EntryKind = {
  label: "Comment",
  noun: "comments",
  list: (db, ticketId) =>
    db.publicComment.findMany({ where: { ticketId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: ENTRY_SELECT }),
  create: (db, data) => db.publicComment.create({ data, select: ENTRY_SELECT }),
};

const NOTES: EntryKind = {
  label: "Note",
  noun: "notes",
  list: (db, ticketId) =>
    db.internalNote.findMany({ where: { ticketId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: ENTRY_SELECT }),
  create: (db, data) => db.internalNote.create({ data, select: ENTRY_SELECT }),
};

/** GET -- oldest first, unpaginated (BR-51). */
function listEntries(kind: EntryKind) {
  return (req: Request, res: Response) =>
    respond(req, res, `Could not load the ${kind.noun}. Try again.`, async (ticketId) => {
      const prisma = getPrisma();
      await reachableTicket(prisma, ticketId, req.auth!.user);
      const rows = await kind.list(prisma, ticketId);
      return { status: 200, data: rows.map(toEntry) };
    });
}

/** POST -- author and time from the session and the server clock (BR-48). */
function postEntry(kind: EntryKind) {
  return (req: Request, res: Response) => {
    const author = req.auth!.user;
    const raw = (req.body ?? {}) as Record<string, unknown>;
    return respond(req, res, `The ${kind.label.toLowerCase()} could not be saved. Try again.`, async (ticketId) => {
      // Only body is read; a client authorId or createdAt is ignored (BR-48).
      const body = normaliseBody(raw.body);
      if (body === null) {
        throw new Refused(
          422,
          buildError("VALIDATION_ERROR", "One or more fields are invalid.", {
            body: `${kind.label} must be 1–2000 characters.`,
          }),
        );
      }
      const created = await getPrisma().$transaction(async (tx) => {
        const ticket = await reachableTicket(tx, ticketId, author, true);
        if (ticket.currentStatus === "CLOSED") {
          throw stateConflict(`A ${kind.label.toLowerCase()} cannot be added to a closed ticket.`);
        }
        return kind.create(tx, { ticketId, authorId: author.id, body });
      });
      return { status: 201, data: toEntry(created) };
    });
  };
}

// ---------------------------------------------------------------------------
// Routes

/** GET, POST /tickets/{ticketId}/comments (api-spec 6.1, 6.2). */
commentsNotesRouter.get("/tickets/:ticketId/comments", ...anyRole, listEntries(COMMENTS));
commentsNotesRouter.post("/tickets/:ticketId/comments", ...anyRole, postEntry(COMMENTS));

/** GET, POST /tickets/{ticketId}/notes (api-spec 6.3, 6.4). A Requester gets 403 before any lookup (AC-04). */
commentsNotesRouter.get("/tickets/:ticketId/notes", ...staffOnly, listEntries(NOTES));
commentsNotesRouter.post("/tickets/:ticketId/notes", ...staffOnly, postEntry(NOTES));

/** POST /tickets/{ticketId}/appears-resolved (api-spec 6.5, BR-43, BR-44, BR-55). */
commentsNotesRouter.post("/tickets/:ticketId/appears-resolved", ...requesterOnly, (req: Request, res: Response) => {
  const requester = req.auth!.user;
  return respond(req, res, "The indication could not be recorded. Try again.", (ticketId) =>
    getPrisma().$transaction(async (tx) => {
      // FOR UPDATE: two indications in parallel cannot both see a null
      // timestamp, so exactly one event is written.
      await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE`;
      const ticket = await reachableTicket(tx, ticketId, requester);
      // Status before the earlier indication, as api-spec 6.5 lists them.
      if (!INDICATABLE_STATUSES.has(ticket.currentStatus)) {
        throw stateConflict("The problem cannot be marked as appearing resolved in the ticket's current status.");
      }
      if (ticket.requesterIndicatedResolvedAt !== null) {
        throw new Refused(
          409,
          buildError("RESOLUTION_ALREADY_INDICATED", "You have already indicated that the problem appears resolved."),
        );
      }

      // The status never changes (BR-43). The event payload is empty and the
      // Requester is the actor (BR-55).
      const indicatedAt = new Date();
      await tx.ticket.update({ where: { id: ticketId }, data: { requesterIndicatedResolvedAt: indicatedAt } });
      await tx.ticketEvent.create({
        data: { ticketId, actorId: requester.id, eventType: "RESOLUTION_INDICATED", payload: {} },
      });
      return { status: 200, data: { requesterIndicatedResolvedAt: indicatedAt.toISOString() } };
    }),
  );
});
