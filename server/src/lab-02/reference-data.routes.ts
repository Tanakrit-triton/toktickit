import { Router, type Request, type Response } from "express";
import { getPrisma } from "../prisma.js";
import { buildError } from "./errors.js";

// Reference data endpoints (api-spec.md section 2).
//
// None of these is Scoped: the selector must be populated before any Requester
// exists in context (FR-01), and Categories and Related Systems are public
// classification data. Each returns { data: [...] } and exposes only the
// fields the contract lists -- isActive is an internal flag and never leaves
// the server.

export const referenceDataRouter = Router();

/** GET /api/v1/categories -- active Categories, sorted by name (FR-06, AC-11). */
referenceDataRouter.get("/categories", async (_req: Request, res: Response) => {
  try {
    const data = await getPrisma().category.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    res.status(200).json({ data });
  } catch {
    res
      .status(500)
      .json(buildError("INTERNAL_ERROR", "Could not load categories. Try again."));
  }
});

/** GET /api/v1/related-systems -- active Related Systems, sorted by name (FR-07). */
referenceDataRouter.get("/related-systems", async (_req: Request, res: Response) => {
  try {
    const data = await getPrisma().relatedSystem.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    res.status(200).json({ data });
  } catch {
    res
      .status(500)
      .json(buildError("INTERNAL_ERROR", "Could not load related systems. Try again."));
  }
});

/**
 * GET /api/v1/dev-requesters -- active Development Requesters, sorted by
 * fullName (FR-01, BR-10).
 *
 * Only active Requesters are returned; the seeded inactive Requester must
 * never appear here, which is the fixture AC-01 rests on.
 */
referenceDataRouter.get("/dev-requesters", async (_req: Request, res: Response) => {
  try {
    const data = await getPrisma().requesterUser.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: "asc" },
    });
    res.status(200).json({ data });
  } catch {
    res
      .status(500)
      .json(
        buildError("INTERNAL_ERROR", "Could not load development requesters. Try again."),
      );
  }
});
