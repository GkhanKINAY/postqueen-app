import 'reflect-metadata';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { tmpdir } from 'node:os';
import { afterEach, before, beforeEach, describe, it } from 'node:test';
import { HttpException } from '@nestjs/common';
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

let PostsService: any;
before(async () => {
  if (canLoadService) {
    ({ PostsService } = await import('./posts.service.ts'));
  }
});

// A network that bills per post, priced the way X is: a link costs more.
const billed = {
  creditCost: (op: any) =>
    op.type === 'publish'
      ? /https?:\/\//.test(op.message)
        ? 500
        : 40
      : undefined,
};

// The ledger, faked by what the service asks of it: open reservations by
// key, what was ever reserved, and a balance.
let open: Map<string, number>;
let ever: Set<string>;
let settled: string[];
let balance: number;
const credits = {
  async assertAvailable(_org: string, amount: number) {
    if (amount > balance) {
      throw insufficientCredits(amount, balance);
    }
  },
  async reservations(_org: string, prefix: string) {
    return [...open]
      .filter(([key]) => key.startsWith(prefix))
      .map(([idempotencyKey, amount]) => ({ idempotencyKey, credits: amount }));
  },
  async reserve(
    _org: string,
    spend: { key: string; amount: number; allowOverdraft?: boolean }
  ) {
    const held = open.get(spend.key) || 0;
    if (!spend.allowOverdraft && spend.amount - held > balance) {
      throw insufficientCredits(spend.amount, balance + held);
    }
    balance += held - spend.amount;
    open.set(spend.key, spend.amount);
    ever.add(spend.key);
    return { id: spend.key, charged: true };
  },
  async spend(_org: string, spend: { key: string; amount: number }) {
    if (spend.amount > balance) {
      throw insufficientCredits(spend.amount, balance);
    }
    balance -= spend.amount;
    open.set(spend.key, spend.amount);
    ever.add(spend.key);
    return { id: spend.key, charged: true };
  },
  async refund(_org: string, key: string) {
    if (!open.has(key)) {
      return false;
    }
    balance += open.get(key)!;
    open.delete(key);
    return true;
  },
  async settle(_org: string, key: string, suffix: string) {
    if (!open.has(key)) {
      return false;
    }
    open.delete(key);
    settled.push(`${key}@${suffix}`);
    return true;
  },
  async everReserved(_org: string, key: string) {
    return ever.has(key);
  },
};

// Posts by id. A thread is its root and the chain of children.
let posts: Map<string, any>;
const thread = (
  root: string,
  parts: string[],
  extra: Record<string, unknown> = {},
  provider = 'x'
) => {
  [root, ...parts].forEach((id, index, all) =>
    posts.set(id, {
      id,
      organizationId: 'org-1',
      group: `group-${root}`,
      parentPostId: index ? all[index - 1] : null,
      state: 'QUEUE',
      intervalInDays: null,
      deletedAt: null,
      content: `<p>${id}</p>`,
      settings: JSON.stringify({ __type: provider }),
      integration: { providerIdentifier: provider },
      ...extra,
    })
  );
};

const service = () =>
  new PostsService(
    {
      getPost: async (id: string) => {
        const post = posts.get(id);
        if (!post || post.deletedAt) {
          return null;
        }
        const child = [...posts.values()].find(
          (p) => p.parentPostId === id && !p.deletedAt
        );
        return { ...post, childrenPost: child ? [{ id: child.id }] : [] };
      },
      getPostById: async (id: string) => posts.get(id) || null,
      getRootPostByGroup: async (_org: string, group: string) =>
        [...posts.values()].find(
          (p) => p.group === group && !p.parentPostId && !p.deletedAt
        ) || null,
    },
    {
      getSocialIntegration: (identifier: string) =>
        identifier === 'x' ? billed : {},
    },
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    credits
  );

const channel = (
  id: string,
  provider: string,
  texts: string[],
  ids: string[] = []
) => ({
  integration: { id },
  settings: { __type: provider },
  value: texts.map((content, i) => ({ id: ids[i], content })),
});

