-- Per-rule choice between parking feed items in Drafts and publishing them.
-- DEFAULT false reproduces the previous behaviour for every existing row, so an
-- upgrade never starts auto-publishing on somebody's behalf.
ALTER TABLE "AutoPost" ADD COLUMN "autoPublish" BOOLEAN NOT NULL DEFAULT false;
