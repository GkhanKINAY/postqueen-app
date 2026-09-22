-- These are in schema.prisma and read by application code, but no named
-- migration ever added them: they arrived while installs still applied the
-- schema with `db push`. An install that already has them (production, which
-- ran db push until it moved to PRISMA_MIGRATE) finds every statement below a
-- no-op; a database built from migrations alone gets what the code expects.
--
-- Post.publishClaim is read by every post workflow since v1.0.9 before it
-- publishes, so without it nothing publishes.
ALTER TYPE "SubscriptionTier" ADD VALUE IF NOT EXISTS 'CREATOR';
ALTER TYPE "SubscriptionTier" ADD VALUE IF NOT EXISTS 'GROWTH';
ALTER TYPE "SubscriptionTier" ADD VALUE IF NOT EXISTS 'AGENCY';

ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "subscriptionEndedAt" TIMESTAMP(3);
ALTER TABLE "Integration" ADD COLUMN IF NOT EXISTS "autoDisabledAt" TIMESTAMP(3);
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "publishClaim" TEXT;
