import { Router, type Request, type Response } from "express";
import { Prisma } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { buildError, type ErrorDetails } from "../lab-02/errors.js";
import { checkUserChange } from "./admin-guards.js";
import { normaliseEmail, validateEmail } from "./email.js";
import { hashPassword } from "./password-hash.js";
import { validatePasswordLength } from "./password-policy.js";
import type { Role } from "./require-session.js";
import { revokeAllSessions } from "./sessions.js";

// Administrator user management (api-spec.md section 7, BR-60 to BR-66).
//
// Mounted under /api/v1/admin, behind the route-family guard in app.ts, so
// every handler here runs for a signed-in Administrator only (BR-23).
//
// Users leave only through toAdminUser: no response carries a password hash
// (BR-68). Users are never deleted (BR-65); deactivation replaces deletion.

export const adminUsersRouter = Router();

const ROLES: readonly Role[] = ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"];
const FULL_NAME_MIN = 2;
const FULL_NAME_MAX = 100;
const Q_MAX = 100;

/** Statuses in which an owned ticket blocks deactivation or demotion (BR-63). */
const OPEN_STATUSES = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"] as const;

const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const adminUserSelect = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  createdAt: true,
  updatedAt: true,
} as const;

type AdminUserRow = Prisma.UserGetPayload<{ select: typeof adminUserSelect }>;

/** The AdminUser DTO (api-spec.md section 7). */
function toAdminUser(row: AdminUserRow) {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    role: row.role,
    isActive: row.isActive,
    mustChangePassword: row.mustChangePassword,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const FORBIDDEN = buildError("FORBIDDEN", "You do not have permission to do this.");
const USER_NOT_FOUND = buildError("NOT_FOUND", "The requested user does not exist.");
const EMAIL_ALREADY_EXISTS = buildError("EMAIL_ALREADY_EXISTS", "This email is already used by another user.");
const BAD_USER_ID = buildError("BAD_REQUEST", "The user identifier is not valid.");

const validationError = (details: ErrorDetails) =>
  buildError("VALIDATION_ERROR", "One or more fields are invalid.", details);

function validateFullName(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length === 0) return "Full name is required.";
  if (text.length < FULL_NAME_MIN) return `Full name must be at least ${FULL_NAME_MIN} characters.`;
  if (text.length > FULL_NAME_MAX) return `Full name must be ${FULL_NAME_MAX} characters or fewer.`;
  return null;
}

function validateRole(value: unknown): string | null {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value)
    ? null
    : "Choose a role: Requester, IT Staff, or Administrator.";
}

function validateIsActive(value: unknown): string | null {
  return typeof value === "boolean" ? null : "Choose whether the account is active.";
}

