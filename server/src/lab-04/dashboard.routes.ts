import { Router, type Request, type Response } from "express";
import { getPrisma } from "../prisma.js";
import { buildError } from "../lab-02/errors.js";
import { requireRole } from "../lab-03/require-role.js";
import { requireSession } from "../lab-03/require-session.js";
import { requesterDashboard, staffDashboard } from "./dashboard-queries.js";

// The two dashboard endpoints (docs/lab-04/api-spec.md section 5), behind
// their role guards (section 8). Neither takes query parameters (section 9).
//
// requesterDashboardRouter is mounted under /api/v1: Requester only.
// staffDashboardRouter is mounted under /api/v1/staff, behind the route-family
// guard in app.ts: IT Staff and Administrators.

export const requesterDashboardRouter = Router();
export const staffDashboardRouter = Router();

const FAILED = "Could not load the dashboard. Try again.";

requesterDashboardRouter.get(
  "/dashboard/requester",
  requireSession,
  requireRole("REQUESTER"),
  async (req: Request, res: Response) => {
    try {
      res.status(200).json({ data: await requesterDashboard(getPrisma(), req.auth!.user.id) });
    } catch {
      res.status(500).json(buildError("INTERNAL_ERROR", FAILED));
    }
  },
);

staffDashboardRouter.get("/dashboard", async (req: Request, res: Response) => {
  try {
    res.status(200).json({ data: await staffDashboard(getPrisma(), req.auth!.user) });
  } catch {
    res.status(500).json(buildError("INTERNAL_ERROR", FAILED));
  }
});
