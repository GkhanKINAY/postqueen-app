import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { User } from '@gitroom/nestjs-libraries/database/prisma/generated/client';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { UsersService } from '@gitroom/nestjs-libraries/database/prisma/users/users.service';
import { getCookieUrlFromDomain } from '@gitroom/helpers/subdomain/subdomain.management';
import { HttpForbiddenException } from '@gitroom/nestjs-libraries/services/exception.filter';
import { MastraService } from '@gitroom/nestjs-libraries/chat/mastra.service';
import { areCookiesSecured } from '@gitroom/helpers/utils/cookies.secured';
import { effectiveIsTrailing } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { setSentryUserContext } from '@gitroom/nestjs-libraries/sentry/initialize.sentry';

export const removeAuth = (res: Response) => {
  res.cookie('auth', '', {
    domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
    ...(areCookiesSecured()
      ? {
          secure: true,
          httpOnly: true,
          sameSite: 'none',
        }
      : {}),
    expires: new Date(0),
    maxAge: -1,
  });
  res.header('logout', 'true');
};

/**
 * `req.org.isTrailing` is the derived flag, not the stored one: every consumer
 * downstream (the X lock, trial-only video, the trial banner,
 * `/billing/is-trial-finished`) reads it, and none of them should have to know
 * about the clock. `effectiveIsTrailing` holds the rule.
 *
 * Both paths below go through it. Impersonation used to pass the raw flag,
 * so support opening an account whose seven days ran out long ago saw a trial
 * still running that the customer did not.
 */
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(
    private _organizationService: OrganizationService,
    private _userService: UsersService
  ) {}
  async use(req: Request, res: Response, next: NextFunction) {
    const auth = req.headers.auth || req.cookies.auth;
    if (!auth) {
      throw new HttpForbiddenException();
    }
    try {
      // Verify the JWT signature only. Never trust authorization-relevant
      // claims (id, isSuperAdmin, activated) from the token body — always
      // re-resolve the user from the database using the id.
      const payload = AuthService.verifyJWT(auth) as
        | (User & { purpose?: string; expires?: string; iat?: number })
        | null;
      const orgHeader = req.cookies.showorg || req.headers.showorg;

      // Only a session authenticates. Reset and activation links are signed
      // with the same key and carry a `purpose` (reset links from before that
      // carry `expires`), and both used to pass here as a session that never
      // expired — found in browser history or a mail scanner's log, pasted
      // into the cookie.
      if (!payload?.id || payload.purpose || payload.expires) {
        throw new HttpForbiddenException();
      }

      let user = (await this._userService.getUserById(payload.id)) as User | null;

      if (!user) {
        throw new HttpForbiddenException();
      }

      if (!user.activated) {
        throw new HttpForbiddenException();
      }

      // Signed before the password last changed. A reset ends every session
      // that existed, including one somebody else was holding. `iat` is in
      // seconds; `sessionsNotBefore` is stored rounded down to one.
      if (
        user.sessionsNotBefore &&
        (payload.iat ?? 0) * 1000 < new Date(user.sessionsNotBefore).getTime()
      ) {
        throw new HttpForbiddenException();
      }

      const impersonate = req.cookies.impersonate || req.headers.impersonate;
      if (user?.isSuperAdmin && impersonate) {
        const loadImpersonate = await this._organizationService.getUserOrg(
          impersonate
        );

        if (loadImpersonate) {
          user = loadImpersonate.user;
          user.isSuperAdmin = true;
          delete user.password;

          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          req.user = user;

          // @ts-ignore
          loadImpersonate.organization.users =
            loadImpersonate.organization.users.filter(
              (f) => f.userId === user.id
            );
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          req.org = {
            ...loadImpersonate.organization,
            isTrailing: effectiveIsTrailing(loadImpersonate.organization),
          };

          setSentryUserContext({
            userId: user.id,
            email: user.email,
            orgId: loadImpersonate.organization.id,
            paymentId: loadImpersonate.organization.paymentId,
          });
          next();
          return;
        }
      }

      delete user.password;
      const organization = (
        await this._organizationService.getOrgsByUserId(user.id)
      ).filter((f) => !f.users[0].disabled);
      const setOrg =
        organization.find((org) => org.id === orgHeader) || organization[0];

      if (!organization) {
        throw new HttpForbiddenException();
      }

      if (!setOrg.apiKey) {
        await this._organizationService.updateApiKey(setOrg.id);
      }

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      req.user = user;

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      req.org = {
        ...setOrg,
        isTrailing: effectiveIsTrailing(setOrg),
      };

      setSentryUserContext({
        userId: user.id,
        email: user.email,
        orgId: setOrg.id,
        paymentId: setOrg.paymentId,
      });
    } catch (err) {
      throw new HttpForbiddenException();
    }
    next();
  }
}
