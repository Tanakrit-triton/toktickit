import { Router, type Request, type Response } from "express";
import { Prisma } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { buildError, type ErrorBody, type ErrorDetails } from "../lab-02/errors.js";
import { requireSession, type CurrentUser } from "../lab-03/require-session.js";
import {
  ACTION_EDITABLE_TICKET_STATUSES,
  ACTION_STATUS_LABELS,
  CREATABLE_ACTION_STATUSES,
  actionEditRefusal,
  isActionStatus,
  type ActionField,
  type ActionStatus,
} from "./action-rules.js";
import { validateActionFields, type ActionFields, type ActionFieldsInput } from "./action-validation.js";

// Actions Taken (docs/lab-04/api-spec.md section 2, BR-01 to BR-19, BR-29 to
// BR-31, BR-33, BR-34, Amendments 1 and 3).
//
// actionsRouter is mounted under /api/v1 and runs api-spec section 1.1 steps
// 1 to 5 through requireSession; any role may read. staffActionsRouter is
// mounted under /api/v1/staff, behind the route-family guard in app.ts. Every
// handler then does the remaining steps in the documented order.
//
// The action rules themselves live in action-rules.ts (transitions, edit
// policy, ticket states) and action-validation.ts (field rules). This file
// only orders the checks and writes.

export const actionsRouter = Router();
export const staffActionsRouter = Router();

const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const isUuid = (value: unknown): value is string => typeof value === "string" && UUID_PATTERN.test(value);

const ELIGIBLE_PERFORMER_ROLES = ["IT_STAFF", "ADMINISTRATOR"] as const;
const EDITABLE_TICKET_STATUSES = [...ACTION_EDITABLE_TICKET_STATUSES];

const PERFORMER_INVALID = "Choose an active IT Staff or Administrator user.";

/** A refusal decided anywhere in a handler; thrown so a transaction rolls back. */
class Refused extends Error {
  constructor(
    readonly status: number,
    readonly body: ErrorBody,
  ) {
    super(body.error.code);
  }
}

const notFound = () => new Refused(404, buildError("NOT_FOUND", "The requested resource does not exist."));
const invalid = (details: ErrorDetails) =>
  new Refused(422, buildError("VALIDATION_ERROR", "One or more fields are invalid.", details));
const ticketStateConflict = () =>
  new Refused(
    409,
    buildError("TICKET_STATE_CONFLICT", "Actions can only be recorded on an open ticket. Claim or reopen it first."),
  );
const staleUpdate = () =>
  new Refused(
    409,
    buildError("STALE_UPDATE", "This ticket was changed by someone else. Reload to see the latest version."),
  );

/** Answers a refusal with its documented response; anything else is a safe 500. */
async function respond(
  res: Response,
  failure: string,
  work: () => Promise<{ status: number; body: unknown }>,
) {
  try {
    const { status, body } = await work();
    res.status(status).json(body);
  } catch (error) {
    if (error instanceof Refused) {
      res.status(error.status).json(error.body);
      return;
    }
    res.status(500).json(buildError("INTERNAL_ERROR", failure));
  }
}

// ---------------------------------------------------------------------------
// The ActionTaken DTO (api-spec section 1.2)

const USER_REF = { select: { id: true, fullName: true, isActive: true } } as const;
const ACTION_INCLUDE = { performedBy: USER_REF, createdBy: USER_REF } satisfies Prisma.ActionTakenInclude;
type ActionRow = Prisma.ActionTakenGetPayload<{ include: typeof ACTION_INCLUDE }>;

const toAction = (row: ActionRow) => ({
  id: row.id,
  ticketId: row.ticketId,
  actionAt: row.actionAt.toISOString(),
  description: row.description,
  result: row.result,
  status: row.status,
  performedBy: row.performedBy,
  createdBy: row.createdBy,
  followUpRequired: row.followUpRequired,
  followUpNote: row.followUpNote,
  attachmentNotes: row.attachmentNotes,
  version: row.version,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** BR-19: actionAt, then createdAt, then id, so equal times still list stably. */
const ACTION_ORDER: Prisma.ActionTakenOrderByWithRelationInput[] = [
  { actionAt: "asc" },
  { createdAt: "asc" },
  { id: "asc" },
];

type Db = Prisma.TransactionClient;

/** BR-04: an existing, active IT Staff or Administrator user. */
async function isEligiblePerformer(db: Db, userId: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { isActive: true, role: true } });
  return user !== null && user.isActive && (ELIGIBLE_PERFORMER_ROLES as readonly string[]).includes(user.role);
}

