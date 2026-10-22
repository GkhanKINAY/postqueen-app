import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { OrganizationRepository } from './organization.repository.ts';
import { OrganizationService } from './organization.service.ts';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const schema = read('../schema.prisma');
const migration = read(
  '../migrations/20261021120000_user_terms_accepted_at/migration.sql'
);
const authService = read(
  '../../../../../../apps/backend/src/services/auth/auth.service.ts'
);

const body = {
  email: 'new@example.com',
  password: '',
  provider: 'GOOGLE',
  providerId: 'google-1',
  company: 'Acme',
  datafast_visitor_id: '',
} as any;

// The repository over the one Prisma call these methods make, which records
// what it was asked to write.
const repositoryCapturing = (writes: any[]) =>
  new OrganizationRepository(
    {
      model: {
        organization: {
          create: async (args: any) => {
            writes.push(args);
            return { id: 'org-1', users: [] };
          },
        },
      },
    } as any,
    {} as any,
    {} as any,
    {} as any
  );

const newUser = (write: any) => write.data.users.create.user.create;

// The env that decides whether this install publishes Terms, as the app's
// `legalUrl` does: LEGAL_URL, or hosted billing falling back to postqueen.ai.
const KEYS = ['LEGAL_URL', 'STRIPE_PUBLISHABLE_KEY', 'STRIPE_SECRET_KEY'];
const previous = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
const install = (env: Record<string, string>) => {
  for (const key of KEYS) {
    delete process.env[key];
  }
  Object.assign(process.env, env);
};
afterEach(() => {
  for (const key of KEYS) {
    if (previous[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous[key];
    }
  }
});

const termsShownFor = async (env: Record<string, string>) => {
  install(env);
  const calls: unknown[][] = [];
  await new OrganizationService(
    {
      createOrgAndUser: async (...args: unknown[]) => {
        calls.push(args);
        return {};
      },
    } as any,
    { hasEmailProvider: () => false } as any
  ).createOrgAndUser(body, '203.0.113.7', 'test');
  assert.equal(calls.length, 1);
  return calls[0][2];
};

describe('terms acceptance on sign-up', () => {
  it('stamps the new user with the moment the account is created', async () => {
    const writes: any[] = [];
    const before = Date.now();
    await repositoryCapturing(writes).createOrgAndUser(
      body,
      false,
      true,
      '203.0.113.7',
      'test'
    );
    const after = Date.now();

    assert.equal(writes.length, 1);
    const { termsAcceptedAt } = newUser(writes[0]);
    assert.ok(termsAcceptedAt instanceof Date);
    assert.ok(termsAcceptedAt.getTime() >= before);
    assert.ok(termsAcceptedAt.getTime() <= after);
  });

  it('records nothing where the sign-up screens showed no Terms', async () => {
    const writes: any[] = [];
    await repositoryCapturing(writes).createOrgAndUser(
      body,
      false,
      false,
      '203.0.113.7',
      'test'
    );

    assert.equal(writes.length, 1);
    assert.equal('termsAcceptedAt' in newUser(writes[0]), false);
  });

  it('shows Terms on the same installs as the app: LEGAL_URL, or hosted billing', async () => {
    assert.equal(await termsShownFor({}), false);
    assert.equal(
      await termsShownFor({ LEGAL_URL: 'https://legal.example.com' }),
      true
    );
    assert.equal(
      await termsShownFor({
        STRIPE_PUBLISHABLE_KEY: 'pk_test_x',
        STRIPE_SECRET_KEY: 'sk_test_x',
      }),
      true
    );
  });

  it('leaves it unset on the reseller bootstrap account, which no person signs up for', async () => {
    const writes: any[] = [];
    await repositoryCapturing(writes).createMaxUser(
      'ext-1',
      'Reseller',
      'saas',
      'owner@example.com'
    );

    assert.equal(writes.length, 1);
    assert.equal('termsAcceptedAt' in newUser(writes[0]), false);
  });

  it('is reached by every account-creating path in the auth service', () => {
    // Email register, one-time code, provider token, OAuth return. A new
    // creation path that bypasses createOrgAndUser would skip the stamp.
    assert.equal(
      (authService.match(/_organizationService\.createOrgAndUser\(/g) || [])
        .length,
      4
    );
  });

  it('adds a nullable column, with no backfill', () => {
    assert.match(
      schema,
      /model User \{[\s\S]*?\n {2}termsAcceptedAt\s+DateTime\?\n[\s\S]*?\n\}/
    );
    assert.match(
      migration,
      /ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP\(3\);/
    );
    assert.doesNotMatch(migration, /UPDATE|DEFAULT|NOT NULL/);
  });
});
