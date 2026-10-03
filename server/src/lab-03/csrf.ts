import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { buildError } from "../lab-02/errors.js";

// CSRF synchronizer token (api-spec.md section 1.2, BR-20, DEC-05).
//
// The token lives on the session row. Every POST, PUT, PATCH, and DELETE must
// echo it in X-CSRF-Token; GET requests never change state and never need it.
// POST /auth/login is exempt because no session exists yet, so it never
// reaches this check.

export const CSRF_HEADER = "x-csrf-token";

export const CSRF_INVALID = buildError("CSRF_INVALID", "This request could not be verified. Reload and try again.");

const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const isStateChanging = (req: Request) => STATE_CHANGING.has(req.method);

/** True when the request's X-CSRF-Token equals `expected`, compared in constant time. */
export function csrfMatches(req: Request, expected: string): boolean {
  const sent = req.headers[CSRF_HEADER];
  if (typeof sent !== "string" || sent === "") {
    return false;
  }
  const a = Buffer.from(sent);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
