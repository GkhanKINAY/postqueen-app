import { Body, Controller, Param, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';

/**
 * White-label / reseller bootstrap. Unauthenticated by design: the caller is
 * another system, not a browser session.
 *
 * Every route here used to authorize on `AuthService.verifyJWT`, which checks
 * only that the blob is signed with `JWT_SECRET` — and the session cookie is
 * exactly that: the whole User row signed with that same key, with no expiry,
 * audience or purpose claim. `POST /enterprise/create-user` destructures
 * `{id, name, saasName, email}`, three of which a session token carries, and
 * answers with an organization on a **lifetime AGENCY subscription with a
 * million channels plus its API key**. On a billing-enabled install that meant
 * anyone who could register a free account could mint themselves an unlimited
 * paid one by posting their own cookie back at this endpoint.
 *
 * Nothing in this repository calls these routes, and production had never
 * received a request for one. They now require `ENTERPRISE_SECRET`, a key
 * distinct from `JWT_SECRET`, so a session token is not merely rejected but
 * structurally unusable here. Unset — which is every install that does not run
 * a reseller integration — the routes refuse outright.
 */
@ApiTags('Enterprise')
@Controller('/enterprise')
export class EnterpriseController {
  constructor(
    private _integrationManager: IntegrationManager,
    private _organizationService: OrganizationService,
    private _integrationService: IntegrationService,
    private _postsService: PostsService
  ) {}

  private verifyEnterprise<T>(params: string): T | null {
    return AuthService.verifyJWTWithSecret(
      params,
      process.env.ENTERPRISE_SECRET
    ) as T | null;
  }

  @Post('/create-user')
  async createUser(@Body('params') params: string) {
    try {
      const payload = this.verifyEnterprise<{
        id: string;
        name: string;
        email: string;
        saasName: string;
      }>(params);

      if (!payload?.id) {
        return { success: false };
      }

      const { id, name, saasName, email } = payload;

      try {
        return await this._organizationService.createMaxUser(
          id,
          name,
          saasName,
          email
        );
      } catch (err) {
        return { create: false };
      }
    } catch (err) {
      return { success: false };
    }
  }

  @Post('/url')
  async redirectParams(@Body('params') params: string) {
    try {
      const load = this.verifyEnterprise<{
        redirectUrl: string;
        apiKey: string;
        refreshId?: string;
        provider: string;
        webhookUrl: string;
      }>(params);

      if (!load || !load.redirectUrl || !load.apiKey || !load.provider) {
        return;
      }

      const org = await this._organizationService.getOrgByApiKey(load.apiKey);

      if (!org) {
        throw new Error('Organization not found');
      }

      if (
        !this._integrationManager
          .getAllowedSocialsIntegrations()
          .includes(load.provider)
      ) {
        throw new Error('Integration not allowed');
      }

      const integrationProvider = this._integrationManager.getSocialIntegration(
        load.provider
      );

      const { codeVerifier, state, url } =
        await integrationProvider.generateAuthUrl();

      if (load.refreshId) {
        await ioRedis.set(`refresh:${state}`, load.refreshId, 'EX', 3600);
      }

      await ioRedis.set(`webhookUrl:${state}`, load.webhookUrl, 'EX', 3600);
      await ioRedis.set(`redirect:${state}`, load.redirectUrl, 'EX', 3600);
      await ioRedis.set(`organization:${state}`, org.id, 'EX', 3600);
      await ioRedis.set(`login:${state}`, codeVerifier, 'EX', 3600);

      return url;
    } catch (err) {}
  }

  @Post('/delete-channel')
  async deleteChannel(@Body('params') params: string) {
    try {
      const load = this.verifyEnterprise<{
        apiKey: string;
        id: string;
      }>(params);

      if (!load || !load.apiKey || !load.id) {
        return { success: false };
      }

      const org = await this._organizationService.getOrgByApiKey(load.apiKey);

      if (!org) {
        return { success: false };
      }

      const isTherePosts = await this._integrationService.getPostsForChannel(
        org.id,
        load.id
      );
      if (isTherePosts.length) {
        // Awaited: unawaited, deleteChannel below returned first and the posts
        // were deleted afterwards or not at all — and deletePost is what
        // terminates their Temporal workflows, so a straggler could still
        // publish to a channel that is already gone.
        await this._postsService.deletePostsByGroups(
          org.id,
          isTherePosts.map((post) => post.group)
        );
      }

      await this._integrationService.deleteChannel(org.id, load.id);
      return { success: true };
    } catch (err) {
      return { success: false };
    }
  }
}
