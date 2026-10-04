import { Router, type Request, type Response } from "express";
import type { Prisma, TicketEventType } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { buildError, type ErrorBody } from "../lab-02/errors.js";
import { toAttachmentResponse } from "../lab-02/attachments.routes.js";
import { REQUESTED_PRIORITIES, type RequestedPriorityValue } from "../lab-02/validation.js";
import {
  ASSIGNABLE_STATUSES,
  CLAIMABLE_STATUSES,
  IT_PRIORITY_EDITABLE_STATUSES,
  STATUS_LABELS,
  availableTransitions,
  isTicketStatus,
  isTransitionPermitted,
  isStatusEndpointTransition,
  requiresOwner,
  requiresReason,
  type TicketStatus,
} from "./transitions.js";

// IT Staff ticket operations (docs/lab-03/api-spec.md sections 5.2 to 5.7, 8).
//
// Mounted under /api/v1/staff, behind the route-family guard in app.ts, so
// every handler here already has an active IT Staff or Administrator session
// (api-spec.md section 1.1 steps 1 to 5). Each handler does step 6.
//
// Every change runs in one transaction that first locks the ticket row, so
// the checks and the write see the same state, and each Ticket Event is
// written with the change it records (BR-54).

export const staffTicketOpsRouter = Router();

const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const REASON_MIN = 5;
const REASON_MAX = 500;

const ELIGIBLE_OWNER_ROLES = ["IT_STAFF", "ADMINISTRATOR"] as const;

/** A refusal decided inside a transaction; thrown so the transaction rolls back. */
class OperationRefused extends Error {
  constructor(
    readonly status: number,
    readonly body: ErrorBody,
  ) {
    super(body.error.code);
  }
}

const notFound = () =>
  new OperationRefused(404, buildError("NOT_FOUND", "The requested resource does not exist."));
const stateConflict = () =>
  new OperationRefused(
    409,
    buildError("TICKET_STATE_CONFLICT", "This change is not allowed in the ticket's current status."),
  );
const invalidField = (field: string, message: string) =>
  new OperationRefused(422, buildError("VALIDATION_ERROR", "One or more fields are invalid.", { [field]: message }));

const OWNER_INVALID = () => invalidField("ownerId", "Choose an active IT Staff or Administrator user.");

// ---------------------------------------------------------------------------
// Detail (api-spec.md section 5.2)

const DETAIL_SELECT = {
  id: true,
  ticketNumber: true,
  summary: true,
  description: true,
  requestedPriority: true,
  itPriority: true,
  currentStatus: true,
  requesterIndicatedResolvedAt: true,
  createdAt: true,
  updatedAt: true,
  requester: { select: { id: true, fullName: true, email: true } },
  owner: { select: { id: true, fullName: true } },
  category: { select: { id: true, name: true } },
  relatedSystem: { select: { id: true, name: true } },
  attachments: { orderBy: { uploadedAt: "asc" } },
} satisfies Prisma.TicketSelect;

