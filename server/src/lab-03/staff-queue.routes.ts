import { Router, type Request, type Response } from "express";
import { Prisma } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { buildError } from "../lab-02/errors.js";
import {
  PRIORITY_ORDER,
  STATUS_ORDER,
  parseQueueQuery,
  queueSortKeys,
  type QueueQuery,
  type SortKey,
} from "./queue-query.js";

// GET /api/v1/staff/tickets -- the IT Staff Ticket Queue (api-spec.md 5.1,
// FR-14, AC-28 to AC-32).
//
// Mounted under /api/v1/staff, behind the route-family guard in app.ts, so
// requireSession and requireRole("IT_STAFF", "ADMINISTRATOR") have already run
// (api-spec 1.1 steps 1 to 5). Every ticket is in scope: staff have no
// resource-level restriction (BR-27).
//
// The page is selected in SQL because the status sort follows the lifecycle
// order, which no column or enum order provides. Both ranks come from the
// arrays in queue-query.ts, passed as parameters, so the SQL cannot drift from
// the documented order. The selected ids are then loaded through Prisma.

export const staffQueueRouter = Router();

/** SQL for each sort key. Only these fixed expressions reach ORDER BY. */
const SORT_EXPRESSIONS: Record<SortKey["key"], Prisma.Sql> = {
  ticketNumber: Prisma.sql`t."ticketNumber"`,
  createdAt: Prisma.sql`t."createdAt"`,
  updatedAt: Prisma.sql`t."updatedAt"`,
  itPriority: Prisma.sql`array_position(${[...PRIORITY_ORDER]}::text[], t."itPriority"::text)`,
  status: Prisma.sql`array_position(${[...STATUS_ORDER]}::text[], t."currentStatus"::text)`,
  id: Prisma.sql`t."id"`,
};

function whereClause(query: QueueQuery, ownerId: string | null | undefined): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];

  if (query.q !== undefined) {
    // A case-insensitive substring on the three searchable fields only
    // (AC-29). strpos treats the text literally, so % and _ in a search need
    // no escaping.
    conditions.push(Prisma.sql`(
      strpos(lower(t."ticketNumber"), lower(${query.q})) > 0
      OR strpos(lower(t."summary"), lower(${query.q})) > 0
      OR strpos(lower(r."fullName"), lower(${query.q})) > 0
    )`);
  }
  if (query.status !== undefined) {
    conditions.push(Prisma.sql`t."currentStatus"::text = ${query.status}`);
  }
  if (query.itPriority !== undefined) {
    conditions.push(Prisma.sql`t."itPriority"::text = ${query.itPriority}`);
  }
  if (query.categoryId !== undefined) {
    conditions.push(Prisma.sql`t."categoryId" = ${query.categoryId}`);
  }
  if (ownerId === null) {
    conditions.push(Prisma.sql`t."ownerId" IS NULL`);
  } else if (ownerId !== undefined) {
    conditions.push(Prisma.sql`t."ownerId" = ${ownerId}`);
  }

  return conditions.length === 0 ? Prisma.empty : Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
}

function orderByClause(query: QueueQuery): Prisma.Sql {
  const terms = queueSortKeys(query).map(
    ({ key, order }) => Prisma.sql`${SORT_EXPRESSIONS[key]} ${Prisma.raw(order === "asc" ? "ASC" : "DESC")}`,
  );
  return Prisma.sql`ORDER BY ${Prisma.join(terms, ", ")}`;
}

const badRequest = (res: Response, message: string) =>
  res.status(400).json(buildError("BAD_REQUEST", message));

staffQueueRouter.get("/tickets", async (req: Request, res: Response) => {
  const parsed = parseQueueQuery(req.query as Record<string, unknown>);
  if (!parsed.ok) {
    badRequest(res, parsed.message);
    return;
  }
  const query = parsed.query;
  const prisma = getPrisma();

  try {
    // The checks that need the database. Both are still parameter rules, so
    // a failure is a 400 like any other invalid parameter (api-spec 5.1).
    if (query.categoryId !== undefined) {
      const category = await prisma.category.findUnique({ where: { id: query.categoryId } });
      if (category === null) {
        badRequest(res, "Query parameter categoryId does not match a category.");
        return;
      }
    }

    // undefined: no owner filter. null: unassigned. A string: that owner.
    let ownerId: string | null | undefined;
    if (query.owner?.kind === "me") {
      ownerId = req.auth!.user.id;
    } else if (query.owner?.kind === "unassigned") {
      ownerId = null;
    } else if (query.owner?.kind === "user") {
      // Existing IT Staff or Administrator. An inactive one is accepted: they
      // may still own tickets until reassigned.
      const owner = await prisma.user.findUnique({ where: { id: query.owner.id } });
      if (owner === null || owner.role === "REQUESTER") {
        badRequest(res, "Query parameter owner must name an IT Staff or Administrator user.");
        return;
      }
      ownerId = owner.id;
    }

    const from = Prisma.sql`FROM "Ticket" t JOIN "RequesterUser" r ON r."id" = t."requesterId"`;
    const where = whereClause(query, ownerId);
    const offset = (query.page - 1) * query.pageSize;

    const [counted, page] = await prisma.$transaction([
      prisma.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total ${from} ${where}`,
      prisma.$queryRaw<{ id: string }[]>`
        SELECT t."id" ${from} ${where} ${orderByClause(query)}
        LIMIT ${query.pageSize} OFFSET ${offset}`,
    ]);
    const totalItems = counted[0].total;
    const ids = page.map((row) => row.id);

    const rows = await prisma.ticket.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        ticketNumber: true,
        summary: true,
        requestedPriority: true,
        itPriority: true,
        currentStatus: true,
        requesterIndicatedResolvedAt: true,
        createdAt: true,
        updatedAt: true,
        requester: { select: { id: true, fullName: true } },
        category: { select: { id: true, name: true } },
        owner: { select: { id: true, fullName: true } },
      },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));

    // description is deliberately absent from queue items (api-spec 5.1); it
    // is available from Staff Ticket Detail.
    const data = ids.map((id) => {
      const row = byId.get(id)!;
      return {
        id: row.id,
        ticketNumber: row.ticketNumber,
        summary: row.summary,
        requester: row.requester,
        category: row.category,
        requestedPriority: row.requestedPriority,
        itPriority: row.itPriority,
        currentStatus: row.currentStatus,
        owner: row.owner,
        requesterIndicatedResolvedAt: row.requesterIndicatedResolvedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    });

    res.status(200).json({
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        // Zero pages when nothing matches, as in My Tickets.
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    });
  } catch {
    res.status(500).json(buildError("INTERNAL_ERROR", "Could not load the ticket queue. Try again."));
  }
});
