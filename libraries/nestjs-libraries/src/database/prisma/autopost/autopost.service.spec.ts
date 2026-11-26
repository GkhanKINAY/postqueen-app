import 'reflect-metadata';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { tmpdir } from 'node:os';
import { before, beforeEach, describe, it } from 'node:test';
import { insufficientCredits } from '../credits/credits.repository.ts';
import { AI_FIXED_CREDIT_COSTS_PROPOSAL } from '../subscriptions/pricing.ts';

// tsconfig maps file-type and mime to their type declarations for tsc, and
// tsx follows that mapping at run time, so the storage would load a .d.ts.
// Point them at the packages' own entries instead, as
// agent.graph.service.spec.ts and integration.pages.spec.ts do.
// registerHooks arrived in Node 22.15; on an older 22 the spec is skipped
// rather than failed.
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

let AutopostService: any;
let IntegrationService: any;
before(async () => {
  // The service builds its storage when it is made; nothing is stored here.
  process.env.UPLOAD_DIRECTORY ||= tmpdir();
  if (canLoadService) {
    ({ AutopostService } = await import('./autopost.service.ts'));
    ({ IntegrationService } = await import(
      '../integrations/integration.service.ts'
    ));
  }
});

const rule = {
  id: 'rule-1',
  organizationId: 'org-1',
  title: 'Blog',
  url: 'https://example.com/feed',
  lastUrl: null,
  active: true,
  generateContent: true,
  addPicture: true,
  autoPublish: true,
  onSlot: false,
  content: null,
  integrations: '[]',
  updatedAt: new Date('2026-09-01T00:00:00Z'),
};

const channel = {
  id: 'ch-1',
  name: 'X',
  organizationId: 'org-1',
  providerIdentifier: 'x',
  disabled: false,
  refreshNeeded: false,
  inBetweenSteps: false,
};

// A channel whose provider posts only to a picked page. A renewal wrote
// inBetweenSteps: false over it, yet it still holds the login's id.
const renewedUnpicked = {
  id: 'ch-2',
  name: 'Facebook',
  organizationId: 'org-1',
  providerIdentifier: 'facebook',
  internalId: 'login-1',
  rootInternalId: 'login-1',
  disabled: false,
  refreshNeeded: false,
  inBetweenSteps: false,
};

const providers: Record<string, Record<string, unknown>> = {
  x: {},
  facebook: { pageRequiredToPost: true },
};

let balance: number;
let spends: { key: string; amount: number }[];
let posts: string[];
let validated: number;
let notifications: string[];
let refunds: string[];
let failPublish: boolean;
let publishShort: boolean;
let channels: Record<string, unknown>[];
let sentTo: string[][];

// Every collaborator faked. The AI calls themselves never run: the fake
// credits service stands in for the work it would have paid for.
const service = (autopost = rule) =>
  new AutopostService(
    {
      getAutopost: async () => autopost,
      updateUrl: async () => undefined,
    },
    {},
    {
      getIntegrationsList: async () => channels,
      needsPageSelection: IntegrationService.prototype.needsPageSelection,
    },
    {
      validatePosts: async () => {
        validated += 1;
        return [{ id: 'ch-1', valid: true, errors: true }];
      },
      findFreeDateTime: async () => '2026-10-01T10:00:00',
      createPost: async (_org: string, body: any) => {
        if (failPublish) {
          throw new Error('X is down');
        }
        // What an X post sets aside when it is scheduled, refused before
        // anything is saved.
        if (publishShort && body.type !== 'draft') {
          throw insufficientCredits(500, 20);
        }
        posts.push(body.type);
        sentTo.push(body.posts.map((p: any) => p.integration.id));
        return [];
      },
    },
    {
      inAppNotification: async (_org: string, title: string) => {
        notifications.push(title);
      },
    },
    {
      // The list subscriptions sold before v2 keep.
      async creditPricing() {
        return 'legacy';
      },
      async assertAvailable(_org: string, amount: number) {
        if (amount > balance) {
          throw insufficientCredits(amount, balance);
        }
      },
      async withCredits(_org: string, spend: { key: string; amount: number }) {
        if (spend.amount > balance) {
          throw insufficientCredits(spend.amount, balance);
        }
        spends.push({ key: spend.key, amount: spend.amount });
        balance -= spend.amount;
        return spend.key.endsWith(':text')
          ? 'Written by AI'
          : 'https://img/1.png';
      },
      // Hands back the open charge under the key, the way the ledger does.
      async refund(_org: string, key: string) {
        refunds.push(key);
        const open = spends.findIndex((spend) => spend.key === key);
        if (open === -1) {
          return false;
        }
        balance += spends[open].amount;
        spends.splice(open, 1);
        return true;
      },
    },
    {},
    { getSocialIntegration: (name: string) => providers[name] }
  );

const run = async (autopost = rule) => {
  const autoposts = service(autopost);
  autoposts.loadXML = async () => ({
    success: true,
    url: 'https://example.com/post-1',
    description: 'The feed item',
  });
  await autoposts.startAutopost(autopost.id);
};

beforeEach(() => {
  balance = 1000;
  spends = [];
  posts = [];
  validated = 0;
  notifications = [];
  refunds = [];
  failPublish = false;
  publishShort = false;
  channels = [channel];
  sentTo = [];
});

