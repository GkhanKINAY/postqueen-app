-- Records when a person agreed to the Terms of Service and Privacy Policy.
--
-- Every screen that can create an account says that continuing means agreeing,
-- and the account is created with this set to that moment. No version column:
-- the date says which Terms were in force. Nullable with no default and no
-- backfill, so every existing account reads as "not recorded" rather than as
-- having agreed on the day this ran; an install that publishes no Terms leaves
-- it null too. Guarded like the other recent migrations, so a database that
-- already has it from `db push` finds a no-op.

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);
