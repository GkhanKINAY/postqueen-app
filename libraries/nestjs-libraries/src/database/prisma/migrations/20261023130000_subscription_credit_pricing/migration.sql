-- Which credit price list a subscription follows ('legacy' or 'v2', see
-- CREDIT_PRICINGS in pricing.ts).
--
-- The default fills every existing row with 'legacy': subscriptions that
-- existed before the v2 prices keep their credits and their per-action
-- prices (owner, 2026-10-23). The app writes 'v2' itself when it creates a
-- row, so a container of the previous version, during the rollout, still
-- writes 'legacy'.
-- Guarded like the other recent migrations, so a database that already has
-- the column from `db push` finds a no-op.

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "creditPricing" TEXT NOT NULL DEFAULT 'legacy';