async function loadDetail(ticketId: string) {
  const ticket = await getPrisma().ticket.findUnique({ where: { id: ticketId }, select: DETAIL_SELECT });
  if (ticket === null) {
    return null;
  }
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    // A projection of createdAt, as in the Lab 2 detail.
    ticketDate: ticket.createdAt.toISOString(),
    requester: ticket.requester,
    category: ticket.category,
    relatedSystem: ticket.relatedSystem,
    summary: ticket.summary,
    description: ticket.description,
    requestedPriority: ticket.requestedPriority,
    itPriority: ticket.itPriority,
    currentStatus: ticket.currentStatus,
    owner: ticket.owner,
    requesterIndicatedResolvedAt: ticket.requesterIndicatedResolvedAt?.toISOString() ?? null,
    availableTransitions: availableTransitions(ticket.currentStatus, ticket.owner !== null),
    attachments: ticket.attachments.map(toAttachmentResponse),
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Shared plumbing

type Tx = Prisma.TransactionClient;

/** Locks the ticket row for the rest of the transaction and reads it. */
async function lockTicket(tx: Tx, ticketId: string) {
  await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE`;
  const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
  if (ticket === null) {
    throw notFound();
  }
  return ticket;
}

/** BR-55. actorId is null only for the owner clearance on reopen (BR-40). */
function recordEvent(
  tx: Tx,
  ticketId: string,
  actorId: string | null,
  eventType: TicketEventType,
  payload: Prisma.InputJsonObject,
) {
  return tx.ticketEvent.create({ data: { ticketId, actorId, eventType, payload } });
}

/** BR-28: an active IT Staff or Administrator user. */
async function isEligibleOwner(tx: Tx, userId: string): Promise<boolean> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { isActive: true, role: true } });
  return user !== null && user.isActive && (ELIGIBLE_OWNER_ROLES as readonly string[]).includes(user.role);
}

/**
 * Validates the path id, runs the operation, and answers with the fresh
 * detail. Refusals become their documented response; anything else is a safe
 * 500.
 */
async function respondWith(
  req: Request,
  res: Response,
  failure: string,
  operation: (ticketId: string) => Promise<void>,
) {
  const { ticketId } = req.params;
  if (!UUID_PATTERN.test(ticketId)) {
    res.status(400).json(buildError("BAD_REQUEST", "The ticket identifier is not valid."));
    return;
  }
  try {
    await operation(ticketId);
    const detail = await loadDetail(ticketId);
    if (detail === null) {
      throw notFound();
    }
    res.status(200).json({ data: detail });
  } catch (error) {
    if (error instanceof OperationRefused) {
      res.status(error.status).json(error.body);
      return;
    }
    res.status(500).json(buildError("INTERNAL_ERROR", failure));
  }
}

// ---------------------------------------------------------------------------
// Routes

/** GET /staff/assignees -- users eligible to be Ticket Owner (api-spec 5.3). */
staffTicketOpsRouter.get("/assignees", async (_req: Request, res: Response) => {
  try {
    const data = await getPrisma().user.findMany({
      where: { isActive: true, role: { in: [...ELIGIBLE_OWNER_ROLES] } },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, role: true },
    });
    res.status(200).json({ data });
  } catch {
    res.status(500).json(buildError("INTERNAL_ERROR", "Could not load the assignees. Try again."));
  }
});

/** GET /staff/tickets/{ticketId} (api-spec 5.2). Any ticket (BR-27). */
staffTicketOpsRouter.get("/tickets/:ticketId", (req: Request, res: Response) =>
  respondWith(req, res, "Could not load the ticket. Try again.", async () => {}),
);

/** POST /staff/tickets/{ticketId}/claim (api-spec 5.4, BR-29, BR-31, DEC-13). */
staffTicketOpsRouter.post("/tickets/:ticketId/claim", (req: Request, res: Response) => {
  const actorId = req.auth!.user.id;
  return respondWith(req, res, "The ticket could not be claimed. Try again.", (ticketId) =>
    getPrisma().$transaction(async (tx) => {
      const ticket = await lockTicket(tx, ticketId);
      // Status first: a CLOSED ticket always has an owner, and must still
      // report the lock rather than the claim (BR-39).
      if (!CLAIMABLE_STATUSES.has(ticket.currentStatus)) {
        throw stateConflict();
      }
      const alreadyClaimed = new OperationRefused(
        409,
        buildError("TICKET_ALREADY_CLAIMED", "This ticket has already been claimed."),
      );
      if (ticket.ownerId !== null) {
        throw alreadyClaimed;
      }

      const to: TicketStatus = ticket.currentStatus === "NEW" ? "OPEN" : ticket.currentStatus;
      // The conditional update is the claim itself (DEC-13): it succeeds only
      // while the ticket is still unassigned.
      const { count } = await tx.ticket.updateMany({
        where: { id: ticketId, ownerId: null, currentStatus: ticket.currentStatus },
        data: { ownerId: actorId, currentStatus: to },
      });
      if (count === 0) {
        throw alreadyClaimed;
      }

      await recordEvent(tx, ticketId, actorId, "OWNER_CHANGED", { fromOwnerId: null, toOwnerId: actorId, cause: "CLAIM" });
      if (to !== ticket.currentStatus) {
        await recordEvent(tx, ticketId, actorId, "STATUS_CHANGED", { from: ticket.currentStatus, to });
      }
    }),
  );
});

/** PUT /staff/tickets/{ticketId}/owner (api-spec 5.5, BR-28, BR-30, BR-31). */
staffTicketOpsRouter.put("/tickets/:ticketId/owner", (req: Request, res: Response) => {
  const actorId = req.auth!.user.id;
  const ownerId = (req.body ?? {}).ownerId as unknown;
  return respondWith(req, res, "The ticket could not be assigned. Try again.", async (ticketId) => {
    if (typeof ownerId !== "string" || !UUID_PATTERN.test(ownerId)) {
      throw OWNER_INVALID();
    }
    await getPrisma().$transaction(async (tx) => {
      const ticket = await lockTicket(tx, ticketId);
      if (!(await isEligibleOwner(tx, ownerId))) {
        throw OWNER_INVALID();
      }
      if (!ASSIGNABLE_STATUSES.has(ticket.currentStatus)) {
        throw stateConflict();
      }
      if (ticket.ownerId === ownerId) {
        return; // BR-30: no change and no event.
      }

      const to: TicketStatus = ticket.currentStatus === "NEW" ? "OPEN" : ticket.currentStatus;
      await tx.ticket.update({ where: { id: ticketId }, data: { ownerId, currentStatus: to } });
      await recordEvent(tx, ticketId, actorId, "OWNER_CHANGED", {
        fromOwnerId: ticket.ownerId,
        toOwnerId: ownerId,
        cause: "ASSIGN",
      });
      if (to !== ticket.currentStatus) {
        await recordEvent(tx, ticketId, actorId, "STATUS_CHANGED", { from: ticket.currentStatus, to });
      }
    });
  });
});

/** PUT /staff/tickets/{ticketId}/it-priority (api-spec 5.6, BR-33). */
staffTicketOpsRouter.put("/tickets/:ticketId/it-priority", (req: Request, res: Response) => {
  const actorId = req.auth!.user.id;
  const itPriority = (req.body ?? {}).itPriority as unknown;
  return respondWith(req, res, "The IT Priority could not be changed. Try again.", async (ticketId) => {
    if (typeof itPriority !== "string" || !(REQUESTED_PRIORITIES as readonly string[]).includes(itPriority)) {
      throw invalidField("itPriority", "Choose Low, Medium, High, or Urgent.");
    }
    const to = itPriority as RequestedPriorityValue;
    await getPrisma().$transaction(async (tx) => {
      const ticket = await lockTicket(tx, ticketId);
      if (!IT_PRIORITY_EDITABLE_STATUSES.has(ticket.currentStatus)) {
        throw stateConflict();
      }
      if (ticket.itPriority === to) {
        return; // No change and no event.
      }
      // requestedPriority is never written here (BR-33).
      await tx.ticket.update({ where: { id: ticketId }, data: { itPriority: to } });
      await recordEvent(tx, ticketId, actorId, "IT_PRIORITY_CHANGED", { from: ticket.itPriority, to });
    });
  });
});

/** POST /staff/tickets/{ticketId}/status (api-spec 5.7, BR-35 to BR-40). */
staffTicketOpsRouter.post("/tickets/:ticketId/status", (req: Request, res: Response) => {
  const actor = req.auth!.user;
  const body = (req.body ?? {}) as Record<string, unknown>;
  return respondWith(req, res, "The status could not be changed. Try again.", async (ticketId) => {
    // Order of evaluation: status (422), transition (409), owner (409),
    // reason (422).
    const to = body.status;
    if (!isTicketStatus(to)) {
      throw invalidField("status", "Choose a valid status.");
    }
    await getPrisma().$transaction(async (tx) => {
      const ticket = await lockTicket(tx, ticketId);
      const from = ticket.currentStatus;

      if (!isTransitionPermitted(from, to, actor.role) || !isStatusEndpointTransition(from, to)) {
        throw new OperationRefused(
          409,
          buildError(
            "INVALID_STATUS_TRANSITION",
            `This ticket cannot move from ${STATUS_LABELS[from]} to ${STATUS_LABELS[to]}.`,
          ),
        );
      }
      if (requiresOwner(to) && ticket.ownerId === null) {
        throw new OperationRefused(
          409,
          buildError("TICKET_OWNER_REQUIRED", `Assign a Ticket Owner before moving this ticket to ${STATUS_LABELS[to]}.`),
        );
      }

      let reason: string | undefined;
      if (requiresReason(to)) {
        const trimmed = typeof body.reason === "string" ? body.reason.trim() : "";
        if (trimmed.length < REASON_MIN || trimmed.length > REASON_MAX) {
          throw invalidField("reason", `Enter a reason of ${REASON_MIN} to ${REASON_MAX} characters.`);
        }
        reason = trimmed;
      }

      // BR-40: reopening clears the indication, and an owner who is no
      // longer eligible.
      const reopening = to === "REOPENED";
      const clearOwner =
        reopening && ticket.ownerId !== null && !(await isEligibleOwner(tx, ticket.ownerId));

      await tx.ticket.update({
        where: { id: ticketId },
        data: {
          currentStatus: to,
          ...(reopening ? { requesterIndicatedResolvedAt: null } : {}),
          ...(clearOwner ? { ownerId: null } : {}),
        },
      });
      await recordEvent(tx, ticketId, actor.id, "STATUS_CHANGED", reason === undefined ? { from, to } : { from, to, reason });
      if (clearOwner) {
        await recordEvent(tx, ticketId, null, "OWNER_CHANGED", {
          fromOwnerId: ticket.ownerId,
          toOwnerId: null,
          cause: "OWNER_INELIGIBLE_ON_REOPEN",
        });
      }
    });
  });
});
