import { Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { OtpPurpose, Provider, User } from '@prisma/client';
import { CreateOrgUserDto } from '@gitroom/nestjs-libraries/dtos/auth/create.org.user.dto';
import { LoginUserDto } from '@gitroom/nestjs-libraries/dtos/auth/login.user.dto';
import { UsersService } from '@gitroom/nestjs-libraries/database/prisma/users/users.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { AuthService as AuthChecker } from '@gitroom/helpers/auth/auth.service';
import { AuthProviderManager } from '@gitroom/backend/services/auth/providers/providers.manager';
import dayjs from 'dayjs';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { ForgotReturnPasswordDto } from '@gitroom/nestjs-libraries/dtos/auth/forgot-return.password.dto';
import { EmailService } from '@gitroom/nestjs-libraries/services/email.service';
import { NewsletterService } from '@gitroom/nestjs-libraries/newsletter/newsletter.service';
import { OtpService } from '@gitroom/nestjs-libraries/database/prisma/otp/otp.service';
import { AbuseGuardService } from '@gitroom/nestjs-libraries/services/abuse-guard.service';

@Injectable()
export class AuthService {
  constructor(
    private _userService: UsersService,
    private _organizationService: OrganizationService,
    private _notificationService: NotificationService,
    private _emailService: EmailService,
    private _providerManager: AuthProviderManager,
    private _otpService: OtpService,
    private _abuseGuardService: AbuseGuardService
  ) {}

  // Passwordless email-code login (cloud). Kept behind PASSWORDLESS_LOGIN so
  // self-hosters keep the email+password + OAuth flow unchanged.
  private otpCode() {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  async requestOtp(email: string, ip: string, captchaToken?: string) {
    if (!this._emailService.hasProvider()) {
      throw new Error('Email delivery is not configured');
    }

    email = email.toLowerCase();

    const decision = await this._abuseGuardService.challenge({
      action: 'otp_request',
      ip,
      email,
      captchaToken,
    });
    if (!decision.allow) {
      throw new Error(
        decision.reason === 'rate_limited'
          ? 'Too many requests, please try again later'
          : 'Please complete the verification and try again'
      );
    }

    const code = this.otpCode();

    await this._otpService.invalidateActive(email, OtpPurpose.LOGIN);
    await this._otpService.create({
      email,
      codeHash: AuthChecker.hashPassword(code),
      purpose: OtpPurpose.LOGIN,
      expiresAt: dayjs().add(10, 'minutes').toDate(),
      ip,
    });

    await this._notificationService.sendEmail(
      email,
      'Your PostQueen sign-in code',
      `Your sign-in code is <strong style="font-size:20px;letter-spacing:2px">${code}</strong>.<br />It expires in 10 minutes. If you didn't request it, you can ignore this email.`
    );

    // Never reveal whether the email maps to an existing account.
    return { sent: true };
  }

  async verifyOtp(
    email: string,
    code: string,
    ip: string,
    userAgent: string
  ) {
    email = email.toLowerCase();

    // Rate limiting only — the captcha is solved when the code is requested,
    // and its token is single-use so none exists by this point. Guessing the
    // code is separately capped at 5 attempts below.
    const decision = await this._abuseGuardService.challenge({
      action: 'otp_verify',
      ip,
      email,
    });
    if (!decision.allow) {
      throw new Error(
        decision.reason === 'rate_limited'
          ? 'Too many attempts, please try again later'
          : 'Verification blocked, please request a new code'
      );
    }

    const record = await this._otpService.getLatestActive(
      email,
      OtpPurpose.LOGIN
    );

    if (!record || dayjs(record.expiresAt).isBefore(dayjs())) {
      throw new Error('Invalid or expired code');
    }

    if (record.attempts >= 5) {
      await this._otpService.consume(record.id);
      throw new Error('Too many attempts, request a new code');
    }

    if (!AuthChecker.comparePassword(code, record.codeHash)) {
      await this._otpService.incrementAttempts(record.id);
      throw new Error('Invalid or expired code');
    }

    await this._otpService.consume(record.id);

    let user: User | null = await this._userService.getUserByEmail(email);
    let isNew = false;

    if (!user) {
      const prefix = email.split('@')[0] || '';
      const company = prefix.length >= 3 ? prefix.slice(0, 64) : 'Workspace';
      const create = await this._organizationService.createOrgAndUser(
        {
          email,
          password: '',
          provider: Provider.LOCAL,
          company,
          datafast_visitor_id: '',
        },
        ip,
        userAgent
      );

      user = create.users[0].user as User;
      isNew = true;
      this._track('register', email, '').catch(() => {});
      await NewsletterService.register(email);
    }

    // The code proves ownership of the inbox, so the account is verified.
    if (!user.activated) {
      await this._userService.activateUser(user.id);
      user.activated = true;
    }

    return { jwt: await this.jwt(user), isNew };
  }
  async canRegister(provider: string) {
    if (
      process.env.DISABLE_REGISTRATION !== 'true' ||
      provider === Provider.GENERIC
    ) {
      return true;
    }

    return (await this._organizationService.getCount()) === 0;
  }

  async routeAuth(
    provider: Provider,
    body: CreateOrgUserDto | LoginUserDto,
    ip: string,
    userAgent: string,
    addToOrg?: boolean | { orgId: string; role: 'USER' | 'ADMIN'; id: string }
  ) {
    if (provider === Provider.LOCAL) {
      if (process.env.DISALLOW_PLUS && body.email.includes('+')) {
        throw new Error('Email with plus sign is not allowed');
      }
      if (body instanceof CreateOrgUserDto) {
        body.email = body.email.toLowerCase();
      }
      const user = await this._userService.getUserByEmail(body.email);
      if (body instanceof CreateOrgUserDto) {
        if (user) {
          throw new Error('Email already exists');
        }

        if (!(await this.canRegister(provider))) {
          throw new Error('Registration is disabled');
        }

        const create = await this._organizationService.createOrgAndUser(
          body,
          ip,
          userAgent
        );

        const addedOrg =
          addToOrg && typeof addToOrg !== 'boolean'
            ? await this._organizationService.addUserToOrg(
                create.users[0].user.id,
                addToOrg.id,
                addToOrg.orgId,
                addToOrg.role
              )
            : false;

        const obj = { addedOrg, jwt: await this.jwt(create.users[0].user) };
        await this._emailService.sendEmail(
          body.email,
          'Activate your account',
          `Click <a href="${process.env.FRONTEND_URL}/auth/activate/${obj.jwt}">here</a> to activate your account`,
          'top'
        );
        return obj;
      }

      if (!user || !AuthChecker.comparePassword(body.password, user.password)) {
        throw new Error('Invalid user name or password');
      }

      if (!user.activated) {
        throw new Error('User is not activated');
      }

      return { addedOrg: false, jwt: await this.jwt(user) };
    }

    const user = await this.loginOrRegisterProvider(
      provider,
      body as CreateOrgUserDto,
      ip,
      userAgent
    );

    const addedOrg =
      addToOrg && typeof addToOrg !== 'boolean'
        ? await this._organizationService.addUserToOrg(
            user.id,
            addToOrg.id,
            addToOrg.orgId,
            addToOrg.role
          )
        : false;
    return { addedOrg, jwt: await this.jwt(user) };
  }

  public getOrgFromCookie(cookie?: string) {
    if (!cookie) {
      return false;
    }

    try {
      const getOrg: any = AuthChecker.verifyJWT(cookie);
      if (dayjs(getOrg.timeLimit).isBefore(dayjs())) {
        return false;
      }

      return getOrg as {
        email: string;
        role: 'USER' | 'ADMIN';
        orgId: string;
        id: string;
      };
    } catch (err) {
      return false;
    }
  }

  private async loginOrRegisterProvider(
    provider: Provider,
    body: CreateOrgUserDto,
    ip: string,
    userAgent: string
  ) {
    const providerInstance = this._providerManager.getProvider(provider);
    const providerUser = await providerInstance.getUser(body.providerToken);

    if (!providerUser) {
      throw new Error('Invalid provider token');
    }

    const user = await this._userService.getUserByProvider(
      providerUser.id,
      provider
    );
    if (user) {
      return user;
    }

    if (!(await this.canRegister(provider))) {
      throw new Error('Registration is disabled');
    }

    const create = await this._organizationService.createOrgAndUser(
      {
        company: body.company,
        email: providerUser.email,
        password: '',
        provider,
        providerId: providerUser.id,
        datafast_visitor_id: body.datafast_visitor_id,
      },
      ip,
      userAgent
    );

    this._track('register', providerUser.email, body.datafast_visitor_id).catch(
      (err) => {}
    );

    await NewsletterService.register(providerUser.email);

    try {
      if (providerInstance?.postRegistration) {
        await providerInstance.postRegistration(body.providerToken, create.id);
      }
    } catch (err) {
      // Don't fail registration if postRegistration fails
    }

    return create.users[0].user;
  }

  private async _track(
    name: string,
    email: string,
    datafast_visitor_id: string
  ) {
    if (email && datafast_visitor_id && process.env.DATAFAST_API_KEY) {
      try {
        await fetch('https://datafa.st/api/v1/goals', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.DATAFAST_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            datafast_visitor_id: datafast_visitor_id,
            name: name,
            metadata: {
              email,
            },
          }),
        });
      } catch (err) {}
    }
  }

  async forgot(email: string) {
    const user = await this._userService.getUserByEmail(email);
    if (!user || user.providerName !== Provider.LOCAL) {
      return false;
    }

    const resetValues = AuthChecker.signJWT({
      id: user.id,
      expires: dayjs().add(20, 'minutes').format('YYYY-MM-DD HH:mm:ss'),
    });

    await this._notificationService.sendEmail(
      user.email,
      'Reset your password',
      `You have requested to reset your passsord. <br />Click <a href="${process.env.FRONTEND_URL}/auth/forgot/${resetValues}">here</a> to reset your password<br />The link will expire in 20 minutes`
    );
  }

  forgotReturn(body: ForgotReturnPasswordDto) {
    const user = AuthChecker.verifyJWT(body.token) as {
      id: string;
      expires: string;
    };
    if (dayjs(user.expires).isBefore(dayjs())) {
      return false;
    }

    return this._userService.updatePassword(user.id, body.password);
  }

  async activate(code: string, tracking: string) {
    const user = AuthChecker.verifyJWT(code) as {
      id: string;
      activated: boolean;
      email: string;
    };
    if (user.id && !user.activated) {
      const getUserAgain = await this._userService.getUserByEmail(user.email);
      if (getUserAgain.activated) {
        return false;
      }
      await this._userService.activateUser(user.id);
      user.activated = true;
      this._track('register', user.email, tracking).catch((err) => {});
      await NewsletterService.register(user.email);
      return this.jwt(user as any);
    }

    return false;
  }

  async resendActivationEmail(email: string) {
    const user = await this._userService.getUserByEmail(email);

    if (!user) {
      throw new Error('User not found');
    }

    if (user.activated) {
      throw new Error('Account is already activated');
    }

    const jwt = await this.jwt(user);

    await this._emailService.sendEmail(
      user.email,
      'Activate your account',
      `Click <a href="${process.env.FRONTEND_URL}/auth/activate/${jwt}">here</a> to activate your account`,
      'top'
    );

    return true;
  }

  oauthLink(provider: string, query?: any) {
    const providerInstance = this._providerManager.getProvider(provider);
    return providerInstance.generateLink(query);
  }

  async checkExists(provider: string, code: string, redirectUri?: string) {
    const providerInstance = this._providerManager.getProvider(provider);
    const token = await providerInstance.getToken(code, redirectUri);
    const user = await providerInstance.getUser(token);
    if (!user) {
      throw new Error('Invalid user');
    }
    const checkExists = await this._userService.getUserByProvider(
      user.id,
      provider as Provider
    );
    if (checkExists) {
      return { jwt: await this.jwt(checkExists) };
    }

    return { token };
  }

  private async jwt(user: User) {
    if (user.password) {
      delete user.password;
    }
    return AuthChecker.signJWT(user);
  }
}
