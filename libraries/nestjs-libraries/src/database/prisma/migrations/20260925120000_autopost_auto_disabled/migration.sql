-- Marks the Auto Post rules a drop to a plan without autopost switched off, so
-- coming back to a paid plan can restart those and leave alone the rules the
-- user stopped themselves. Same idea as Integration.autoDisabledAt. Nullable
-- with no default: every existing row reads as "user's own choice".
--
-- Guarded so a database that already has the column finds a no-op.
ALTER TABLE "AutoPost" ADD COLUMN IF NOT EXISTS "autoDisabledAt" TIMESTAMP(3);
