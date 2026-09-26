import 'reflect-metadata';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { tmpdir } from 'node:os';
import { afterEach, before, beforeEach, describe, it } from 'node:test';
import { insufficientCredits } from '../credits/credits.repository.ts';

// As in create.post.spec.ts: tsx follows tsconfig's mapping of `file-type` to
// its declarations, so the upload code the service imports is pointed at the
// package's own entry. registerHooks arrived in Node 22.15; on an older 22
// the spec is skipped rather than failed.
const canLoadService = typeof nodeModule.registerHooks === 'function';
if (canLoadService) {
  nodeModule.registerHooks({
    resolve: (specifier, context, next) =>
      specifier === 'file-type'
        ? {
            url: new URL(
              '../../../../../../node_modules/file-type/source/index.js',
              import.meta.url
            ).href,
            shortCircuit: true,
          }
        : next(specifier, context),
  });
}

let IntegrationService: any;
before(async () => {
  if (canLoadService) {
    ({ IntegrationService } = await import('./integration.service.ts'));
  }
});

// A network that bills its plugs and one of its methods, priced like X.
const provider = {
  creditCost: (op: any) =>
    op.type === 'plug-check'
      ? 13
      : op.type === 'plug-trigger'
      ? 40
      : op.type === 'function' && op.name === 'mention'
      ? 25
      : undefined,
  autoRepostPost: async () => {
    calls.push('plug ran');
    return fires;
  },
  repostPostUsers: async () => {
    calls.push('reposted');
  },
};

let calls: string[];
let spends: { key: string; amount: number; allowOverdraft?: boolean }[];
let notices: string[];
let balance: number;
let fires: boolean;

const credits = {
  async assertAvailable(_org: string, amount: number) {
    if (amount > balance) {
      throw insufficientCredits(amount, balance);
    }
  },
  async spend(
    _org: string,
    spend: { key: string; amount: number; allowOverdraft?: boolean }
  ) {
    if (spends.some((s) => s.key === spend.key)) {
      return { id: spend.key, charged: false };
    }
    if (spend.amount > balance && !spend.allowOverdraft) {
      throw insufficientCredits(spend.amount, balance);
    }
    balance -= spend.amount;
    spends.push(spend);
    return { id: spend.key, charged: true };
  },
  async refund(_org: string, key: string) {
    spends = spends.filter((s) => s.key !== key);
    return true;
  },
  async withCredits(_org: string, spend: any, work: () => Promise<unknown>) {
    await credits.spend(_org, spend);
    try {
      return await work();
    } catch (err) {
      await credits.refund(_org, spend.key);
      throw err;
    }
  },
};

const plug = {
  id: 'plug-1',
  organizationId: 'org-1',
  plugFunction: 'autoRepostPost',
  data: JSON.stringify([{ name: 'likesAmount', value: '10' }]),
  integration: { id: 'ch-1', name: 'Brand on X', providerIdentifier: 'x' },
};

const service = () =>
  new IntegrationService(
    {
      getPlug: async () => plug,
      getIntegrationById: async (_org: string, id: string) => ({
        id,
        name: id === 'ch-2' ? 'Team account' : 'Brand on X',
        providerIdentifier: 'x',
        deletedAt: null,
      }),
    },
    {},
    {
      getSocialIntegration: () => provider,
      getInternalPlugs: () => ({
        internalPlugs: [
          { identifier: 'x-repost-post-users', methodName: 'repostPostUsers' },
        ],
      }),
      getPlugMethodNames: () => ['autoRepostPost', 'repostPostUsers'],
    },
    {
      inAppNotification: async (_org: string, subject: string) => {
        notices.push(subject);
      },
    },
    {},
    {},
    credits
  );

const run = () =>
  service().processPlugs({
    plugId: 'plug-1',
    postId: 'x-100',
    delay: 0,
    totalRuns: 3,
    currentRun: 1,
  });

const KEYS = [
  'STRIPE_PUBLISHABLE_KEY',
  'STRIPE_SECRET_KEY',
  'STORAGE_PROVIDER',
  'UPLOAD_DIRECTORY',
];
const previous = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

