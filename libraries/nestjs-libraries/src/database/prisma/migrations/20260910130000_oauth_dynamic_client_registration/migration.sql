-- Upstream sync, September 2026, fourth batch: OAuth Dynamic Client
-- Registration (RFC 7591) and PKCE, so an MCP client such as Claude's connector
-- can register itself and complete the authorization-code flow without a
-- secret handed out by an organization.
--
-- A dynamically registered app belongs to no organization and, as a public
-- client, may have no secret, so `organizationId` and `clientSecret` become
-- nullable. Making the relation optional also changes its foreign key from
-- Prisma's required-relation default (ON DELETE RESTRICT) to the optional one
-- (ON DELETE SET NULL): deleting an organization no longer fails on the OAuth
-- apps it owns; they are left without an owner instead.
--
-- Otherwise additive: new nullable columns, one defaulted boolean and an index.
-- Existing rows keep their organization and secret; no backfill is needed.
--
-- Generated with `prisma migrate diff` from the previous batch's schema to this
-- one's.

-- DropForeignKey
ALTER TABLE "OAuthApp" DROP CONSTRAINT "OAuthApp_organizationId_fkey";

-- AlterTable
ALTER TABLE "OAuthApp" ADD COLUMN     "dynamic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "redirectUris" TEXT,
ADD COLUMN     "tokenEndpointAuthMethod" TEXT,
ALTER COLUMN "organizationId" DROP NOT NULL,
ALTER COLUMN "clientSecret" DROP NOT NULL;

-- AlterTable
ALTER TABLE "OAuthAuthorization" ADD COLUMN     "codeChallenge" TEXT,
ADD COLUMN     "codeChallengeMethod" TEXT,
ADD COLUMN     "redirectUri" TEXT;

-- CreateIndex
CREATE INDEX "OAuthApp_dynamic_idx" ON "OAuthApp"("dynamic");

-- AddForeignKey
ALTER TABLE "OAuthApp" ADD CONSTRAINT "OAuthApp_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
