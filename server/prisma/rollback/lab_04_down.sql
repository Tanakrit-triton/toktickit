-- Rollback of the Lab 4 migration lab_04_actions_taken
-- (docs/lab-04/specification.md section 7.4, DEC-08).
--
-- Rehearse on a scratch database only. Before migrating a database that holds
-- real data, take a pg_dump -Fc backup: restoring it is the recovery path, and
-- this script DELETES every Action Taken and every ticket's version and
-- resolvedAt.
--
--   psql "$SCRATCH_DATABASE_URL" -f server/prisma/rollback/lab_04_down.sql
--
-- PostgreSQL cannot remove enum values, so ACTION_CREATED and ACTION_UPDATED
-- stay in "TicketEventType". No Lab 3 code writes them. MIG-05 proves they are
-- the only difference from the Lab 3 schema.
--
-- One transaction: either everything is undone, or nothing is.

BEGIN;

-- ActionTaken goes first: its foreign keys, indexes, and check constraint go
-- with it, and nothing else references it.
DROP TABLE "ActionTaken";

DROP TYPE "ActionStatus";

DROP INDEX "Ticket_requesterId_currentStatus_idx";
DROP INDEX "Ticket_resolvedAt_idx";

ALTER TABLE "Ticket" DROP COLUMN "version",
DROP COLUMN "resolvedAt";

-- Prisma then sees the Lab 4 migration as not applied, so a later
-- `prisma migrate deploy` would apply it again.
DELETE FROM "_prisma_migrations" WHERE "migration_name" LIKE '%\_lab\_04\_actions\_taken';

COMMIT;
