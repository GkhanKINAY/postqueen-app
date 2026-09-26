import 'reflect-metadata';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { tmpdir } from 'node:os';
import { before, beforeEach, describe, it } from 'node:test';
import { HttpException } from '@nestjs/common';
import { insufficientCredits } from '../credits/credits.repository.ts';
import { AI_FIXED_CREDIT_COSTS_PROPOSAL } from '../subscriptions/pricing.ts';

// Loaded the way create.post.spec.ts loads it: tsconfig maps `file-type` to
// its type declarations and tsx follows that at run time.
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
  // The service builds its storage when it is made; nothing is stored here.
  process.env.UPLOAD_DIRECTORY ||= tmpdir();
  if (canLoadService) {
    ({ PostsService } = await import('./posts.service.ts'));
  }
});

let balance: number;
let calls: unknown[][];

const service = () =>
  new PostsService(
    {},
    {},
    {},
    {},
    {},
    {
      separatePosts: async (content: string, len: number) => {
        calls.push(['model', content, len]);
        return { posts: ['One', 'Two'] };
      },
    },
    {},
    {},
    {},
    {},
    {
      async withCredits(org: string, spend: any, work: () => Promise<unknown>) {
        if (spend.amount > balance) {
          throw insufficientCredits(spend.amount, balance);
        }
        calls.push([
          'spend',
          org,
          spend.key.split(':')[0],
          spend.amount,
          spend.action,
        ]);
        return work();
      },
    }
  );

beforeEach(() => {
  balance = 1000;
  calls = [];
});

describe('Separating a post into a thread', { skip: !canLoadService }, () => {
  it('is paid for before the model runs', async () => {
    assert.deepEqual(
      await service().separatePosts('org-1', 'A long post', 280),
      {
        posts: ['One', 'Two'],
      }
    );
    assert.deepEqual(calls, [
      [
        'spend',
        'org-1',
        'separate',
        AI_FIXED_CREDIT_COSTS_PROPOSAL.separatePosts,
        'separate_posts',
      ],
      ['model', 'A long post', 280],
    ]);
  });

  it('is refused with a 402 when the balance is short, and the model never runs', async () => {
    balance = AI_FIXED_CREDIT_COSTS_PROPOSAL.separatePosts - 1;
    await assert.rejects(
      service().separatePosts('org-1', 'A long post', 280),
      (err) => err instanceof HttpException && err.getStatus() === 402
    );
    assert.deepEqual(calls, []);
  });
});
