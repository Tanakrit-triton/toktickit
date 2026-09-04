import { Router, type Request, type Response } from "express";
import { getPrisma } from "../prisma.js";
import { buildError, type ErrorDetails } from "./errors.js";
import { requireRequester } from "./requester-context.js";
import { allocateTicketNumber } from "./ticket-number.js";
import { parseTicketListQuery } from "./ticket-query.js";
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
  // alone, and a client-supplied value is ignored outright rather than
  // compared against it (BR-08): consistency-checking would invite clients to
  // send the field, and ownership must have exactly one source.
  try {
    const created = await prisma.$transaction(async (tx) => {
      // Allocated inside this transaction, and incremented atomically in the
      // database rather than computed from a stale read, so concurrent
      // creation cannot produce a duplicate or a gap (BR-05).
      const ticketNumber = await allocateTicketNumber(tx, new Date());

      return tx.ticket.create({
        data: {
          ticketNumber,
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


/**
 * GET /api/v1/tickets -- the selected Requester's Tickets, paginated
 * (FR-16 to FR-20).
 */
ticketsRouter.get("/tickets", requireRequester, async (req: Request, res: Response) => {
  const prisma = getPrisma();
  const requester = req.requester!;

  const parsed = parseTicketListQuery(req.query as Record<string, unknown>);
  if (!parsed.ok) {
    res.status(400).json(buildError("BAD_REQUEST", parsed.message));
    return;
  }
  const { q, categoryId, relatedSystemId, requestedPriority, sortBy, sortOrder, page, pageSize } =
    parsed.query;

  // requesterId is applied here and cannot be overridden by any parameter, so
  // scoping is a property of the query rather than a filter a client could
  // drop (BR-16, BR-17).
  const where = {
    requesterId: requester.id,
    ...(categoryId === undefined ? {} : { categoryId }),
    ...(relatedSystemId === undefined ? {} : { relatedSystemId }),
    ...(requestedPriority === undefined ? {} : { requestedPriority }),
    ...(q === undefined
      ? {}
      : {
          OR: [
            { ticketNumber: { contains: q, mode: "insensitive" as const } },
            { summary: { contains: q, mode: "insensitive" as const } },
          ],
        }),
  };

  try {
    // requestedPriority orders by severity because the Postgres enum sorts by
    // declaration order and RequestedPriority is declared LOW, MEDIUM, HIGH,
    // URGENT (BR-44). Reordering that enum would silently change this sort.
    //
    // id ascending is applied as a secondary key on every sort, so a query
    // whose primary key ties -- priority, most obviously -- still returns a
    // total order and paging cannot skip or repeat a row (BR-43).
    const orderBy = [{ [sortBy]: sortOrder }, { id: "asc" as const }];

    const [totalItems, rows] = await prisma.$transaction([
      prisma.ticket.count({ where }),
      prisma.ticket.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          ticketNumber: true,
          summary: true,
          requestedPriority: true,
          currentStatus: true,
          createdAt: true,
          updatedAt: true,
          category: { select: { id: true, name: true } },
          relatedSystem: { select: { id: true, name: true } },
          // Active attachments only: a removed attachment keeps its metadata
          // but stops counting (BR-32, BR-40). Always zero until #18.
          _count: { select: { attachments: { where: { removedAt: null } } } },
        },
      }),
    ]);

    // description is deliberately absent from list items; it is available from
    // Ticket Detail.
    const data = rows.map((row) => ({
      id: row.id,
      ticketNumber: row.ticketNumber,
      summary: row.summary,
      category: row.category,
      relatedSystem: row.relatedSystem,
      requestedPriority: row.requestedPriority,
      currentStatus: row.currentStatus,
      attachmentCount: row._count.attachments,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));

    res.status(200).json({
      data,
      meta: {
        page,
        pageSize,
        totalItems,
        // Zero pages when nothing matches, rather than one empty page.
        totalPages: Math.ceil(totalItems / pageSize),
      },
    });
  } catch {
    res.status(500).json(buildError("INTERNAL_ERROR", "Could not load your tickets. Try again."));
  }
});
