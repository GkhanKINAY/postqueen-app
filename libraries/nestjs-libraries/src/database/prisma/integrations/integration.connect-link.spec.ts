import 'reflect-metadata';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { tmpdir } from 'node:os';
import { afterEach, before, beforeEach, describe, it } from 'node:test';
import { HttpException } from '@nestjs/common';

// As in integration.analytics.spec.ts: tsx follows tsconfig's mapping of
// `file-type` and `mime` to their declarations, so the code the service and
// the providers import is pointed at the packages' own entries. On a Node
// without registerHooks the spec is skipped rather than failed.
const entries: Record<string, string> = {
  'file-type': '../../../../../../node_modules/file-type/source/index.js',
  mime: '../../../../../../node_modules/mime/dist/src/index.js',
};
const canLoadService = typeof nodeModule.registerHooks === 'function';
if (canLoadService) {
  nodeModule.registerHooks({
    resolve: (specifier, context, next) =>
      entries[specifier]
        ? {
            url: new URL(entries[specifier], import.meta.url).href,
            shortCircuit: true,
          }
        : next(specifier, context),
  });
}

let IntegrationService: any;
let IntegrationManager: any;
let ioRedis: any;
before(async () => {
  if (canLoadService) {
    ({ IntegrationService } = await import('./integration.service.ts'));
    ({ IntegrationManager } = await import(
      '../../../integrations/integration.manager.ts'
    ));
  }
  ({ ioRedis } = (await import('../../../redis/redis.service.ts')) as any);
});

const service = () =>
  new IntegrationService(
    {},
    {},
    new IntegrationManager(),
    {},
    {},
    {},
    {},
    {}
  );

// Every write, with its expiry: the test Redis keeps no TTL of its own
let writes: { key: string; value: string; ttl?: number }[];
let originalSet: any;

const KEYS = [
  'STORAGE_PROVIDER',
  'UPLOAD_DIRECTORY',
  'FRONTEND_URL',
  'HIDDEN_PROVIDERS',
  'STRIPE_PUBLISHABLE_KEY',
  'STRIPE_SECRET_KEY',
];
const previous = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

beforeEach(() => {
  // The service builds its storage when constructed: keep it the local one.
  process.env.STORAGE_PROVIDER = 'local';
  process.env.UPLOAD_DIRECTORY = tmpdir();
  process.env.FRONTEND_URL = 'https://app.example.com';
  delete process.env.HIDDEN_PROVIDERS;
  delete process.env.STRIPE_PUBLISHABLE_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  writes = [];
  originalSet = ioRedis.set;
  ioRedis.set = async (key: string, value: string, ex?: string, ttl?: number) => {
    writes.push({ key, value, ttl: ex === 'EX' ? ttl : undefined });
    return originalSet.call(ioRedis, key, value);
  };
});

