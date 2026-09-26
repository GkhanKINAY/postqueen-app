import 'reflect-metadata';
import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';
import { insufficientCredits } from '../credits/credits.repository.ts';
import { AI_FIXED_CREDIT_COSTS_PROPOSAL } from '../subscriptions/pricing.ts';

let AutopostService: any;
before(async () => {
  ({ AutopostService } = await import('./autopost.service.ts'));
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

let balance: number;
let spends: { key: string; amount: number }[];
let posts: string[];
let validated: number;
let notifications: string[];
let refunds: string[];
let failPublish: boolean;

// Every collaborator faked. The AI calls themselves never run: the fake
// credits service stands in for the work it would have paid for.
const service = (autopost = rule) =>
  new AutopostService(
    {
      getAutopost: async () => autopost,
      updateUrl: async () => undefined,
    },
    {},
    { getIntegrationsList: async () => [channel] },
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
        posts.push(body.type);
        return [];
      },
    },
    {
      inAppNotification: async (_org: string, title: string) => {
        notifications.push(title);
      },
    },
    {
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
    }
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
});

describe('Autopost and credits', () => {
  it('pays for its AI text and picture under keys of the feed item, and publishes', async () => {
    await run();
    const first = [...spends];
    assert.deepEqual(
      first.map((s) => s.amount),
      [
        AI_FIXED_CREDIT_COSTS_PROPOSAL.autopostText,
        AI_FIXED_CREDIT_COSTS_PROPOSAL.autopostPicture,
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
    balance = AI_FIXED_CREDIT_COSTS_PROPOSAL.autopostText;
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
      AI_FIXED_CREDIT_COSTS_PROPOSAL.autopostText +
      AI_FIXED_CREDIT_COSTS_PROPOSAL.autopostPicture;
    balance = price + 10;
    await run();
    assert.equal(balance, 10);
    await run();
    assert.equal(balance, 10);
    assert.deepEqual(posts, ['now', 'now']);
    assert.deepEqual(notifications, []);
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
