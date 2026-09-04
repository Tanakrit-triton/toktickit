import { Router, type Request, type Response } from "express";
import { getPrisma } from "../prisma.js";
import { buildError, type ErrorDetails } from "./errors.js";
import { requireRequester } from "./requester-context.js";
import { formatTicketNumber, nextSequence } from "./ticket-number.js";
import {
  validateDescription,
  validateReferenceId,
  validateRequestedPriority,
  validateSummary,
  type RequestedPriorityValue,
} from "./validation.js";

// Ticket endpoints (api-spec.md section 3).

export const ticketsRouter = Router();

type TicketWithRelations = {
  id: string;
  ticketNumber: string;
  summary: string;
  description: string;
  requestedPriority: string;
  currentStatus: string;
  createdAt: Date;
  updatedAt: Date;
  requester: { id: string; fullName: string };
  category: { id: number; name: string };
  relatedSystem: { id: number; name: string };
};

/**
 * The 201 body from api-spec.md 3.1.
 *
 * ticketDate is a projection of createdAt, not a stored column: BR-06 defines
 * Ticket Date as the creation timestamp and section 7 declares no separate
 * field. Emitting both satisfies the documented contract without keeping a
 * second value that could drift from the first.
 */
function toTicketResponse(ticket: TicketWithRelations) {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    ticketDate: ticket.createdAt.toISOString(),
    requester: ticket.requester,
    category: ticket.category,
    relatedSystem: ticket.relatedSystem,
    summary: ticket.summary,
    requestedPriority: ticket.requestedPriority,
    description: ticket.description,
    currentStatus: ticket.currentStatus,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

/** POST /api/v1/tickets -- create one Ticket owned by the selected Requester (FR-08). */
ticketsRouter.post("/tickets", requireRequester, async (req: Request, res: Response) => {
  const prisma = getPrisma();
  // requireRequester guarantees this is set before the handler runs.
  const requester = req.requester!;
  const body = (req.body ?? {}) as Record<string, unknown>;

  // Shape checks first. Every failing field is collected rather than returned
  // one at a time, so the Requester can correct everything in one pass (BR-26).
  const details: ErrorDetails = {};
  const categoryError = validateReferenceId(body.categoryId, "Category");
  const systemError = validateReferenceId(body.relatedSystemId, "Related System");
  const summaryError = validateSummary(body.summary);
  const priorityError = validateRequestedPriority(body.requestedPriority);
  const descriptionError = validateDescription(body.description);

  if (categoryError) details.categoryId = categoryError;
  if (systemError) details.relatedSystemId = systemError;
  if (summaryError) details.summary = summaryError;
  if (priorityError) details.requestedPriority = priorityError;
  if (descriptionError) details.description = descriptionError;

  // Reference lookups run only for ids that are structurally sound, so a
  // missing id reports "required" rather than "does not exist". An unknown id
  // and an inactive one are reported identically: both mean the Requester
  // cannot choose that option (BR-22).
  if (!categoryError) {
    const category = await prisma.category.findUnique({
      where: { id: body.categoryId as number },
    });
    if (category === null || !category.isActive) {
      details.categoryId = "Select an available Category.";
    }
  }
  if (!systemError) {
    const system = await prisma.relatedSystem.findUnique({
      where: { id: body.relatedSystemId as number },
    });
    if (system === null || !system.isActive) {
      details.relatedSystemId = "Select an available Related System.";
    }
  }

  if (Object.keys(details).length > 0) {
    res.status(422).json(buildError("VALIDATION_ERROR", "One or more fields are invalid.", details));
    return;
  }

  // requesterId is never read from the body. Ownership comes from the header
  // alone (BR-08); a client-supplied value is ignored rather than rejected,
  // because unknown body properties are ignored per api-spec.md 1.5.
  try {
    const created = await prisma.$transaction(async (tx) => {
      // The sequence row is read, advanced, and written inside the same
      // transaction as the insert, so concurrent creation cannot produce a gap
      // or a duplicate (BR-05).
      const now = new Date();
      const current = await tx.ticketNumberSequence.findUnique({
        where: { year: now.getUTCFullYear() },
      });
      const next = nextSequence(current, now);
      await tx.ticketNumberSequence.upsert({
        where: { year: next.year },
        update: { lastValue: next.lastValue },
        create: { year: next.year, lastValue: next.lastValue },
      });

      return tx.ticket.create({
        data: {
          ticketNumber: formatTicketNumber(next.year, next.lastValue),
          requesterId: requester.id,
          categoryId: body.categoryId as number,
          relatedSystemId: body.relatedSystemId as number,
          summary: (body.summary as string).trim(),
          description: (body.description as string).trim(),
          requestedPriority: body.requestedPriority as RequestedPriorityValue,
          // currentStatus is left to the schema default of NEW (BR-02). Lab 2
          // never writes any other status (DEC-06).
        },
        select: {
          id: true,
          ticketNumber: true,
          summary: true,
          description: true,
          requestedPriority: true,
          currentStatus: true,
          createdAt: true,
          updatedAt: true,
          requester: { select: { id: true, fullName: true } },
          category: { select: { id: true, name: true } },
          relatedSystem: { select: { id: true, name: true } },
        },
      });
    });

    res.status(201).json({ data: toTicketResponse(created as TicketWithRelations) });
  } catch {
    res.status(500).json(buildError("INTERNAL_ERROR", "The ticket could not be created. Try again."));
  }
});
