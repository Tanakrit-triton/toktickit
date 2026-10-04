import express, { Request, Response } from "express";
import { getPrisma } from "./prisma.js";
import { referenceDataRouter } from "./lab-02/reference-data.routes.js";
import { ticketsRouter } from "./lab-02/tickets.routes.js";
import { attachmentsRouter } from "./lab-02/attachments.routes.js";
import { buildError } from "./lab-02/errors.js";
import { adminUsersRouter } from "./lab-03/admin-users.routes.js";
import { authRouter } from "./lab-03/auth.routes.js";
import { requireRole } from "./lab-03/require-role.js";
import { requireSession } from "./lab-03/require-session.js";
import { staffQueueRouter } from "./lab-03/staff-queue.routes.js";
import { staffTicketOpsRouter } from "./lab-03/staff-ticket-ops.routes.js";

// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port. Do not merge these files.
export const app = express();

// No cors(): the browser reaches the API same-origin through the Vite proxy
// in development, so the API sends no CORS headers (docs/lab-03/api-spec.md
// section 1.3, DEC-04).
app.use(express.json());

// ---------------------------------------------------------------------------
// Issue 2 — API health check
// Make the test in tests/lab-01/health.test.ts pass.
// It must return HTTP 200 with JSON: { status: "ok", service: "TokTickIT API" }
// ---------------------------------------------------------------------------
app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", service: "TokTickIT API" });
});
// ---------------------------------------------------------------------------
// Issue 4 — Category list
// Add:  GET /api/categories
//   -> read categories from PostgreSQL via getPrisma().category.findMany(...)
//   -> return each { id, name } in a predictable (id) order
//   -> on failure, respond 500 with a safe message (no internal details)

app.get("/api/categories", async (_req: Request, res: Response) => {
  try {
    const prisma = getPrisma();
    const categories = await prisma.category.findMany({
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });
    res.status(200).json(categories);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Lab 2 -- versioned API. The unversioned Lab 1 route above is retained
// unchanged alongside it (A-04) and is retired in a later sprint.

app.use("/api/v1", referenceDataRouter);
app.use("/api/v1", ticketsRouter);
app.use("/api/v1", attachmentsRouter);

// Lab 3 -- authentication (docs/lab-03/api-spec.md section 2).
app.use("/api/v1", authRouter);

// Lab 3 -- route-family guards (api-spec.md sections 5 and 7, BR-23, BR-26).
// They cover every path under the prefix, including paths that do not exist,
// so they must stay ahead of the not-found fallback below.
app.use("/api/v1/staff", requireSession, requireRole("IT_STAFF", "ADMINISTRATOR"));
app.use("/api/v1/admin", requireSession, requireRole("ADMINISTRATOR"), adminUsersRouter);

app.use("/api/v1/staff", staffQueueRouter);
app.use("/api/v1/staff", staffTicketOpsRouter); // #40, api-spec.md sections 5.2 to 5.7

// Any other /api/v1 path, including the removed GET /dev-requesters
// (api-spec.md section 3). The message differs from the ownership refusal
// ("The requested resource does not exist."), so the two bodies never match.
app.use("/api/v1", (_req: Request, res: Response) => {
  res.status(404).json(buildError("NOT_FOUND", "The requested endpoint does not exist."));
});

export default app;
