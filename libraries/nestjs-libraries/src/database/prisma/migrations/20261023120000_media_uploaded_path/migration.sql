-- The path an uploaded video had before normalizing moved it. A remux or a
-- transcode stores the result under a new key and removes the original, but
-- the MCP tool, the CLI and the public API may already hold the original's
-- path and name a post's media by it; createPost matches it by this column.
--
-- One nullable column and no backfill: a video moved before it existed has
-- lost its original path for good, and no scheduled post named one of those
-- when this was added. NULL otherwise means "never moved", as for images.
-- Generated with `prisma migrate diff`; guarded like the other recent
-- migrations, so a database that already has it from `db push` finds a no-op.

-- AlterTable
ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "uploadedPath" TEXT;
