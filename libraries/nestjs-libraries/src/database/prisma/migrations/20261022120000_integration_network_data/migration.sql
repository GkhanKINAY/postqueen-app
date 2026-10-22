-- When a channel started waiting for its person (a reconnect, or a setup
-- never finished), and when what its network gave PostQueen was deleted under
-- the network's terms (removedDataRetentionDays, disconnectedDataRetentionDays
-- or a platform's deletion callback).
--
-- Two nullable columns and no backfill: the first hourly run stamps
-- disconnectedAt on every channel already waiting, of a provider with
-- disconnectedDataRetentionDays, and NULL in dataErasedAt means "not
-- erased", which is true of every existing row.
-- Generated with `prisma migrate diff`; guarded like the other recent
-- migrations, so a database that already has them from `db push` finds a
-- no-op.

-- AlterTable
ALTER TABLE "Integration" ADD COLUMN IF NOT EXISTS "disconnectedAt" TIMESTAMP(3);
ALTER TABLE "Integration" ADD COLUMN IF NOT EXISTS "dataErasedAt" TIMESTAMP(3);