const KEYS = [
  'STORAGE_PROVIDER',
  'UPLOAD_DIRECTORY',
  'STRIPE_PUBLISHABLE_KEY',
  'STRIPE_SECRET_KEY',
];
const previous = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

beforeEach(() => {
  process.env.STORAGE_PROVIDER = 'local';
  process.env.UPLOAD_DIRECTORY = tmpdir();
  process.env.STRIPE_PUBLISHABLE_KEY = 'spec';
  process.env.STRIPE_SECRET_KEY = 'spec';
  open = new Map();
  ever = new Set();
  settled = [];
  posts = new Map();
  balance = 1000;
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
  'Credits set aside when an X post is scheduled',
  { skip: !canLoadService },
  () => {
    it('asks the balance for every channel at once, item by item, a link at its own price', async () => {
      const request = {
        type: 'schedule',
        posts: [
          channel('x-1', 'x', ['<p>Launch</p>']),
          channel('x-2', 'x', [
            '<p>Read https://example.com</p>',
            '<p>more</p>',
          ]),
          channel('li', 'linkedin', ['<p>Launch https://example.com</p>']),
        ],
      };
      const { channels, needed } = await service().publishCredits(
        'org-1',
        request.type,
        request.posts
      );
      assert.deepEqual(
        channels.map((c: any) => c.cost),
        [40, 540, 0]
      );
      assert.equal(needed, 580);

      balance = 579;
      await assert.rejects(
        service().assertPublishCredits('org-1', [request]),
        (err) => err instanceof HttpException && err.getStatus() === 402
      );
      balance = 580;
      await service().assertPublishCredits('org-1', [request]);
    });

    it('asks nothing for a draft, and counts what an edit already has set aside', async () => {
      thread('p1', []);
      open.set('publish:p1:p1', 40);
      const edit = [
        channel('x-1', 'x', ['<p>now with https://example.com</p>'], ['p1']),
      ];
      assert.equal(
        (await service().publishCredits('org-1', 'schedule', edit)).needed,
        460
      );
      // saved as a draft, it hands its 40 back
      assert.equal(
        (await service().publishCredits('org-1', 'draft', edit)).needed,
        -40
      );
    });

    it('counts the thread finisher the save will add', async () => {
      const finished = {
        ...channel('x-1', 'x', ['<p>Launch</p>']),
        settings: {
          __type: 'x',
          active_thread_finisher: true,
          thread_finisher: 'Follow for more',
        },
      };
      const { needed } = await service().publishCredits('org-1', 'now', [
        finished,
      ]);
      assert.equal(needed, 80);
    });

    it('reserves each item of a scheduled thread, and releases what leaves it', async () => {
      thread('p1', ['p2']);
      await service().syncPublishReservation('org-1', 'p1');
      assert.deepEqual(
        [...open],
        [
          ['publish:p1:p1', 40],
          ['publish:p1:p2', 40],
        ]
      );
      assert.equal(balance, 920);

      // the reply was removed while editing
      posts.get('p2').deletedAt = new Date();
      await service().syncPublishReservation('org-1', 'p1');
      assert.deepEqual([...open.keys()], ['publish:p1:p1']);
      assert.equal(balance, 960);
    });

    it('hands everything back for a draft, a deleted post or a published one that does not repeat', async () => {
      for (const change of [
        { state: 'DRAFT' },
        { deletedAt: new Date() },
        { state: 'PUBLISHED' },
        { state: 'ERROR' },
      ]) {
        thread('p1', ['p2']);
        await service().syncPublishReservation('org-1', 'p1');
        Object.assign(posts.get('p1'), change);
        await service().syncPublishReservation('org-1', 'p1');
        assert.deepEqual([...open], [], JSON.stringify(change));
        assert.equal(balance, 1000);
      }
    });

    it('keeps a repeating post reserved for its next run', async () => {
      thread('p1', [], { state: 'PUBLISHED', intervalInDays: 7 });
      await service().syncPublishReservation('org-1', 'p1');
      assert.deepEqual([...open.keys()], ['publish:p1:p1']);
    });

    it('reserves nothing on a network that does not bill per post', async () => {
      thread('p1', ['p2'], {}, 'linkedin');
      await service().syncPublishReservation('org-1', 'p1');
      assert.deepEqual([...open], []);
    });
  }
);

describe(
  'Paying for an X post as it publishes',
  { skip: !canLoadService },
  () => {
    it('uses the reservation, and charges nothing more', async () => {
      thread('p1', ['p2']);
      await service().syncPublishReservation('org-1', 'p1');
      await service().payForPublish('x', posts.get('p1'));
      await service().payForPublish('x', posts.get('p2'));
      assert.equal(balance, 920);
    });

    it('lets a post scheduled before posts cost credits go out free', async () => {
      thread('p1', []);
      await service().payForPublish('x', posts.get('p1'));
      assert.equal(balance, 1000);
      assert.deepEqual([...open], []);
    });

    it('charges an item whose reservation is gone, and refuses it when the balance is short', async () => {
      thread('p1', []);
      ever.add('publish:p1:p1');
      await service().payForPublish('x', posts.get('p1'));
      assert.equal(balance, 960);

      thread('p3', []);
      ever.add('publish:p3:p3');
      balance = 10;
      await assert.rejects(
        service().payForPublish('x', posts.get('p3')),
        (err) => err instanceof HttpException && err.getStatus() === 402
      );
    });

    it("settles what was used under the release, and reserves a repeating post's next run", async () => {
      thread('p1', [], { intervalInDays: 7 });
      await service().syncPublishReservation('org-1', 'p1');
      posts.get('p1').state = 'PUBLISHED';
      await service().settlePublish('p1', 'x-100');
      assert.deepEqual(settled, ['publish:p1:p1@x-100']);
      assert.deepEqual([...open], [['publish:p1:p1', 40]]);
      assert.equal(balance, 920);
    });

    it('never fails a live post over its next run, even when the balance cannot reserve it', async () => {
      thread('p1', [], { intervalInDays: 7 });
      await service().syncPublishReservation('org-1', 'p1');
      posts.get('p1').state = 'PUBLISHED';
      balance = 0;
      await service().settlePublish('p1', 'x-100');
      assert.deepEqual(settled, ['publish:p1:p1@x-100']);
      assert.deepEqual([...open], []);
    });

    it('hands back the item that failed and the rest of its thread after it', async () => {
      thread('p1', ['p2', 'p3']);
      await service().syncPublishReservation('org-1', 'p1');
      await service().settlePublish('p1', 'x-1');
      await service().releasePublish('p2', [
        posts.get('p1'),
        posts.get('p2'),
        posts.get('p3'),
      ]);
      assert.deepEqual([...open], []);
      assert.deepEqual(settled, ['publish:p1:p1@x-1']);
      assert.equal(balance, 960);
    });
  }
);

describe('The price the composer shows', { skip: !canLoadService }, () => {
  it('is in credits, per channel that is billed, with what the balance still has to cover', async () => {
    thread('p1', []);
    open.set('publish:p1:p1', 40);
    const quote = await service().quotePublishCredits('org-1', 'schedule', [
      channel('x-1', 'x', ['<p>https://example.com</p>'], ['p1']),
      channel('li', 'linkedin', ['<p>Launch</p>']),
    ]);
    assert.deepEqual(quote, {
      credits: 5,
      needed: 4.6,
      channels: [{ integration: 'x-1', credits: 5 }],
    });
  });

  it('is nothing with billing off', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    assert.deepEqual(
      await service().quotePublishCredits('org-1', 'schedule', [
        channel('x-1', 'x', ['<p>Launch</p>']),
      ]),
      { credits: 0, needed: 0, channels: [] }
    );
  });
});
