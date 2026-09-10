-- Upstream sync, September 2026, second batch.
--
-- Sign in with Apple stores its accounts under a new Provider value. Account
-- deletion soft-deletes users and organizations: `deletedAt` on both, indexed
-- because the user and organization lookups now filter on it.
--
-- Additive: an enum value, two nullable columns and two indexes. No backfill is
-- needed; every existing row reads as not deleted.
--
-- Generated with `prisma migrate diff` from main's schema to this batch's.

-- AlterEnum
ALTER TYPE "Provider" ADD VALUE 'APPLE';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Organization_deletedAt_idx" ON "Organization"("deletedAt");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