/**
 * BR-30, BR-33: advances the ticket's version and updatedAt, on condition that
 * it is still in a status that allows action writes. A ticket that left those
 * statuses concurrently is a TICKET_STATE_CONFLICT. Returns the new version.
 */
async function touchTicket(tx: Db, ticketId: string): Promise<number> {
  const { count } = await tx.ticket.updateMany({
    where: { id: ticketId, currentStatus: { in: EDITABLE_TICKET_STATUSES } },
    data: { version: { increment: 1 }, updatedAt: new Date() },
  });
  if (count === 0) {
    throw ticketStateConflict();
  }
  const { version } = await tx.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: { version: true } });
  return version;
}

const isClientRequestIdClash = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002" &&
  JSON.stringify(error.meta?.target ?? "").includes("clientRequestId");

// ---------------------------------------------------------------------------
// GET /tickets/{ticketId}/actions (api-spec section 2.1)

function canReach(user: CurrentUser, requesterId: string) {
  return user.role !== "REQUESTER" || user.id === requesterId;
}

actionsRouter.get("/tickets/:ticketId/actions", requireSession, (req: Request, res: Response) => {
  const { ticketId } = req.params;
  if (!isUuid(ticketId)) {
    res.status(400).json(buildError("BAD_REQUEST", "The ticket identifier is not valid."));
    return;
  }
  return respond(res, "Could not load the actions. Try again.", async () => {
    const prisma = getPrisma();
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { requesterId: true } });
    // A foreign ticket and a missing one get the same body (L3-BR-24).
    if (ticket === null || !canReach(req.auth!.user, ticket.requesterId)) {
      throw notFound();
    }
    const rows = await prisma.actionTaken.findMany({ where: { ticketId }, include: ACTION_INCLUDE, orderBy: ACTION_ORDER });
    return { status: 200, body: { data: rows.map(toAction) } };
  });
});

// ---------------------------------------------------------------------------
// POST /staff/tickets/{ticketId}/actions (api-spec section 2.2)

staffActionsRouter.post("/tickets/:ticketId/actions", (req: Request, res: Response) => {
  const { ticketId } = req.params;
  if (!isUuid(ticketId)) {
    res.status(400).json(buildError("BAD_REQUEST", "The ticket identifier is not valid."));
    return;
  }
  const caller = req.auth!.user;
  const raw = (req.body ?? {}) as Record<string, unknown>;

  return respond(res, "The action could not be saved. Try again.", async () => {
    const prisma = getPrisma();
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, createdAt: true, currentStatus: true, version: true },
    });
    if (ticket === null) {
      throw notFound();
    }

    /** BR-31: a repeat on this ticket returns the original; elsewhere it is refused. */
    const repeatOf = async (clientRequestId: string) => {
      const existing = await prisma.actionTaken.findUnique({ where: { clientRequestId }, include: ACTION_INCLUDE });
      if (existing === null) return null;
      if (existing.ticketId !== ticketId) {
        throw invalid({ clientRequestId: "This request id was already used." });
      }
      const { version } = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: { version: true } });
      return { status: 200, body: { data: toAction(existing), ticketVersion: version } };
    };

    const details: ErrorDetails = {};

    // The idempotency lookup comes first, before any other rule (Amendment 3).
    const { clientRequestId } = raw;
    if (!isUuid(clientRequestId)) {
      details.clientRequestId = "Send a request id (UUID) with the action.";
    } else {
      const repeat = await repeatOf(clientRequestId);
      if (repeat !== null) return repeat;
    }

    // BR-14: PLANNED by default; never created as CANCELLED.
    const status: ActionStatus = raw.status === undefined || raw.status === null ? "PLANNED" : (raw.status as ActionStatus);
    const statusValid = isActionStatus(status) && CREATABLE_ACTION_STATUSES.has(status);
    if (!statusValid) {
      details.status = "Choose Planned, In Progress, or Completed.";
    }

    const checked = validateActionFields(raw as unknown as ActionFieldsInput, {
      status: statusValid ? status : "PLANNED",
      ticketCreatedAt: ticket.createdAt,
      now: new Date(),
    });
    if (!checked.ok) {
      Object.assign(details, checked.details);
    }

    // BR-04: the caller unless another eligible user is named.
    const performedById = raw.performedById === undefined || raw.performedById === null ? caller.id : raw.performedById;
    if (!isUuid(performedById) || !(await isEligiblePerformer(prisma, performedById))) {
      details.performedById = PERFORMER_INVALID;
    }

    if (Object.keys(details).length > 0 || !checked.ok) {
      throw invalid(details);
    }

    // BR-17, then the write (api-spec section 2.2 side effects).
    if (!ACTION_EDITABLE_TICKET_STATUSES.has(ticket.currentStatus)) {
      throw ticketStateConflict();
    }
    try {
      return await prisma.$transaction(async (tx) => {
        const ticketVersion = await touchTicket(tx, ticketId);
        const created = await tx.actionTaken.create({
          data: {
            ticketId,
            createdById: caller.id,
            performedById: performedById as string,
            status,
            clientRequestId: clientRequestId as string,
            ...checked.value,
          },
          include: ACTION_INCLUDE,
        });
        await tx.ticketEvent.create({
          data: {
            ticketId,
            actorId: caller.id,
            eventType: "ACTION_CREATED",
            payload: { actionId: created.id, status: created.status, performedById: created.performedById },
          },
        });
        return { status: 201, body: { data: toAction(created), ticketVersion } };
      });
    } catch (error) {
      // Two identical requests raced: the unique index settled it, and the
      // loser answers like a sequential repeat (BR-31).
      if (isClientRequestIdClash(error)) {
        const repeat = await repeatOf(clientRequestId as string);
        if (repeat !== null) return repeat;
      }
      throw error;
    }
  });
});

