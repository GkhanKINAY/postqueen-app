-- Webhook idempotency. Stripe redelivers any event it did not get a 2xx for and
-- may deliver the same one twice regardless, and no handler was idempotent: a
-- redelivered invoice.payment_succeeded fired the purchase conversion a second
-- time, and a redelivered invoice.payment_failed re-sent the dunning notice.
--
-- The event id is the primary key, so the insert itself is the check. The row is
-- written before the handler runs and deleted again if it throws, which keeps
-- Stripe's retry working for genuine failures.
--
-- Additive: no existing table is touched and no backfill is needed.
-- `completedAt` makes the row two-phase: claimed when the handler starts, stamped
-- when it succeeds. A claimed-but-never-completed row is a crashed attempt and is
-- taken over once it goes stale, which is the only way such an event could ever
-- be processed again.
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- The dedupe itself goes through the primary key and does not need this. It is
-- here so the table can be trimmed by age later: nothing prunes it today, and at
-- a few thousand rows a month that is fine for a long while, but a delete of
-- everything older than N days should not have to scan the table when it lands.
CREATE INDEX "StripeEvent_createdAt_idx" ON "StripeEvent"("createdAt");
