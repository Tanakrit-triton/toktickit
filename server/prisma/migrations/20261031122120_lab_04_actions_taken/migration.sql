-- Lab 4: Actions Taken, ticket version, and resolvedAt.
--
-- Generated with `prisma migrate dev --create-only`, then hand-edited per
-- docs/lab-04/specification.md section 7.4. The steps below follow that
-- section's numbering. Add-only: no table, column, or type is dropped or
-- recreated (CLAUDE.md, AC-32).
--
-- The whole migration runs in one transaction, so a failure at any step leaves
-- the database exactly as it was. Adding enum values (step 2) is allowed inside
-- a transaction on PostgreSQL 12 and later, provided the new values are not
-- used before COMMIT; nothing below uses them.
--
-- Rollback: prisma/rollback/lab_04_down.sql (section 7.4, DEC-08).

BEGIN;

-- ---------------------------------------------------------------------------
-- Step 1. The Action Taken status type (BR-13).

CREATE TYPE "ActionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- ---------------------------------------------------------------------------
-- Step 2. Two new Ticket Event types (BR-34).
--
-- Add-only. Existing values and every existing row keep their identity; the
-- type is never dropped and recreated.

ALTER TYPE "TicketEventType" ADD VALUE 'ACTION_CREATED';
ALTER TYPE "TicketEventType" ADD VALUE 'ACTION_UPDATED';

-- ---------------------------------------------------------------------------
-- Step 3. Ticket version and resolvedAt. Add-only.
--
-- Existing rows get version 0 from the default (AC-32). resolvedAt starts null
-- and is backfilled in step 4.

ALTER TABLE "Ticket" ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Step 4. Backfill resolvedAt for RESOLVED and CLOSED tickets.
--
-- The createdAt of the ticket's latest STATUS_CHANGED event into RESOLVED; if
-- it has none, the ticket's updatedAt. Every other status stays null (BR-25).
-- Ticket Events are read, never rewritten. updatedAt is not touched: it is set
-- by the Prisma client, not by the database.

UPDATE "Ticket" AS t
SET "resolvedAt" = COALESCE(
  (
    SELECT max(e."createdAt")
    FROM "TicketEvent" AS e
    WHERE e."ticketId" = t."id"
      AND e."eventType" = 'STATUS_CHANGED'
      AND e."payload"->>'to' = 'RESOLVED'
  ),
  t."updatedAt"
)
WHERE t."currentStatus" IN ('RESOLVED', 'CLOSED');

-- ---------------------------------------------------------------------------
-- Step 5. The ActionTaken table (section 7.1), its check constraint, foreign
-- keys, and indexes (section 7.3).
--
-- The check constraint is hand-written: Prisma cannot declare one. It is the
-- database backstop for BR-09. Every foreign key is ON DELETE RESTRICT, so a
-- ticket and its actions are never cascade-deleted.

CREATE TABLE "ActionTaken" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "performedById" TEXT NOT NULL,
    "actionAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "result" TEXT,
    "status" "ActionStatus" NOT NULL,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpNote" TEXT,
    "attachmentNotes" TEXT,
    "clientRequestId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionTaken_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ActionTaken_followUpNote_check" CHECK ("followUpRequired" = false OR "followUpNote" IS NOT NULL)
);

-- Idempotent create (BR-31).
CREATE UNIQUE INDEX "ActionTaken_clientRequestId_key" ON "ActionTaken"("clientRequestId");

-- The per-ticket list in BR-19 order.
CREATE INDEX "ActionTaken_ticketId_actionAt_createdAt_idx" ON "ActionTaken"("ticketId", "actionAt", "createdAt");

-- "My open actions" on the IT Staff Dashboard.
CREATE INDEX "ActionTaken_performedById_status_idx" ON "ActionTaken"("performedById", "status");

ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "RequesterUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "RequesterUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Step 6. The two new Ticket indexes (section 7.3).

-- Requester Dashboard counts.
CREATE INDEX "Ticket_requesterId_currentStatus_idx" ON "Ticket"("requesterId", "currentStatus");

-- "Resolved recently" (DEC-09).
CREATE INDEX "Ticket_resolvedAt_idx" ON "Ticket"("resolvedAt");

COMMIT;
