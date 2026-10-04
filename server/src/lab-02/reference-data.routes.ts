import { Router, type Request, type Response } from "express";
import { getPrisma } from "../prisma.js";
import { buildError } from "./errors.js";
import { requireSession } from "../lab-03/require-session.js";

// Reference data endpoints (api-spec.md section 2).
//
// Since Lab 3 #37 both need a session, for any role, and are behind the
// password-change gate (docs/lab-03/api-spec.md section 3). GET /dev-requesters
// is removed with the selector and falls through to the /api/v1 not-found
// fallback in app.ts. Each returns { data: [...] } and exposes only the
// fields the contract lists -- isActive is an internal flag and never leaves
// the server.

export const referenceDataRouter = Router();

/** GET /api/v1/categories -- active Categories, sorted by name (FR-06, AC-11). */
referenceDataRouter.get("/categories", requireSession, async (_req: Request, res: Response) => {
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
referenceDataRouter.get("/related-systems", requireSession, async (_req: Request, res: Response) => {
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