beforeEach(() => {
  process.env.STRIPE_PUBLISHABLE_KEY = 'spec';
  process.env.STRIPE_SECRET_KEY = 'spec';
  // The service builds its storage when constructed: keep it the local one.
  process.env.STORAGE_PROVIDER = 'local';
  process.env.UPLOAD_DIRECTORY = tmpdir();
  calls = [];
  spends = [];
  notices = [];
  balance = 1000;
  fires = false;
});

afterEach(() => {
  for (const key of KEYS) {
    if (previous[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous[key];
    }
  }
});

describe(
  'Plugs pay for what the network bills',
  { skip: !canLoadService },
  () => {
    it('charges the look at the post once a UTC day, and nothing more while it waits', async () => {
      assert.equal(await run(), false);
      assert.equal(await run(), false);
      assert.equal(spends.length, 1);
      assert.match(
        spends[0].key,
        /^plug-check:plug-1:x-100:\d{4}-\d{2}-\d{2}$/
      );
      assert.equal(spends[0].amount, 13);
      assert.deepEqual(calls, ['plug ran', 'plug ran']);
    });

    it('charges what it did when it fires', async () => {
      fires = true;
      assert.equal(await run(), true);
      assert.deepEqual(
        spends.map((s) => [s.key.split(':')[0], s.amount]),
        [
          ['plug-check', 13],
          ['plug', 40],
        ]
      );
    });

    it('ends a plug the balance could not pay to fire, and says so', async () => {
      balance = 52;
      assert.equal(await run(), true);
      assert.deepEqual(calls, []);
      assert.deepEqual(spends, []);
      assert.deepEqual(notices, ['A plug stopped: not enough credits']);
    });

    it('charges each re-poster before it acts, and skips it when the balance is short', async () => {
      const internal = () =>
        service().processInternalPlug({
          post: 'x-100',
          originalIntegration: 'ch-1',
          integration: 'ch-2',
          plugName: 'x-repost-post-users',
          orgId: 'org-1',
          delay: 0,
          information: {},
        });
      await internal();
      assert.deepEqual(calls, ['reposted']);
      assert.deepEqual(
        spends.map((s) => [s.key, s.amount]),
        [['plug:repostPostUsers:ch-2:x-100', 40]]
      );

      calls = [];
      spends = [];
      balance = 10;
      await internal();
      assert.deepEqual(calls, []);
      assert.deepEqual(notices, ['A plug stopped: not enough credits']);
    });
  }
);

describe(
  'Provider methods the app calls by name',
  { skip: !canLoadService },
  () => {
    it('refuses the ones that publish, read analytics or run as plugs', () => {
      for (const name of ['post', 'comment', 'analytics', 'autoRepostPost']) {
        assert.equal(service().isCallableFunction('x', name), false, name);
      }
      for (const name of ['mention', 'subscriptionInfo', 'boards']) {
        assert.equal(service().isCallableFunction('x', name), true, name);
      }
    });

    it('charges a billed one once a UTC day, and answers from that copy', async () => {
      const integration = { id: 'ch-mention', providerIdentifier: 'x' };
      let runs = 0;
      const call = () =>
        service().withFunctionCredits(
          'org-1',
          integration,
          'mention',
          { query: 'post' },
          async () => {
            runs++;
            return [{ id: 'postqueen', label: 'PostQueen', image: '' }];
          }
        );
      assert.deepEqual(await call(), [
        { id: 'postqueen', label: 'PostQueen', image: '' },
      ]);
      assert.deepEqual(await call(), [
        { id: 'postqueen', label: 'PostQueen', image: '' },
      ]);
      assert.equal(runs, 1);
      assert.equal(spends.length, 1);
      assert.equal(spends[0].amount, 25);
    });

    it('answers nothing, without calling the network, when the balance cannot pay', async () => {
      balance = 0;
      let runs = 0;
      assert.equal(
        await service().withFunctionCredits(
          'org-1',
          { id: 'ch-short', providerIdentifier: 'x' },
          'mention',
          { query: 'post' },
          async () => {
            runs++;
            return [];
          }
        ),
        undefined
      );
      assert.equal(runs, 0);
    });

    it('runs a method that costs nothing as it always did', async () => {
      assert.equal(
        await service().withFunctionCredits(
          'org-1',
          { id: 'ch-1', providerIdentifier: 'x' },
          'boards',
          {},
          async () => 'boards'
        ),
        'boards'
      );
      assert.deepEqual(spends, []);
    });
  }
);
