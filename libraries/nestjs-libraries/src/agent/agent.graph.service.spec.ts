import 'reflect-metadata';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { tmpdir } from 'node:os';
import { before, beforeEach, describe, it } from 'node:test';
import { HttpException } from '@nestjs/common';
import { insufficientCredits } from '../database/prisma/credits/credits.repository.ts';
import { AI_FIXED_CREDIT_COSTS_PROPOSAL } from '../database/prisma/subscriptions/pricing.ts';

// tsconfig maps these packages to their type declarations for tsc, and tsx
// follows that mapping at run time, so the service would load a .d.ts. Point
// them at the packages' own entries instead, as create.post.spec.ts does.
// registerHooks arrived in Node 22.15; on an older 22 the spec is skipped
// rather than failed.
const entries: Record<string, string> = {
  '@langchain/langgraph/prebuilt':
    '../../../../node_modules/@langchain/langgraph/dist/prebuilt/index.cjs',
  'file-type': '../../../../node_modules/file-type/source/index.js',
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

let AgentGraphService: any;
before(async () => {
  // The service builds its storage when it is made; nothing is stored here.
  process.env.UPLOAD_DIRECTORY ||= tmpdir();
  if (canLoadService) {
    ({ AgentGraphService } = await import('./agent.graph.service.ts'));
  }
});

let balance: number;
let calls: unknown[][];

const credits = {
  async assertAvailable(org: string, amount: number) {
    calls.push(['assert', org, amount]);
    if (amount > balance) {
      throw insufficientCredits(amount, balance);
    }
  },
  async spend(org: string, spend: { key: string; amount: number }) {
    if (spend.amount > balance) {
      throw insufficientCredits(spend.amount, balance);
    }
    calls.push(['spend', org, spend.key, spend.amount]);
    return { id: 'spend', charged: true };
  },
  async refund(org: string, key: string) {
    calls.push(['refund', org, key]);
    return true;
  },
  async withCredits(org: string, spend: { key: string; amount: number }) {
    if (spend.amount > balance) {
      throw insufficientCredits(spend.amount, balance);
    }
    calls.push(['spend', org, spend.key, spend.amount]);
    return [{ content: 'Post', image: 'data' }];
  },
};

const service = () => new AgentGraphService({}, {}, credits);
const body = (format: string, isPicture: boolean) => ({
  research: 'Our spring launch',
  format,
  tone: 'company',
  isPicture,
});

beforeEach(() => {
  balance = 1000;
  calls = [];
});

describe('The AI post generator and credits', { skip: !canLoadService }, () => {
  it('is refused up front for the text and the fewest pictures its format can have', async () => {
    const { generator, generatorPicture } = AI_FIXED_CREDIT_COSTS_PROPOSAL;
    await service().assertCredits('org-1', body('one_long', false));
    await service().assertCredits('org-1', body('one_short', true));
    await service().assertCredits('org-1', body('thread_long', true));
    assert.deepEqual(
      calls.map((c) => c[2]),
      [
        generator,
        generator + generatorPicture,
        generator + 2 * generatorPicture,
      ]
    );

    balance = generator;
    await assert.rejects(
      service().assertCredits('org-1', body('one_short', true)),
      (err) => err instanceof HttpException && err.getStatus() === 402
    );
  });

  it('charges the text before the run and hands the run back whole if it fails', async () => {
    const generator = service();
    // Pictures are charged part way through a run, so their key goes back
    // too; a key never charged hands back nothing.
    generator.run = async function* () {
      yield { name: 'agent' };
      throw new Error('model down');
    };
    const events: unknown[] = [];
    await assert.rejects(async () => {
      for await (const event of generator.start(
        'org-1',
        body('one_short', false)
      )) {
        events.push(event);
      }
    }, /model down/);
    assert.deepEqual(events, [{ name: 'agent' }]);
    const [spend, ...refunds] = calls;
    assert.equal(spend[0], 'spend');
    assert.match(spend[2] as string, /^generator:/);
    assert.equal(spend[3], AI_FIXED_CREDIT_COSTS_PROPOSAL.generator);
    assert.deepEqual(refunds, [
      ['refund', 'org-1', spend[2]],
      ['refund', 'org-1', `${spend[2]}:pictures`],
    ]);
  });

  it("answers with the run's own error when a refund cannot be written", async () => {
    const generator = new AgentGraphService(
      {},
      {},
      {
        ...credits,
        async refund() {
          throw new Error('database down');
        },
      }
    );
    generator.run = async function* () {
      throw new Error('model down');
    };
    await assert.rejects(async () => {
      for await (const _ of generator.start(
        'org-1',
        body('one_short', false)
      )) {
        /** drain **/
      }
    }, /model down/);
  });

  it('keeps the charge of a run that finishes', async () => {
    const generator = service();
    generator.run = async function* () {
      yield { name: 'post-time' };
    };
    for await (const _ of generator.start('org-1', body('one_short', false))) {
      /** drain **/
    }
    assert.deepEqual(
      calls.map((c) => c[0]),
      ['spend']
    );
  });

  it('charges one picture per post, once their number is known, and hands them back if they are not saved', async () => {
    const generator = service();
    const state = {
      orgId: 'org-1',
      creditKey: 'generator:abc',
      isPicture: true,
      content: [
        { content: 'One', prompt: 'a' },
        { content: 'Two', prompt: 'b' },
        { content: 'Three', prompt: 'c' },
      ],
    };
    await generator.generatePictures(state);
    assert.deepEqual(calls, [
      [
        'spend',
        'org-1',
        'generator:abc:pictures',
        3 * AI_FIXED_CREDIT_COSTS_PROPOSAL.generatorPicture,
      ],
    ]);

    calls = [];
    generator.savePictures = async () => {
      throw new Error('storage down');
    };
    await assert.rejects(generator.uploadPictures(state), /storage down/);
    assert.deepEqual(calls, [['refund', 'org-1', 'generator:abc:pictures']]);
  });

  it('finishes without pictures when the balance cannot pay for them all', async () => {
    // The text is written and paid for; a balance spent elsewhere meanwhile
    // costs the run its pictures, not the run.
    balance = 2 * AI_FIXED_CREDIT_COSTS_PROPOSAL.generatorPicture;
    const state = {
      orgId: 'org-1',
      creditKey: 'generator:abc',
      isPicture: true,
      content: [
        { content: 'One', prompt: 'a' },
        { content: 'Two', prompt: 'b' },
        { content: 'Three', prompt: 'c' },
      ],
    };
    assert.deepEqual(await service().generatePictures(state), {});
    assert.deepEqual(calls, []);
  });
});
