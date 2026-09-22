import { HttpStatus, Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { Organization } from '@gitroom/nestjs-libraries/database/prisma/generated/client';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { OAuthService } from '@gitroom/nestjs-libraries/database/prisma/oauth/oauth.service';
import { HttpForbiddenException } from '@gitroom/nestjs-libraries/services/exception.filter';
import { isBillingEnabled } from '@gitroom/helpers/utils/billing.enabled';
import { setSentryUserContext } from '@gitroom/nestjs-libraries/sentry/initialize.sentry';

@Injectable()
export class PublicAuthMiddleware implements NestMiddleware {
  constructor(
    private _organizationService: OrganizationService,
    private _oauthService: OAuthService
  ) {}

  private setOrg(req: Request, org: Organization, isOAuthApp: boolean) {
    // @ts-ignore
    req.org = { ...org, users: [{ role: 'SUPERADMIN' }] };
    // Read by SuperAdminGuard: an OAuth app never counts as a superadmin
    // caller, and the organization it authenticated as is the one the guard
    // authorizes (nothing else may replace it later in the request)
    // @ts-ignore
    req.isOAuthApp = isOAuthApp;
    // @ts-ignore
    req.authOrgId = org.id;
  }

  async use(req: Request, res: Response, next: NextFunction) {
    const auth = (req.headers.authorization ||
      req.headers.Authorization) as string;
    if (!auth) {
      res.status(HttpStatus.UNAUTHORIZED).json({ msg: 'No API Key found' });
      return;
    }
    try {
      let org: Organization & { subscription?: unknown };
      const isOAuthApp = auth.startsWith('pos_');

      if (isOAuthApp) {
        const authorization = await this._oauthService.getOrgByOAuthToken(auth);
        if (!authorization) {
          res
            .status(HttpStatus.UNAUTHORIZED)
            .json({ msg: 'Invalid OAuth token' });
          return;
        }

        org = authorization.organization;
      } else {
        org = await this._organizationService.getOrgByApiKey(auth);
        if (!org) {
          res
            .status(HttpStatus.UNAUTHORIZED)
            .json({ msg: 'Invalid API key' });
          return;
        }
      }

      if (isBillingEnabled() && !org.subscription) {
        res
          .status(HttpStatus.UNAUTHORIZED)
          .json({ msg: 'No subscription found' });
        return;
      }

      this.setOrg(req, org, isOAuthApp);
    } catch (err) {
      throw new HttpForbiddenException();
    }

    setSentryUserContext({
      // @ts-ignore
      orgId: req.org.id,
      // @ts-ignore
      paymentId: req.org.paymentId,
    });
    next();
  }
}