afterEach(() => {
  ioRedis.set = originalSet;
  for (const key of KEYS) {
    if (previous[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous[key];
    }
  }
});

const org = { id: 'org-1', isTrailing: false, createdAt: new Date() };

const refused = (status: number, message?: RegExp) => (err: unknown) =>
  err instanceof HttpException &&
  err.getStatus() === status &&
  (!message || message.test(err.message));

const tokenOf = (url: string) => url.split('/').pop()!;

describe(
  'connect links',
  { skip: !canLoadService && 'needs Node 22.15+ for registerHooks' },
  () => {
    it('makes an hour-long link under a 256-bit token, for the caller organization only', async () => {
      const { url } = await service().createConnectLink(
        org,
        'linkedin',
        'https://client.example.com/done?from=agent'
      );

      assert.match(
        url,
        /^https:\/\/app\.example\.com\/integrations\/connect\/[a-f0-9]{64}$/
      );
      assert.deepEqual(writes.map((w) => [w.key, w.ttl]), [
        [`connectLink:${tokenOf(url)}`, 3600],
      ]);
      assert.deepEqual(JSON.parse(writes[0].value), {
        org: 'org-1',
        integration: 'linkedin',
        redirectUrl: 'https://client.example.com/done?from=agent',
        redirectTo: 'client.example.com',
      });
      assert.notEqual(
        tokenOf(url),
        tokenOf((await service().createConnectLink(org, 'linkedin')).url)
      );
    });

    it('refuses a retired, unknown or hidden platform', async () => {
      process.env.HIDDEN_PROVIDERS = 'pinterest';
      for (const platform of ['reddit', 'medium', 'nope', 'pinterest']) {
        await assert.rejects(
          service().createConnectLink(org, platform),
          refused(400, /not allowed/)
        );
      }
      assert.deepEqual(writes, []);
    });

    it('refuses a platform that needs more than a redirect to connect', async () => {
      // Bluesky and Lemmy ask for a login first, Nostr is a key
      for (const platform of ['bluesky', 'lemmy', 'nostr']) {
        await assert.rejects(
          service().createConnectLink(org, platform),
          refused(400, /cannot be connected with a link/)
        );
      }
      assert.deepEqual(writes, []);
    });

    it('refuses a trial-locked platform to a trialing workspace, as Add Channel does', async () => {
      process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test';
      process.env.STRIPE_SECRET_KEY = 'sk_test';
      await assert.rejects(
        service().createConnectLink({ ...org, isTrailing: true }, 'x'),
        refused(406, /free trial/)
      );
      assert.deepEqual(writes, []);

      // the same workspace may link the others, and X once it pays
      await service().createConnectLink({ ...org, isTrailing: true }, 'linkedin');
      await service().createConnectLink(org, 'x');
    });

    it('refuses a redirect that is not an absolute http(s) URL', async () => {
      for (const redirect of [
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        '/channels',
        'client.example.com/done',
        'ftp://client.example.com/',
        'https://client.example.com/done#done',
        'https://user:secret@client.example.com/',
        `https://client.example.com/${'a'.repeat(2048)}`,
      ]) {
        await assert.rejects(
          service().createConnectLink(org, 'linkedin', redirect),
          refused(400, /redirect URL/),
          redirect
        );
      }
      assert.deepEqual(writes, []);
    });

    it('shows the platform and the host to return to, and nothing of the organization', async () => {
      const { url } = await service().createConnectLink(
        org,
        'linkedin',
        'https://client.example.com/done'
      );
      assert.deepEqual(await service().getConnectLink(tokenOf(url)), {
        identifier: 'linkedin',
        name: 'LinkedIn',
        redirectTo: 'client.example.com',
      });
      assert.equal(
        await service().getConnectLinkOrganization(tokenOf(url)),
        'org-1'
      );
    });

    it('reads an unknown, malformed or no longer linkable token as expired', async () => {
      const { url } = await service().createConnectLink(org, 'linkedin');
      process.env.HIDDEN_PROVIDERS = 'linkedin';
      for (const token of [tokenOf(url), 'a'.repeat(64), 'connectLink:*', '']) {
        await assert.rejects(
          service().getConnectLink(token),
          refused(404, /expired/)
        );
      }
    });

    it("starts the platform's sign-in for the link's organization, and only offers the redirect", async () => {
      const { url } = await service().createConnectLink(
        org,
        'linkedin',
        'https://client.example.com/done'
      );
      writes = [];

      const started = await service().startConnectLink(tokenOf(url));
      assert.match(started.url, /linkedin\.com/);

      const state = writes
        .find((w) => w.key.startsWith('organization:'))!
        .key.slice('organization:'.length);
      assert.deepEqual(
        writes.map((w) => [w.key, w.value, w.ttl]),
        [
          [`organization:${state}`, 'org-1', 3600],
          [`login:${state}`, writes[1].value, 3600],
          [`continue:${state}`, 'https://client.example.com/done', 3600],
        ]
      );
      // `redirect:` is the one the connect callback follows on its own
      assert.equal(await ioRedis.get(`redirect:${state}`), undefined);
    });
  }
);
