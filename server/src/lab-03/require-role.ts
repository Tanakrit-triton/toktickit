import type { NextFunction, Request, Response } from "express";
import { buildError } from "../lab-02/errors.js";
import type { Role } from "./require-session.js";

// requireRole (api-spec.md section 1.1 step 5, BR-23).
//
// Mounted after requireSession. It reads only the session's role, never the
// addressed resource, so a refusal is the same body whether or not the
// resource exists, and on /staff and /admin whether or not the route exists.

const FORBIDDEN = buildError("FORBIDDEN", "You do not have permission to do this.");

export function requireRole(...roles: Role[]) {
  const permitted = new Set<Role>(roles);
  return function requireRoleMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (req.auth === undefined || !permitted.has(req.auth.user.role)) {
      res.status(403).json(FORBIDDEN);
      return;
    }
    next();
  };
}
