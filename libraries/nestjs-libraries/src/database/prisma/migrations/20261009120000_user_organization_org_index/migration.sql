-- An index on UserOrganization.organizationId: the members of an organization
-- are looked up by it, and the unique (userId, organizationId) index cannot
-- serve a lookup that starts with organizationId.
-- Generated with `prisma migrate diff`; guarded like the other recent
-- migrations, so a database that already has it from `db push` finds a no-op.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserOrganization_organizationId_idx" ON "UserOrganization"("organizationId");