describe('Autopost and credits', { skip: !canLoadService }, () => {
  it('pays for its AI text and picture under keys of the feed item, and publishes', async () => {
    await run();
    const first = [...spends];
    assert.deepEqual(
      first.map((s) => s.amount),
      [
        AI_FIXED_CREDIT_COSTS_PROPOSAL.legacy.autopostText,
        AI_FIXED_CREDIT_COSTS_PROPOSAL.legacy.autopostPicture,
      ]
    );
    assert.match(first[0].key, /^autopost:rule-1:[0-9a-f]{24}:text$/);
    assert.match(first[1].key, /^autopost:rule-1:[0-9a-f]{24}:picture$/);
    // the same item run again (a retried activity) names the same charges
    await run();
    assert.deepEqual(spends, first);
    assert.deepEqual(posts, ['now', 'now']);
    assert.deepEqual(notifications, []);
  });

  it('charges an item that comes back after another as a new claim', async () => {
    // A, then B, then A again: claiming B moved the rule's updatedAt, so the
    // second A is not mistaken for a retry of the first.
    await run();
    await run({ ...rule, updatedAt: new Date('2026-09-02T00:00:00Z') });
    assert.equal(spends.length, 4);
    assert.notEqual(spends[2].key, spends[0].key);
    assert.notEqual(spends[3].key, spends[1].key);
  });

  it('gives back the AI an item paid for when it cannot be scheduled', async () => {
    failPublish = true;
    await assert.rejects(run(), /X is down/);
    assert.deepEqual(refunds.slice(2), [
      `${refunds[0]}`,
      `${refunds[1]}`,
    ]);
    assert.deepEqual(spends, []);
    assert.equal(balance, 1000);
    assert.deepEqual(notifications, ['Autopost could not schedule an item']);
  });

  it("saves a draft with the feed's own text when the balance cannot pay for the AI", async () => {
    balance = 100;
    await run();
    assert.deepEqual(spends, []);
    assert.deepEqual(posts, ['draft']);
    assert.equal(validated, 0);
    assert.deepEqual(notifications, [
      'Autopost saved a draft: not enough credits',
    ]);
  });

  it('publishes without a picture when the balance runs short on the way', async () => {
    // Enough up front for the text only: the picture is refused when it is
    // charged, as another spend got there first. The text is written and paid
    // for, so the post goes out, as it does when a picture fails otherwise.
    const autoposts = service();
    autoposts.creditsShort = async () => false;
    autoposts.loadXML = async () => ({
      success: true,
      url: 'https://example.com/post-2',
      description: 'The feed item',
    });
    balance = AI_FIXED_CREDIT_COSTS_PROPOSAL.legacy.autopostText;
    await autoposts.startAutopost('rule-1');
    assert.deepEqual(
      spends.map((s) => s.key.split(':').pop()),
      ['text']
    );
    assert.deepEqual(posts, ['now']);
    assert.deepEqual(notifications, []);
  });

  it('judges a retried item by the balance before it, and has it paid for once', async () => {
    // An attempt that paid for its text and picture, then died before it
    // claimed the item, leaves too little for the retry to pay again. The
    // retry hands that back first, so it is not taken for a short balance.
    const price =
      AI_FIXED_CREDIT_COSTS_PROPOSAL.legacy.autopostText +
      AI_FIXED_CREDIT_COSTS_PROPOSAL.legacy.autopostPicture;
    balance = price + 10;
    await run();
    assert.equal(balance, 10);
    await run();
    assert.equal(balance, 10);
    assert.deepEqual(posts, ['now', 'now']);
    assert.deepEqual(notifications, []);
  });

  it('saves a draft when the balance cannot cover publishing the post', async () => {
    publishShort = true;
    await run({
      ...rule,
      generateContent: false,
      addPicture: false,
      content: 'Fixed text',
    });
    assert.deepEqual(posts, ['draft']);
    assert.deepEqual(notifications, [
      'Autopost saved a draft: not enough credits to publish',
    ]);
  });

  it('asks nothing of the balance for a rule without AI', async () => {
    balance = 0;
    await run({
      ...rule,
      generateContent: false,
      addPicture: false,
      content: 'Fixed text',
    });
    assert.deepEqual(spends, []);
    assert.deepEqual(posts, ['now']);
    assert.deepEqual(notifications, []);
  });
});

describe('Autopost channels', { skip: !canLoadService }, () => {
  const withoutAi = {
    ...rule,
    generateContent: false,
    addPicture: false,
    content: 'Fixed text',
  };

  it('publishes to none of the channels the Channels page shows as unfinished', async () => {
    channels = [channel, renewedUnpicked];
    await run(withoutAi);
    assert.deepEqual(posts, ['now']);
    assert.deepEqual(sentTo, [['ch-1']]);
  });

  it('says it has no channel when its only one never picked its page', async () => {
    channels = [renewedUnpicked];
    await run(withoutAi);
    assert.deepEqual(posts, []);
    assert.deepEqual(notifications, ['Autopost has no channel to post to']);
  });

  // A draft on it is what the person wants waiting once they pick the page.
  it('still saves a draft for it when the rule only drafts', async () => {
    channels = [channel, renewedUnpicked];
    await run({ ...withoutAi, autoPublish: false });
    assert.deepEqual(posts, ['draft']);
    assert.deepEqual(sentTo, [['ch-1', 'ch-2']]);
  });
});
