-- Inline comments on the public preview page (upstream 6fae13c7).
--
-- A comment can now be written by someone without an account, under the name
-- they type (`displayName`, with `userId` null), answer another comment
-- (`parentId`, one level deep), point at a span of the post's text
-- (`anchorStart` / `anchorEnd` / `anchorQuote`) and be resolved by the team
-- that owns the post (`resolvedAt`).
--
-- Additive apart from `userId` becoming optional. That turns its foreign key
-- from ON DELETE RESTRICT into SET NULL, which is what Prisma writes for an
-- optional relation; a user row is tombstoned rather than deleted by the
-- account purge, so no comment loses its author through it. No backfill: every
-- existing comment reads as a signed-in, unanchored, unresolved root comment.
-- Generated with `prisma migrate diff`; guarded like the other recent
-- migrations, so a database that already has these finds a no-op.

-- DropForeignKey
ALTER TABLE "Comments" DROP CONSTRAINT IF EXISTS "Comments_userId_fkey";
ALTER TABLE "Comments" DROP CONSTRAINT IF EXISTS "Comments_parentId_fkey";

-- AlterTable
ALTER TABLE "Comments" ADD COLUMN IF NOT EXISTS "anchorEnd" INTEGER,
ADD COLUMN IF NOT EXISTS "anchorQuote" TEXT,
ADD COLUMN IF NOT EXISTS "anchorStart" INTEGER,
ADD COLUMN IF NOT EXISTS "displayName" TEXT,
ADD COLUMN IF NOT EXISTS "parentId" TEXT,
ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3),
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Comments_parentId_idx" ON "Comments"("parentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Comments_resolvedAt_idx" ON "Comments"("resolvedAt");

-- AddForeignKey
ALTER TABLE "Comments" ADD CONSTRAINT "Comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comments" ADD CONSTRAINT "Comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
