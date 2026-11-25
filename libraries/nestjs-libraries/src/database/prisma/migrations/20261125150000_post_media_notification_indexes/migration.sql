-- Indexes for the queries that run most (upstream abe283108, 99c2bad0a,
-- 1da1477b1, 9b3f11b05, 2999fbb81). Seven indexes no query here is served by
-- are dropped, and Media organizationId, which the new Media index starts with.
--
-- Added: the calendar's window and repeating-post queries, the posts-per-period
-- count, the media library count and newest-first page, the notification list,
-- the admin error list, the admin per-source post stats and the provider-id
-- login fallback. Dropped: Post deletedAt, approvedSubmitForOrder,
-- creationMethod, updatedAt; Media name, type, organizationId; Notifications
-- deletedAt. Post releaseURL
-- (getPublishedByReleaseUrl) and releaseId (webhook lookups) stay.
--
-- Every CREATE comes before every DROP: the file runs as one transaction, and a
-- DROP INDEX holds an ACCESS EXCLUSIVE lock on its table until the end, so an
-- early one would block reads of Post and Media while the new indexes build.
-- Plain (not CONCURRENTLY) statements: on the hosted service these tables are
-- small enough that plain CREATE/DROP INDEX in one transaction takes
-- milliseconds. A self-hosted install with very large Post/Media tables can
-- create the indexes CONCURRENTLY under these same names before upgrading;
-- the CREATEs here then find them and do nothing (see the pull request that
-- added this migration).
-- Generated with `prisma migrate diff`, Prisma's own (truncated, 63-character)
-- names kept; guarded like the other recent migrations, so a database that
-- already matches from `db push` finds a no-op.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_providerId_providerName_idx" ON "User"("providerId", "providerName");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Media_organizationId_createdAt_deletedAt_status_idx" ON "Media"("organizationId", "createdAt", "deletedAt", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Post_publishDate_state_deletedAt_parentPostId_integrationId_idx" ON "Post"("publishDate", "state", "deletedAt", "parentPostId", "integrationId", "organizationId", "creationMethod");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Post_organizationId_publishDate_state_deletedAt_idx" ON "Post"("organizationId", "publishDate", "state", "deletedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Post_organizationId_intervalInDays_idx" ON "Post"("organizationId", "intervalInDays");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notifications_organizationId_createdAt_deletedAt_idx" ON "Notifications"("organizationId", "createdAt", "deletedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Errors_createdAt_platform_idx" ON "Errors"("createdAt", "platform");

-- DropIndex
DROP INDEX IF EXISTS "Media_name_idx";

-- DropIndex
DROP INDEX IF EXISTS "Media_organizationId_idx";

-- DropIndex
DROP INDEX IF EXISTS "Media_type_idx";

-- DropIndex
DROP INDEX IF EXISTS "Post_deletedAt_idx";

-- DropIndex
DROP INDEX IF EXISTS "Post_approvedSubmitForOrder_idx";

-- DropIndex
DROP INDEX IF EXISTS "Post_creationMethod_idx";

-- DropIndex
DROP INDEX IF EXISTS "Post_updatedAt_idx";

-- DropIndex
DROP INDEX IF EXISTS "Notifications_deletedAt_idx";
