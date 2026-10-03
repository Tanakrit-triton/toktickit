-- Lab 3: users, roles, sessions, ticket ownership, comments, notes, and events.
--
-- Generated with `prisma migrate dev --create-only`, then hand-edited per
-- docs/lab-03/specification.md section 7.3. The steps below follow that
-- section's numbering. RequesterUser, Ticket, and Attachment are altered in
-- place and never dropped or recreated (CLAUDE.md, AC-61).
--
-- The whole migration runs in one transaction, so a failed pre-check (step 3)
-- leaves the database exactly as it was.

BEGIN;

-- ---------------------------------------------------------------------------
-- Step 1. Rename TicketStatus values in place (DEC-15).
--
-- Prisma generated a drop-and-recreate of the enum for this rename. Renaming
-- in place keeps every row's value and the type's identity. Value order is
-- unchanged, and matches schema.prisma.

ALTER TYPE "TicketStatus" RENAME VALUE 'CLAIMED' TO 'OPEN';
ALTER TYPE "TicketStatus" RENAME VALUE 'PENDING_CONFIRMATION' TO 'WAITING_FOR_REQUESTER';

-- ---------------------------------------------------------------------------
-- Step 2. Roles and credentials on the existing user table (DEC-02).
--
-- Add-only. Existing rows become REQUESTER, with no password, required to
-- change it (BR-14, DEC-03).

CREATE TYPE "Role" AS ENUM ('REQUESTER', 'IT_STAFF', 'ADMINISTRATOR');

ALTER TABLE "RequesterUser" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'REQUESTER';

-- ---------------------------------------------------------------------------
-- Step 3. Normalise existing emails to trimmed lowercase (BR-06).
--
-- Fails the migration, rather than violating the unique index halfway
-- through, if two existing addresses differ only by case or surrounding
-- whitespace. Nothing is merged or renamed automatically.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "RequesterUser"
    GROUP BY lower(btrim("email", E' \t\n\r\f'))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Lab 3 migration stopped: normalising emails in "RequesterUser" would create duplicates. Resolve them, then apply the migration again.';
  END IF;
END $$;

UPDATE "RequesterUser"
SET "email" = lower(btrim("email", E' \t\n\r\f'))
WHERE "email" <> lower(btrim("email", E' \t\n\r\f'));

-- ---------------------------------------------------------------------------
-- Step 4. IT Priority, backfilled from Requested Priority (BR-33).
--
-- Prisma generated ADD COLUMN ... NOT NULL with no value, which fails on any
-- table that has rows. Added nullable, backfilled, then constrained.

ALTER TABLE "Ticket" ADD COLUMN "itPriority" "RequestedPriority";

UPDATE "Ticket" SET "itPriority" = "requestedPriority";

ALTER TABLE "Ticket" ALTER COLUMN "itPriority" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- Step 5. Ticket Owner and the resolution indication. Add-only.

ALTER TABLE "Ticket" ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "requesterIndicatedResolvedAt" TIMESTAMP(3);

-- The owner=me / owner=unassigned queue filters and the BR-63 open-ticket count.
CREATE INDEX "Ticket_ownerId_idx" ON "Ticket"("ownerId");

-- The queue's status filter plus its default age order.
CREATE INDEX "Ticket_currentStatus_createdAt_idx" ON "Ticket"("currentStatus", "createdAt");

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "RequesterUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Step 6. New tables: comments, notes, events, sessions (section 7.1).
--
-- Every foreign key is ON DELETE RESTRICT (section 7.4).

CREATE TYPE "TicketEventType" AS ENUM ('OWNER_CHANGED', 'STATUS_CHANGED', 'IT_PRIORITY_CHANGED', 'RESOLUTION_INDICATED');

CREATE TABLE "PublicComment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InternalNote" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TicketEvent" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "actorId" TEXT,
    "eventType" "TicketEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketEvent_pkey" PRIMARY KEY ("id")
);

-- id is the SHA-256 hex of the session token; the token is never stored (BR-15).
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "csrfToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PublicComment_ticketId_createdAt_idx" ON "PublicComment"("ticketId", "createdAt");

CREATE INDEX "InternalNote_ticketId_createdAt_idx" ON "InternalNote"("ticketId", "createdAt");

CREATE INDEX "TicketEvent_ticketId_createdAt_idx" ON "TicketEvent"("ticketId", "createdAt");

CREATE INDEX "Session_userId_idx" ON "Session"("userId");

ALTER TABLE "PublicComment" ADD CONSTRAINT "PublicComment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PublicComment" ADD CONSTRAINT "PublicComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "RequesterUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "RequesterUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "RequesterUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "RequesterUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Not in section 7.3: kept from Prisma's generated SQL.
--
-- The Lab 2 migration gave Category."updatedAt" a DEFAULT only so it could be
-- added to the existing Lab 1 rows; schema.prisma (@updatedAt) declares none.
-- Prisma generated this to remove that difference. Without it, a second
-- `prisma migrate dev` would not report the schema in sync and MIG-04 would
-- fail. No data changes; the Prisma client already sets the value on write.

ALTER TABLE "Category" ALTER COLUMN "updatedAt" DROP DEFAULT;

COMMIT;