// ---------------------------------------------------------------------------
// PATCH /staff/actions/{actionId} (api-spec section 2.3)

/** Text fields: the change log says only that they changed (BR-34). */
const TEXT_FIELDS = new Set<ActionField>(["description", "result", "followUpNote", "attachmentNotes"]);
const EDIT_FIELDS: ActionField[] = [
  "actionAt",
  "description",
  "result",
  "performedById",
  "followUpRequired",
  "followUpNote",
  "attachmentNotes",
];

/** Trimmed text with empty as null, for comparing a sent value with a stored one. */
function comparableText(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function comparableTime(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? value : time;
}

type Stored = ActionRow;

/**
 * The fields this body would change. Values equal to the stored ones are
 * dropped (Amendment 1), so a repeated value is never a change. A follow-up
 * note sent while the resulting action needs no follow-up is stored as null
 * whatever was sent (BR-09), so it is not a change either.
 */
function sentChanges(stored: Stored, body: Record<string, unknown>): ActionField[] {
  const followUpAfter = typeof body.followUpRequired === "boolean" ? body.followUpRequired : stored.followUpRequired;
  return EDIT_FIELDS.filter((field) => {
    if (!(field in body) || body[field] === undefined) return false;
    switch (field) {
      case "actionAt":
        return comparableTime(body.actionAt) !== stored.actionAt.getTime();
      case "performedById":
        return body.performedById !== stored.performedById;
      case "followUpRequired":
        return body.followUpRequired !== stored.followUpRequired;
      case "followUpNote":
        return followUpAfter && comparableText(body.followUpNote) !== stored.followUpNote;
      default:
        return comparableText(body[field]) !== stored[field];
    }
  });
}

/** BR-34: { from, to } for status-like fields and actionAt; { changed: true } for text. */
function changeLog(stored: Stored, next: ActionFields & { status: ActionStatus; performedById: string }) {
  const changes: Record<string, Prisma.InputJsonValue> = {};
  if (next.status !== stored.status) changes.status = { from: stored.status, to: next.status };
  if (next.actionAt.getTime() !== stored.actionAt.getTime()) {
    changes.actionAt = { from: stored.actionAt.toISOString(), to: next.actionAt.toISOString() };
  }
  if (next.performedById !== stored.performedById) {
    changes.performedById = { from: stored.performedById, to: next.performedById };
  }
  if (next.followUpRequired !== stored.followUpRequired) {
    changes.followUpRequired = { from: stored.followUpRequired, to: next.followUpRequired };
  }
  for (const field of TEXT_FIELDS) {
    const key = field as "description" | "result" | "followUpNote" | "attachmentNotes";
    if (next[key] !== stored[key]) changes[key] = { changed: true };
  }
  return changes;
}

staffActionsRouter.patch("/actions/:actionId", (req: Request, res: Response) => {
  const { actionId } = req.params;
  if (!isUuid(actionId)) {
    res.status(400).json(buildError("BAD_REQUEST", "The action identifier is not valid."));
    return;
  }
  const caller = req.auth!.user;
  const body = (req.body ?? {}) as Record<string, unknown>;

  return respond(res, "The action could not be saved. Try again.", async () => {
    const prisma = getPrisma();
    const stored = await prisma.actionTaken.findUnique({
      where: { id: actionId },
      include: { ...ACTION_INCLUDE, ticket: { select: { createdAt: true, currentStatus: true, version: true } } },
    });
    if (stored === null) {
      throw notFound();
    }

    // Step 8 for a PATCH: the body's shape only (Amendment 3).
    const shape: ErrorDetails = {};
    if (!Number.isInteger(body.version)) {
      shape.version = "Send the version of the action you are editing.";
    }
    if (body.status !== undefined && !isActionStatus(body.status)) {
      shape.status = "Choose a valid action status.";
    }
    if (body.performedById !== undefined && !isUuid(body.performedById)) {
      shape.performedById = PERFORMER_INVALID;
    }
    if (Object.keys(shape).length > 0) {
      throw invalid(shape);
    }

    // a. Version (BR-29).
    if (body.version !== stored.version) {
      throw staleUpdate();
    }
    // b. Ticket status (BR-17).
    if (!ACTION_EDITABLE_TICKET_STATUSES.has(stored.ticket.currentStatus)) {
      throw ticketStateConflict();
    }

    // c, d. Status transition, then edit policy, on the values that change.
    const statusTo = body.status !== undefined && body.status !== stored.status ? (body.status as ActionStatus) : undefined;
    const fields = sentChanges(stored, body);
    const refusal = actionEditRefusal(stored.status, { statusTo, fields });
    if (refusal === "INVALID_ACTION_TRANSITION") {
      throw new Refused(
        409,
        buildError(
          refusal,
          `This action cannot move from ${ACTION_STATUS_LABELS[stored.status]} to ${ACTION_STATUS_LABELS[statusTo!]}.`,
        ),
      );
    }
    if (refusal === "ACTION_STATE_CONFLICT") {
      throw new Refused(
        409,
        buildError(
          refusal,
          `This action is ${ACTION_STATUS_LABELS[stored.status]} and can no longer be changed in that way.`,
        ),
      );
    }

    // Nothing changes: 200, no event, no version increment.
    if (statusTo === undefined && fields.length === 0) {
      return { status: 200, body: { data: toAction(stored), ticketVersion: stored.ticket.version } };
    }

    // e. Field rules on the resulting action.
    const status = statusTo ?? stored.status;
    const pick = (field: ActionField) => (fields.includes(field) ? body[field] : stored[field]);
    const checked = validateActionFields(
      {
        actionAt: pick("actionAt"),
        description: pick("description"),
        result: pick("result"),
        followUpRequired: pick("followUpRequired"),
        followUpNote: pick("followUpNote"),
        attachmentNotes: pick("attachmentNotes"),
      },
      { status, ticketCreatedAt: stored.ticket.createdAt, now: new Date() },
    );
    const details: ErrorDetails = checked.ok ? {} : { ...checked.details };
    const performedById = pick("performedById") as string;
    if (fields.includes("performedById") && !(await isEligiblePerformer(prisma, performedById))) {
      details.performedById = PERFORMER_INVALID;
    }
    if (!checked.ok || Object.keys(details).length > 0) {
      throw invalid(details);
    }

    const next = { ...checked.value, status, performedById };
    const changes = changeLog(stored, next);
    if (Object.keys(changes).length === 0) {
      return { status: 200, body: { data: toAction(stored), ticketVersion: stored.ticket.version } };
    }

    return prisma.$transaction(async (tx) => {
      // The conditional update is the real version check; the one above only
      // orders the refusals (api-spec section 2.3 side effect 1).
      const { count } = await tx.actionTaken.updateMany({
        where: { id: actionId, version: stored.version },
        data: { ...next, version: { increment: 1 } },
      });
      if (count === 0) {
        throw staleUpdate();
      }
      const ticketVersion = await touchTicket(tx, stored.ticketId);
      await tx.ticketEvent.create({
        data: {
          ticketId: stored.ticketId,
          actorId: caller.id,
          eventType: "ACTION_UPDATED",
          payload: { actionId, changes },
        },
      });
      const updated = await tx.actionTaken.findUniqueOrThrow({ where: { id: actionId }, include: ACTION_INCLUDE });
      return { status: 200, body: { data: toAction(updated), ticketVersion } };
    });
  });
});
