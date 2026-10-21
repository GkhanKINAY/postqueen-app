-- Proof of a service notice: one row per notice and user, written when the
-- email provider accepted the email (POST /admin/notices).
--
-- Additive: one new table, no change to existing rows. It keeps no email
-- address, only the user id, so account deletion's scrubbed user row leaves
-- nothing that names the person; the account purge deletes the rows with the
-- rest of the user's. Guarded like the other recent migrations, so a database
-- that already has these from `db push` finds a no-op.

-- CreateTable
CREATE TABLE IF NOT EXISTS "NoticeDelivery" (
    "id" TEXT NOT NULL,
    "noticeKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoticeDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "NoticeDelivery_userId_idx" ON "NoticeDelivery"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "NoticeDelivery_noticeKey_userId_key" ON "NoticeDelivery"("noticeKey", "userId");

-- AddForeignKey
ALTER TABLE "NoticeDelivery" DROP CONSTRAINT IF EXISTS "NoticeDelivery_userId_fkey";
ALTER TABLE "NoticeDelivery" ADD CONSTRAINT "NoticeDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
