-- Account purge, phase 1.
--
-- A deleted workspace or user is soft-deleted at once and its content removed
-- a few days later by the daily account purge. `purgedAt` records that the
-- purge has run and the row is now a tombstone; the purge selects on
-- `deletedAt` set and `purgedAt` null, hence the indexes.
--
-- Additive: two nullable columns and two indexes, no backfill. Every existing
-- row reads as not purged. Generated with `prisma migrate diff`; IF NOT EXISTS
-- like the other recent migrations, so a database that already has them from
-- `db push` finds each statement a no-op.

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "purgedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "purgedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Organization_purgedAt_idx" ON "Organization"("purgedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_purgedAt_idx" ON "User"("purgedAt");
