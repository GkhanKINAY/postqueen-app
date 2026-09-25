-- A free trial is recorded as a `trial-card:` or `trial-email:` code, and the
-- check for "already used elsewhere" was a read followed by an insert, so two
-- organizations checking out with the same card at the same moment could both
-- get a trial. Unique on those codes only: other UsedCodes rows (lifetime,
-- retention) may legitimately repeat. Prisma cannot express a partial index,
-- so it lives here and not in schema.prisma.
CREATE UNIQUE INDEX IF NOT EXISTS "UsedCodes_trial_code_key"
  ON "UsedCodes"("code")
  WHERE "code" LIKE 'trial-%';
