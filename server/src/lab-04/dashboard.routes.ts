import { Router, type Request, type Response } from "express";
import { buildError } from "../lab-02/errors.js";
import { requireRole } from "../lab-03/require-role.js";
import { requireSession } from "../lab-03/require-session.js";

// The two dashboard endpoints (docs/lab-04/api-spec.md section 5), registered
// in #70 behind their role guards (section 8) so authorization is proved now.
// They answer 501 until Issue #71 implements the metrics.
//
// requesterDashboardRouter is mounted under /api/v1: Requester only.
// staffDashboardRouter is mounted under /api/v1/staff, behind the route-family
// guard in app.ts: IT Staff and Administrators.

export const requesterDashboardRouter = Router();
export const staffDashboardRouter = Router();

const notImplemented = (_req: Request, res: Response) => {
  res.status(501).json(buildError("NOT_IMPLEMENTED", "The dashboard is not available yet."));
};

requesterDashboardRouter.get("/dashboard/requester", requireSession, requireRole("REQUESTER"), notImplemented);
staffDashboardRouter.get("/dashboard", notImplemented);
