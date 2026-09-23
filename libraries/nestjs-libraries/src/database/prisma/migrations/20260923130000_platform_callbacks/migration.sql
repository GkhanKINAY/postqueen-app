-- Platform deletion and deauthorize callbacks.
--
-- `Integration.platformUserId` holds the id a platform uses for the person who
-- authorized a channel, which is what its callbacks name. A Facebook page or an
-- Instagram account has its own internalId, so that id was either buried in
-- rootInternalId or not kept at all. `PlatformDeletionRequest` records each
-- deletion request with the confirmation code the platform hands back to the
-- user, and a sha256 of the user id rather than the id itself.
--
-- Additive: one nullable column, one new table and their indexes, no backfill.
-- Every existing row reads as having no platform user id. Generated with
-- `prisma migrate diff`; IF NOT EXISTS like the other recent migrations.

-- AlterTable
ALTER TABLE "Integration" ADD COLUMN IF NOT EXISTS "platformUserId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PlatformDeletionRequest" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "platformUserHash" TEXT NOT NULL,
    "confirmationCode" TEXT NOT NULL,
    "channels" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PlatformDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PlatformDeletionRequest_confirmationCode_key" ON "PlatformDeletionRequest"("confirmationCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlatformDeletionRequest_platformUserHash_idx" ON "PlatformDeletionRequest"("platformUserHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Integration_platformUserId_idx" ON "Integration"("platformUserId");
