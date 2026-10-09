-- The channels of one post share a batch id (upstream a194e3f4), so opening
-- one of them in the editor brings the others, each with its own time.
--
-- NULL is every existing row: those posts open on their own channel, as they
-- always have, so there is no backfill. Generated with `prisma migrate diff`;
-- guarded like the other recent migrations, so a database that already has it
-- from `db push` finds a no-op.

-- AlterTable
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "batchId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Post_batchId_idx" ON "Post"("batchId");
