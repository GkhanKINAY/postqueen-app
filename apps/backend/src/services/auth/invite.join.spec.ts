import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

// A team invite opened while logged out travels as the `org` cookie and is
// joined by whichever path signs the person in. These run each path on fakes
// with the invite and check the join, the cookies, and that a join which fails
// never fails the sign-in.

const ENV = ['JWT_SECRET', 'NOT_SECURED', 'FRONTEND_URL', 'DATABASE_URL'];
// Read on the paths that make an account; cleared so a developer's shell
// cannot close registration or reach a real newsletter list.
const CLEARED = [
  'DISABLE_REGISTRATION',
  'RESEND_CONTACTS_API_KEY',
  'BEEHIIVE_API_KEY',
  'LISTMONK_API_KEY',
];
const saved = Object.fromEntries(
  [...ENV, ...CLEARED].map((k) => [k, process.env[k]]),
);

let AuthService: any;
let AuthController: any;
let AuthChecker: any;
let OrganizationRepository: any;
let HttpException: any;
let CreateOrgUserDto: any;

before(async () => {
  process.env.JWT_SECRET ||= 'invite-join-spec-secret';
  process.env.DATABASE_URL ||= 'postgresql://spec:spec@127.0.0.1:1/spec';
  process.env.FRONTEND_URL = 'https://app.example.com';
  ({ AuthService } = await import('./auth.service.ts'));
  ({ AuthController } = await import('../../api/routes/auth.controller.ts'));
  ({ AuthService: AuthChecker } = await import(
    '@gitroom/helpers/auth/auth.service'
  ));
  ({ OrganizationRepository } = await import(
    '@gitroom/nestjs-libraries/database/prisma/organizations/organization.repository'
  ));
  ({ HttpException } = await import('@nestjs/common'));
  ({ CreateOrgUserDto } = await import(
    '@gitroom/nestjs-libraries/dtos/auth/create.org.user.dto'
  ));
});

