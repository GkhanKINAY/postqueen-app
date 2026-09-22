import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';

/**
 * Public API routes for platform support. Authorizes the organization the API
 * key belongs to (`authOrgId`, set by PublicAuthMiddleware), never an OAuth
 * app token, and only when OrganizationService.canUseSuperAdminApi says every
 * privileged member of that organization is a platform superuser.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private _organizationService: OrganizationService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { isOAuthApp?: boolean; authOrgId?: string }>();
    const { isOAuthApp, authOrgId } = request;

    if (
      !authOrgId ||
      isOAuthApp ||
      !(await this._organizationService.canUseSuperAdminApi(authOrgId))
    ) {
      throw new HttpException({ msg: 'Unauthorized' }, 403);
    }

    return true;
  }
}
