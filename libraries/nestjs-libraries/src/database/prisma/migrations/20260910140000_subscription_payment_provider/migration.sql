-- Upstream sync, September 2026, fifth batch: payment providers.
--
-- Billing now goes through a provider abstraction (Stripe for the web, and
-- RevenueCat for App Store / Google Play purchases from the mobile app). Each
-- subscription records which provider owns it, so a Stripe webhook can never
-- end an app-store subscription or the other way round.
--
-- Additive. Every existing subscription was bought through Stripe, which is
-- exactly what the default says, so no backfill is needed.
--
-- Generated with `prisma migrate diff` from the previous batch's schema to this
-- one's.

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'stripe';
