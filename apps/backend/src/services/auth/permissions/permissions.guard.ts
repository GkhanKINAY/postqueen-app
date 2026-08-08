import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AppAbility,
  PermissionsService,
} from '@gitroom/backend/services/auth/permissions/permissions.service';
import {
  AbilityPolicy,
  CHECK_POLICIES_KEY,
} from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { Organization } from '@prisma/client';
import { Request } from 'express';
import { SubscriptionException } from './permission.exception.class';

@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private _reflector: Reflector,
    private _authorizationService: PermissionsService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: Request = context.switchToHttp().getRequest();
    // Prefix match, not `indexOf`: a substring test also matched
    // `/oauth/authorize`, which is authenticated. Nothing was exposed by that
    // (approveOrDeny carries no @CheckPolicies) but the next policy added to a
    // route with `/auth` anywhere in its path would have been skipped silently.
    //
    // The two `/integrations/*` entries are load-bearing, not oversights:
    //   - `/integrations/social-connect` lives on NoAuthIntegrationsController,
    //     which AuthMiddleware never runs for, so `request.org` is undefined and
    //     evaluating a policy here would throw rather than deny.
    //   - `/integrations/provider/:id/connect` finishes a connect whose row
    //     ALREADY exists as `inBetweenSteps`, and the CHANNEL count includes it
    //     (permissions.service.ts:84-94). Enforcing the limit here would 402 the
    //     page-selection step for anyone connecting their last allowed channel.
    // The real quota gap this leaves is at integration-creation time; see
    // the launch plan — it needs enforcement inside the create path, excluding
    // the row being created, not a guard change.
    if (
      request.path === '/auth' ||
      request.path.startsWith('/auth/') ||
      request.path.startsWith('/integrations/social-connect') ||
      request.path.startsWith('/integrations/provider')
    ) {
      return true;
    }

    const policyHandlers =
      this._reflector.get<AbilityPolicy[]>(
        CHECK_POLICIES_KEY,
        context.getHandler()
      ) || [];

    if (!policyHandlers || !policyHandlers.length) {
      return true;
    }

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    const { org }: { org: Organization } = request;

    const refreshChannelId = typeof request.query?.refresh === 'string' ? request.query.refresh : undefined;

    // @ts-ignore
    const ability = await this._authorizationService.check(org.id, org.createdAt, org.users[0].role, policyHandlers, refreshChannelId);

    const item = policyHandlers.find(
      (handler) => !this.execPolicyHandler(handler, ability)
    );

    if (item) {
      throw new SubscriptionException({
        section: item[1],
        action: item[0],
      });
    }

    return true;
  }

  private execPolicyHandler(handler: AbilityPolicy, ability: AppAbility) {
    return ability.can(handler[0], handler[1]);
  }
}
