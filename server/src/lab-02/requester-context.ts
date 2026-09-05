import type { NextFunction, Request, Response } from "express";
import { getPrisma } from "../prisma.js";
import { buildError } from "./errors.js";

// X-Dev-Requester-Id middleware (api-spec.md section 1.1, BR-03, BR-11, DEC-02).
//
// This header is a Lab 2 test fixture, NOT a credential. It is unsigned and
// trivially forgeable. It exists so ownership rules can be built and tested
// before Lab 3 introduces the authenticated session in D-04, at which point
// this middleware is replaced and no route signature changes.

export const DEV_REQUESTER_HEADER = "x-dev-requester-id";

export type SelectedRequester = {
  id: string;
  fullName: string;
};

declare module "express-serve-static-core" {
  interface Request {
    /** Set by requireRequester. Absent on unscoped routes. */
    requester?: SelectedRequester;
  }
}

/**
 * Guards a Scoped route. Resolves the header to an active Requester and
 * attaches it to the request, or refuses:
 *
 *   428  header absent, or naming a Requester that does not exist
 *   403  Requester exists but is no longer active (BR-13)
 *
 * A missing header and an unresolvable one are the same condition: the request
 * carries no usable identity, and the client returns the user to the selection
 * screen in both cases. 404 is reserved for resource existence and ownership
 * (DEC-01) and is never used to report an unresolvable header.
 */
export async function requireRequester(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const headerValue = req.header(DEV_REQUESTER_HEADER)?.trim();

  if (!headerValue) {
    res
      .status(428)
      .json(
        buildError(
          "REQUESTER_NOT_SELECTED",
          "Select a Development Requester before using this feature.",
        ),
      );
    return;
  }

  const requester = await getPrisma().requesterUser.findUnique({
    where: { id: headerValue },
    select: { id: true, fullName: true, isActive: true },
  });

  if (requester === null) {
    res
      .status(428)
      .json(
        buildError(
          "REQUESTER_NOT_SELECTED",
          "Select a Development Requester before using this feature.",
        ),
      );
    return;
  }

  if (!requester.isActive) {
    res
      .status(403)
      .json(
        buildError(
          "REQUESTER_INACTIVE",
          "The selected Development Requester is no longer active. Select another to continue.",
        ),
      );
    return;
  }

  req.requester = { id: requester.id, fullName: requester.fullName };
  next();
}