/** Per-field validation for the editable fields. Absent fields are skipped. */
function validateUserFields(body: Record<string, unknown>, required: boolean): ErrorDetails {
  const validators: [string, (value: unknown) => string | null][] = [
    ["fullName", validateFullName],
    ["email", validateEmail],
    ["role", validateRole],
    ["isActive", validateIsActive],
  ];
  const details: ErrorDetails = {};
  for (const [field, validate] of validators) {
    if (!required && body[field] === undefined) continue;
    const message = validate(body[field]);
    if (message !== null) details[field] = message;
  }
  return details;
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** GET /api/v1/admin/users (section 7.1, BR-66). Unpaginated, sorted by fullName. */
adminUsersRouter.get("/users", async (req: Request, res: Response) => {
  const raw = req.query as Record<string, unknown>;
  for (const name of Object.keys(raw)) {
    if (name !== "q" && name !== "role") {
      res.status(400).json(buildError("BAD_REQUEST", `Unknown query parameter: ${name}.`));
      return;
    }
    if (typeof raw[name] !== "string") {
      res.status(400).json(buildError("BAD_REQUEST", `Query parameter ${name} must be given exactly once.`));
      return;
    }
  }

  const q = raw.q === undefined ? "" : (raw.q as string).trim();
  if (q.length > Q_MAX) {
    res.status(400).json(buildError("BAD_REQUEST", `Search text must be ${Q_MAX} characters or fewer.`));
    return;
  }
  const role = raw.role as string | undefined;
  if (role !== undefined && !(ROLES as readonly string[]).includes(role)) {
    res.status(400).json(buildError("BAD_REQUEST", `Query parameter role must be one of ${ROLES.join(", ")}.`));
    return;
  }

  try {
    const users = await getPrisma().user.findMany({
      where: {
        // Empty after trimming is treated as absent.
        ...(q === ""
          ? {}
          : {
              OR: [
                { fullName: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            }),
        ...(role === undefined ? {} : { role: role as Role }),
      },
      orderBy: [{ fullName: "asc" }, { id: "asc" }],
      select: adminUserSelect,
    });
    res.status(200).json({ data: users.map(toAdminUser) });
  } catch {
    res.status(500).json(buildError("INTERNAL_ERROR", "Could not load users. Try again."));
  }
});

/** POST /api/v1/admin/users (section 7.2, BR-60 to BR-62). */
adminUsersRouter.post("/users", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  // Every failing field is reported together; the duplicate check runs only
  // when all of them are valid.
  const details = validateUserFields(body, true);
  const passwordError = validatePasswordLength(body.initialPassword);
  if (passwordError !== null) details.initialPassword = passwordError;
  if (Object.keys(details).length > 0) {
    res.status(422).json(validationError(details));
    return;
  }

  try {
    const prisma = getPrisma();
    const email = normaliseEmail(body.email as string);
    if ((await prisma.user.findUnique({ where: { email }, select: { id: true } })) !== null) {
      res.status(409).json(EMAIL_ALREADY_EXISTS);
      return;
    }

    const user = await prisma.user.create({
      data: {
        fullName: (body.fullName as string).trim(),
        email,
        role: body.role as Role,
        isActive: body.isActive as boolean,
        passwordHash: await hashPassword(body.initialPassword as string),
        mustChangePassword: true, // BR-13, BR-62
      },
      select: adminUserSelect,
    });
    res.status(201).json({ data: toAdminUser(user) });
  } catch (error) {
    // A concurrent create with the same email loses at the unique index.
    if (isUniqueViolation(error)) {
      res.status(409).json(EMAIL_ALREADY_EXISTS);
      return;
    }
    res.status(500).json(buildError("INTERNAL_ERROR", "Could not create the user. Try again."));
  }
});

/** A refusal decided inside the PATCH transaction, sent after it rolls back. */
class Refusal extends Error {
  constructor(
    readonly status: number,
    readonly body: ReturnType<typeof buildError>,
  ) {
    super(body.error.code);
  }
}

/** PATCH /api/v1/admin/users/{userId} (section 7.3, BR-61 to BR-64). */
adminUsersRouter.patch("/users/:userId", async (req: Request, res: Response) => {
  const { userId } = req.params;
  if (!UUID_PATTERN.test(userId)) {
    res.status(400).json(BAD_USER_ID);
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  // Only these four are editable. Anything else, a password included, is ignored (BR-62).
  const provided = ["fullName", "email", "role", "isActive"].filter((field) => body[field] !== undefined);
  const details = validateUserFields(body, false);
  const actorId = req.auth!.user.id;

  try {
    const user = await getPrisma().$transaction(async (tx) => {
      // Lock the active Administrator rows (BR-63, DEC-10). A concurrent change
      // to any of them waits here, then sees the committed result, so two
      // Administrators demoting each other cannot both succeed.
      const admins = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "RequesterUser"
        WHERE role = 'ADMINISTRATOR' AND "isActive" = true
        ORDER BY id
        FOR UPDATE`;

      // 1. The actor is still an active Administrator.
      if (!admins.some((admin) => admin.id === actorId)) {
        throw new Refusal(403, FORBIDDEN);
      }

      // 2. Field validation.
      if (provided.length === 0) {
        throw new Refusal(422, buildError("VALIDATION_ERROR", "Change at least one field."));
      }
      if (Object.keys(details).length > 0) {
        throw new Refusal(422, validationError(details));
      }

      // 3. The target exists.
      const target = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, isActive: true },
      });
      if (target === null) {
        throw new Refusal(404, USER_NOT_FOUND);
      }

      // 4. Email is unique, compared after normalisation.
      const email = body.email === undefined ? undefined : normaliseEmail(body.email as string);
      if (email !== undefined) {
        const holder = await tx.user.findUnique({ where: { email }, select: { id: true } });
        if (holder !== null && holder.id !== target.id) {
          throw new Refusal(409, EMAIL_ALREADY_EXISTS);
        }
      }

      // 5–8. Last Administrator, self-protection, open tickets.
      const change = {
        ...(body.role === undefined ? {} : { role: body.role as Role }),
        ...(body.isActive === undefined ? {} : { isActive: body.isActive as boolean }),
      };
      const refusal = checkUserChange({
        actorId,
        target,
        change,
        activeAdministrators: admins.length,
        openTickets: await tx.ticket.count({
          where: { ownerId: target.id, currentStatus: { in: [...OPEN_STATUSES] } },
        }),
      });
      if (refusal !== null) {
        throw new Refusal(409, buildError(refusal.code, refusal.message));
      }

      const updated = await tx.user.update({
        where: { id: target.id },
        data: {
          ...(body.fullName === undefined ? {} : { fullName: (body.fullName as string).trim() }),
          ...(email === undefined ? {} : { email }),
          ...change,
        },
        select: adminUserSelect,
      });

      // Deactivation and any role change end every session of the target
      // (BR-64). A name or email change revokes nothing.
      const deactivated = target.isActive && !updated.isActive;
      if (deactivated || updated.role !== target.role) {
        await revokeAllSessions(target.id, tx);
      }
      return updated;
    });

    res.status(200).json({ data: toAdminUser(user) });
  } catch (error) {
    if (error instanceof Refusal) {
      res.status(error.status).json(error.body);
      return;
    }
    if (isUniqueViolation(error)) {
      res.status(409).json(EMAIL_ALREADY_EXISTS);
      return;
    }
    res.status(500).json(buildError("INTERNAL_ERROR", "Could not save the user. Try again."));
  }
});

/** POST /api/v1/admin/users/{userId}/initial-password (section 7.4, BR-13, BR-64). */
adminUsersRouter.post("/users/:userId/initial-password", async (req: Request, res: Response) => {
  const { userId } = req.params;
  if (!UUID_PATTERN.test(userId)) {
    res.status(400).json(BAD_USER_ID);
    return;
  }

  const { initialPassword } = (req.body ?? {}) as Record<string, unknown>;
  const passwordError = validatePasswordLength(initialPassword);
  if (passwordError !== null) {
    res.status(422).json(validationError({ initialPassword: passwordError }));
    return;
  }

  try {
    const prisma = getPrisma();
    if ((await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })) === null) {
      res.status(404).json(USER_NOT_FOUND);
      return;
    }

    const passwordHash = await hashPassword(initialPassword as string);
    // Permitted on one's own account and on an inactive user (section 7.4).
    // On one's own account the caller's session is revoked too.
    const user = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: true },
        select: adminUserSelect,
      });
      await revokeAllSessions(userId, tx);
      return user;
    });
    res.status(200).json({ data: toAdminUser(user) });
  } catch {
    res.status(500).json(buildError("INTERNAL_ERROR", "Could not set the initial password. Try again."));
  }
});
