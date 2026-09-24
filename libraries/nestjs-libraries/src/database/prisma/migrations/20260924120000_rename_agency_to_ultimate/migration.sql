-- The top plan was keyed AGENCY and only labelled "Ultimate", because the
-- enum already held ULTIMATE: a retired tier from before the fork. The old
-- value moves aside to LEGACY_ULTIMATE and AGENCY takes the name. Renaming an
-- enum value relabels every row that holds it, so no UPDATE is needed.
--
-- Guarded on pg_enum so a database that already ran it finds a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'SubscriptionTier' AND e.enumlabel = 'AGENCY'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'SubscriptionTier' AND e.enumlabel = 'ULTIMATE'
    ) THEN
      ALTER TYPE "SubscriptionTier" RENAME VALUE 'ULTIMATE' TO 'LEGACY_ULTIMATE';
    END IF;
    ALTER TYPE "SubscriptionTier" RENAME VALUE 'AGENCY' TO 'ULTIMATE';
  END IF;
END $$;
