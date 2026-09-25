-- Credits balance, phase 1: the ledger.
--
-- One balance per organization replaces the per-feature monthly quotas.
-- `CreditGrant` rows add to it (a plan period, a trial, a gift, a pack),
-- `Credits` rows of type `credits` spend from it, and `CreditAllocation`
-- records which grant paid for which spend so a refund goes back where it came
-- from. Amounts are hundredths of a credit.
--
-- Additive: four nullable columns on `Credits`, two new tables, no backfill.
-- Existing `Credits` rows keep their meaning as per-feature quota usage and
-- are never read by the balance. The idempotency key is unique per
-- organization; a NULL key (every existing row) never collides. Nothing
-- writes to the new tables until the grant and spend paths are switched on.
-- Generated with `prisma migrate diff`; guarded like the other recent
-- migrations, so a database that already has these from `db push` finds a
-- no-op.

-- AlterTable
ALTER TABLE "Credits" ADD COLUMN IF NOT EXISTS "action" TEXT,
ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
ADD COLUMN IF NOT EXISTS "meta" JSONB,
ADD COLUMN IF NOT EXISTS "status" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "CreditGrant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "externalRef" TEXT,
    "paymentRef" TEXT,
    "tier" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CreditAllocation" (
    "id" TEXT NOT NULL,
    "spendId" TEXT NOT NULL,
    "grantId" TEXT,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CreditGrant_externalRef_key" ON "CreditGrant"("externalRef");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CreditGrant_organizationId_expiresAt_idx" ON "CreditGrant"("organizationId", "expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CreditGrant_paymentRef_idx" ON "CreditGrant"("paymentRef");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CreditAllocation_spendId_idx" ON "CreditAllocation"("spendId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CreditAllocation_grantId_idx" ON "CreditAllocation"("grantId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Credits_organizationId_idempotencyKey_key" ON "Credits"("organizationId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "CreditGrant" DROP CONSTRAINT IF EXISTS "CreditGrant_organizationId_fkey";
ALTER TABLE "CreditGrant" ADD CONSTRAINT "CreditGrant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAllocation" DROP CONSTRAINT IF EXISTS "CreditAllocation_spendId_fkey";
ALTER TABLE "CreditAllocation" ADD CONSTRAINT "CreditAllocation_spendId_fkey" FOREIGN KEY ("spendId") REFERENCES "Credits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAllocation" DROP CONSTRAINT IF EXISTS "CreditAllocation_grantId_fkey";
ALTER TABLE "CreditAllocation" ADD CONSTRAINT "CreditAllocation_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "CreditGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
