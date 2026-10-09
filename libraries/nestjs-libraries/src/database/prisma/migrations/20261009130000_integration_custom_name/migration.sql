-- A name for a channel inside PostQueen only (upstream 5a1e92b4).
--
-- `name` keeps the provider's own name and is what a reconnect or a profile
-- refresh keeps writing; `customName` is what the user typed and wins in the
-- channel lists when set, so a rename survives both. NULL means "use the
-- provider's name", which is every existing row, so there is no backfill.
-- Generated with `prisma migrate diff`; guarded like the other recent
-- migrations, so a database that already has it from `db push` finds a no-op.

-- AlterTable
ALTER TABLE "Integration" ADD COLUMN IF NOT EXISTS "customName" TEXT;
