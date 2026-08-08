-- getPostByForWebhookId matches on releaseId (the id the platform returned) for
-- every webhook delivery. Without an index that is a sequential scan over the
-- organisation's posts on each publish. CONCURRENTLY is not used because Prisma
-- runs migrations inside a transaction; the table is indexed on the same shape
-- as releaseURL right next to it.
CREATE INDEX "Post_releaseId_idx" ON "Post"("releaseId");