after(() => {
  for (const k of [...ENV, ...CLEARED]) {
    if (saved[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = saved[k];
    }
  }
});

beforeEach(() => {
  delete process.env.NOT_SECURED;
  for (const k of CLEARED) {
    delete process.env[k];
  }
});

const invite = { orgId: 'org-invited', role: 'USER' as const, id: 'inv01' };

const member = (userId: string) => ({
  id: 'uo-1',
  userId,
  organizationId: invite.orgId,
  role: 'USER',
});

type Join = (userId: string) => Promise<any>;

const existingUser = {
  id: 'user-existing',
  email: 'member@example.com',
  activated: true,
  providerName: 'LOCAL',
};

// The AuthService over fakes of what the sign-in paths reach.
const makeAuthService = (join: Join, joins: unknown[][]) => {
  const password = AuthChecker.hashPassword('correct horse');
  const users = {
    getUserByEmail: async (email: string) =>
      email === existingUser.email
        ? { ...existingUser, password }
        : null,
    getUserByEmailWithPassword: async () => null,
    getUserByEmailAnyProvider: async () => null,
    getUserByProvider: async (providerId: string) =>
      providerId === 'gh-existing' ? { ...existingUser } : null,
    ensureIdentity: async () => undefined,
    activateUser: async () => undefined,
    attachProviderId: async () => undefined,
  };
  const organizations = {
    addUserToOrg: async (userId: string, ...rest: unknown[]) => {
      joins.push([userId, ...rest]);
      return join(userId);
    },
    createOrgAndUser: async (body: any) => ({
      id: 'org-own',
      users: [
        {
          user: {
            id: 'user-new',
            email: body.email,
            activated: true,
            providerName: body.provider,
          },
        },
      ],
    }),
    getCount: async () => 1,
  };
  const providers = {
    getProvider: () => ({
      getToken: async (code: string) => code,
      getUser: async (code: string) =>
        code === 'existing'
          ? { id: 'gh-existing', email: '' }
          : { id: 'google-new', email: 'new.person@example.com' },
    }),
  };
  const otp = {
    getLatestActive: async () => ({
      id: 'otp-1',
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
      codeHash: AuthChecker.hashPassword('123456'),
    }),
    consume: async () => undefined,
    incrementAttempts: async () => undefined,
  };
  return new AuthService(
    users,
    organizations,
    {},
    {
      sendEmail: async () => undefined,
      sendEmailSync: async () => undefined,
      hasProvider: () => true,
    },
    providers,
    otp,
    { challenge: async () => ({ allow: true }) },
  );
};

const joined: Join = async (userId) => member(userId);
const alreadyInOrg: Join = async () => {
  throw new HttpException(
    'A member with this email is already in the workspace',
    409,
  );
};
const databaseDown: Join = async () => {
  throw new Error('Connection terminated');
};

const login = (service: any, addToOrg: unknown) =>
  service.routeAuth(
    'LOCAL',
    { email: existingUser.email, password: 'correct horse', provider: 'LOCAL' },
    '203.0.113.7',
    'spec',
    addToOrg,
  );

// The web flow's state nonce: the same value in the body and the cookie.
const oauth = (service: any, code: string, addToOrg: unknown) =>
  service.checkExists(
    code === 'existing' ? 'GITHUB' : 'GOOGLE',
    code,
    undefined,
    'login-abc',
    'login-abc',
    '203.0.113.7',
    'spec',
    undefined,
    addToOrg,
  );

const register = (service: any, addToOrg: unknown) =>
  service.routeAuth(
    'LOCAL',
    Object.assign(new CreateOrgUserDto(), {
      email: 'New.Person@example.com',
      password: 'correct horse',
      provider: 'LOCAL',
      company: 'Acme',
    }),
    '203.0.113.7',
    'spec',
    addToOrg,
  );

const otpLogin = (service: any, addToOrg: unknown) =>
  service.verifyOtp(
    existingUser.email,
    '123456',
    '203.0.113.7',
    'spec',
    addToOrg,
  );

describe('joining an invite on sign-in', () => {
  it('joins on a password login', async () => {
    const joins: unknown[][] = [];
    const result = await login(makeAuthService(joined, joins), invite);
    assert.deepEqual(joins, [
      [existingUser.id, invite.id, invite.orgId, invite.role],
    ]);
    assert.equal(result.addedOrg.organizationId, invite.orgId);
    assert.ok(result.jwt);
  });

  it('joins an existing OAuth user', async () => {
    const joins: unknown[][] = [];
    const result = await oauth(makeAuthService(joined, joins), 'existing', invite);
    assert.deepEqual(joins.map(([id]) => id), [existingUser.id]);
    assert.equal(result.addedOrg.organizationId, invite.orgId);
    assert.equal(result.isNew, false);
  });

  it('joins an account OAuth creates on the spot', async () => {
    const joins: unknown[][] = [];
    const result = await oauth(makeAuthService(joined, joins), 'new', invite);
    assert.deepEqual(joins.map(([id]) => id), ['user-new']);
    assert.equal(result.addedOrg.organizationId, invite.orgId);
    assert.equal(result.isNew, true);
  });

  it('joins on a one-time code', async () => {
    const joins: unknown[][] = [];
    const result = await otpLogin(makeAuthService(joined, joins), invite);
    assert.deepEqual(joins.map(([id]) => id), [existingUser.id]);
    assert.equal(result.addedOrg.organizationId, invite.orgId);
  });

  it('joins on an email sign-up, as before', async () => {
    const joins: unknown[][] = [];
    const result = await register(makeAuthService(joined, joins), invite);
    assert.deepEqual(joins.map(([id]) => id), ['user-new']);
    assert.equal(result.addedOrg.organizationId, invite.orgId);
  });

  it('joins nothing without an invite', async () => {
    const joins: unknown[][] = [];
    const service = makeAuthService(joined, joins);
    assert.equal((await login(service, false)).addedOrg, false);
    assert.equal((await oauth(service, 'existing', false)).addedOrg, false);
    assert.equal((await otpLogin(service, undefined)).addedOrg, false);
    assert.deepEqual(joins, []);
  });

  for (const [name, join] of [
    ['a member with the same address already there', alreadyInOrg],
    ['a database error', databaseDown],
  ] as const) {
    it(`signs in anyway after ${name}`, async () => {
      const service = makeAuthService(join, []);
      for (const result of [
        await login(service, invite),
        await oauth(service, 'existing', invite),
        await oauth(service, 'new', invite),
        await otpLogin(service, invite),
        await register(service, invite),
      ]) {
        assert.ok(result.jwt);
        assert.equal(result.addedOrg, false);
      }
    });
  }
});

// The invite cookie lives two days, so on a shared browser the next person
// to sign in would carry someone else's invite.
describe('an emailed invite on a shared browser', () => {
  const sentTo = (email: string) => ({ ...invite, email });

  it('joins the account the invite was sent to, whatever the case and spaces', async () => {
    const joins: unknown[][] = [];
    const service = makeAuthService(joined, joins);
    const result = await login(service, sentTo(' Member@Example.com '));
    assert.equal(result.addedOrg.organizationId, invite.orgId);
    assert.deepEqual(joins.map(([id]) => id), [existingUser.id]);
  });

  it('does not join another account, and still signs it in', async () => {
    const joins: unknown[][] = [];
    const service = makeAuthService(joined, joins);
    for (const result of [
      await login(service, sentTo('someone.else@example.com')),
      await oauth(service, 'existing', sentTo('someone.else@example.com')),
      await oauth(service, 'new', sentTo('someone.else@example.com')),
      await otpLogin(service, sentTo('someone.else@example.com')),
      await register(service, sentTo('someone.else@example.com')),
    ]) {
      assert.ok(result.jwt);
      assert.equal(result.addedOrg, false);
    }
    assert.deepEqual(joins, []);
  });

  it('joins whoever signs in with a copied link, which names no one', async () => {
    const joins: unknown[][] = [];
    const service = makeAuthService(joined, joins);
    for (const link of [invite, sentTo(''), sentTo('  ')]) {
      assert.equal(
        (await login(service, link)).addedOrg.organizationId,
        invite.orgId,
      );
    }
    assert.equal(joins.length, 3);
  });
});

describe('accepting an invite to a workspace one is already in', () => {
  it('is a no-op, not a unique-constraint error', async () => {
    const created: unknown[] = [];
    const repository = new OrganizationRepository(
      {
        model: {
          organization: {
            findFirst: async () => ({ subscription: null }),
          },
        },
      },
      {
        model: {
          userOrganization: {
            findFirst: async ({ where }: any) =>
              where.userId === 'user-existing' &&
              where.organizationId === invite.orgId
                ? member('user-existing')
                : null,
            create: async (args: unknown) => {
              created.push(args);
              throw new Error(
                'Unique constraint failed on the fields: (`userId`,`organizationId`)',
              );
            },
          },
        },
      },
      {
        model: {
          user: {
            findFirst: async () => null,
            update: async () => undefined,
          },
        },
      },
      {},
    );

    assert.equal(
      await repository.addUserToOrg(
        'user-existing',
        'inv02',
        invite.orgId,
        'USER',
      ),
      false,
    );
    assert.deepEqual(created, []);
  });
});

// What the controller writes to the response.
const fakeResponse = () => {
  const cookies: Record<string, { value: string; options: any }> = {};
  const headers: Record<string, string> = {};
  const res: any = {
    cookies,
    headers,
    statusCode: 200,
    body: undefined as unknown,
    cookie: (name: string, value: string, options: any) => {
      cookies[name] = { value, options };
      return res;
    },
    header: (name: string, value: string) => {
      headers[name] = value;
      return res;
    },
    status: (code: number) => {
      res.statusCode = code;
      return res;
    },
    json: (body: unknown) => {
      res.body = body;
      return res;
    },
    type: () => res,
    send: (body: unknown) => {
      res.body = body;
      return res;
    },
  };
  return res;
};

const inviteCookie = () =>
  AuthChecker.signJWT({
    ...invite,
    email: 'member@example.com',
    timeLimit: new Date(Date.now() + 86_400_000).toISOString(),
  });

const makeController = (service: any) =>
  new AuthController(service, { hasProvider: () => true }, {
    challenge: async () => ({ allow: true }),
  });

const oauthRequest = (cookies: Record<string, string>) => ({
  headers: { 'content-type': 'application/json' },
  cookies: { oauth_state: 'login-abc', ...cookies },
});

describe('the invite cookies on an OAuth sign-in', () => {
  it('opens the joined workspace and drops the used invite', async () => {
    const res = fakeResponse();
    await makeController(makeAuthService(joined, [])).oauthExists(
      oauthRequest({ org: inviteCookie() }),
      'existing',
      undefined,
      'login-abc',
      'GITHUB',
      '203.0.113.7',
      'spec',
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.cookies.showorg.value, invite.orgId);
    assert.equal(res.cookies.showorg.options.httpOnly, true);
    assert.equal(res.cookies.showorg.options.secure, true);
    assert.equal(res.headers.showorg, undefined);
    assert.equal(res.cookies.org.value, '');
    assert.equal(res.cookies.org.options.expires.getTime(), 0);
    assert.equal(res.cookies.org.options.domain, '.example.com');
  });

  it('keeps the invite while the account still has to be made', async () => {
    const service = makeAuthService(joined, []);
    service.checkExists = async () => ({ token: 'provider-token' });
    const res = fakeResponse();
    await makeController(service).oauthExists(
      oauthRequest({ org: inviteCookie() }),
      'code',
      undefined,
      'login-abc',
      'GITHUB',
      '203.0.113.7',
      'spec',
      res,
    );

    assert.deepEqual(res.body, { token: 'provider-token' });
    assert.equal(res.cookies.org, undefined);
    assert.equal(res.cookies.showorg, undefined);
  });

  it('sends showorg as a header too when cookies are not secured', async () => {
    process.env.NOT_SECURED = 'true';
    const res = fakeResponse();
    await makeController(makeAuthService(joined, [])).oauthExists(
      { ...oauthRequest({ org: inviteCookie() }) },
      'existing',
      // The mobile flow passes a redirect_uri and no state.
      'postqueen://auth/callback',
      undefined,
      'GITHUB',
      '203.0.113.7',
      'spec',
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers.showorg, invite.orgId);
    assert.equal(res.cookies.showorg.options.httpOnly, undefined);
    assert.equal(res.cookies.org.options.domain, undefined);
  });
});

describe('the invite cookies on a password login', () => {
  it('signs in and drops an invite sent to another address', async () => {
    const joins: unknown[][] = [];
    const res = fakeResponse();
    await makeController(makeAuthService(joined, joins)).login(
      {
        cookies: {
          org: AuthChecker.signJWT({
            ...invite,
            email: 'someone.else@example.com',
            timeLimit: new Date(Date.now() + 86_400_000).toISOString(),
          }),
        },
      },
      { email: existingUser.email, password: 'correct horse', provider: 'LOCAL' },
      res,
      '203.0.113.7',
      'spec',
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(joins, []);
    assert.equal(res.cookies.showorg, undefined);
    assert.equal(res.cookies.org.value, '');
  });

  it('signs in and drops the invite when the join is refused', async () => {
    const res = fakeResponse();
    await makeController(makeAuthService(alreadyInOrg, [])).login(
      { cookies: { org: inviteCookie() } },
      { email: existingUser.email, password: 'correct horse', provider: 'LOCAL' },
      res,
      '203.0.113.7',
      'spec',
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { login: true });
    assert.ok(res.cookies.auth.value);
    assert.equal(res.cookies.showorg, undefined);
    assert.equal(res.cookies.org.value, '');
  });
});
