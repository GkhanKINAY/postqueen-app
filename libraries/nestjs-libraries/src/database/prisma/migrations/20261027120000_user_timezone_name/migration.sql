-- The timezone a person picked on the Account page, as an IANA name
-- (America/New_York). Only the web app reads it, to show dates in that
-- timezone; nothing on the server (emails, workflows, the missed-post sweep)
-- does.
--
-- One nullable column and no backfill: NULL means "the browser's own
-- timezone", which is what every existing user sees today.
-- Generated with `prisma migrate diff`; guarded like the other recent
-- migrations, so a database that already has it from `db push` finds a no-op.

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "timezoneName" TEXT;
