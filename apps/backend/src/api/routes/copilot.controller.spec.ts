import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, it } from 'node:test';
import { HttpException } from '@nestjs/common';
import { insufficientCredits } from '../../../../../libraries/nestjs-libraries/src/database/prisma/credits/credits.repository.ts';
import { fileURLToPath } from 'node:url';

const controller = readFileSync(
  fileURLToPath(new URL('./copilot.controller.ts', import.meta.url)),
  'utf8'
);

const route = (decorator: string) =>
  controller.slice(controller.indexOf(decorator), controller.indexOf(decorator) + 700);

describe('Copilot chat actions', () => {
  it('lists chats through the service, with their dates', () => {
    assert.match(route("@Get('/list')"), /this\._mastraService\.listThreads\(organization\.id\)/);
  });

  it('renames with a validated body and 404s a chat that is not this workspace\'s', () => {
    const rename = route("@Put('/:thread')");
    assert.match(rename, /@Body\(\) body: ThreadTitleDto/);
    assert.match(rename, /HttpStatus\.NOT_FOUND/);
  });

  it('refuses to delete a chat that is still answering', () => {
    const del = route("@Delete('/:thread')");
    assert.match(del, /result === 'running'/);
    assert.match(del, /HttpStatus\.CONFLICT/);
  });

  it('lets only admins clear every chat', () => {
    const clear = route("@Delete('/')");
    assert.match(clear, /\[AuthorizationActions\.Create, Sections\.AI\]/);
    assert.match(clear, /\[AuthorizationActions\.Create, Sections\.ADMIN\]/);
  });
});

describe('Copilot and credits', () => {
  const key = process.env.OPENAI_API_KEY;
  let CopilotController: any;
  let checks: string[];
  let balance: number;

  before(async () => {
    process.env.DATABASE_URL ||= 'postgresql://spec:spec@127.0.0.1:1/spec';
    ({ CopilotController } = await import('./copilot.controller.ts'));
  });
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'sk-spec';
    checks = [];
    balance = 0;
  });
  after(() => {
    if (key === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = key;
    }
  });

  const make = () =>
    new CopilotController(
      {},
      {},
      {
        async assertAvailable(org: string, amount: number) {
          checks.push(org);
          if (amount > balance) {
            throw insufficientCredits(amount, balance);
          }
        },
      },
      { meteredClient: () => ({}) }
    );
  const response = () => {
    const written: unknown[] = [];
    return {
      written,
      setHeader: (...args: unknown[]) => written.push(['header', ...args]),
      status: (code: number) => ({
        json: (body: unknown) => written.push([code, body]),
      }),
    };
  };
  const org = { id: 'org-1' };
  const run = { body: { method: 'agent/run', body: { messages: [] } } };

  for (const route of ['chatAgent', 'agent']) {
    it(`${route}: refuses a run at an empty balance with a 402, before anything streams`, async () => {
      const res = response();
      await assert.rejects(make()[route](run, res, org), (err) => {
        assert.ok(err instanceof HttpException);
        assert.equal(err.getStatus(), 402);
        assert.deepEqual(err.getResponse(), {
          statusCode: 402,
          message: 'Not enough credits: this costs 0.01 and the balance is 0.',
          code: 'insufficient_credits',
          required: 0.01,
          balance: 0,
        });
        return true;
      });
      assert.deepEqual(res.written, []);
      assert.deepEqual(checks, ['org-1']);
    });
  }

  it('checks only the methods that run a model', async () => {
    for (const method of ['info', 'agent/connect', 'agent/stop', undefined]) {
      await make().assertCredits({ body: { method } }, org);
    }
    assert.deepEqual(checks, []);
    for (const method of ['agent/run', 'agent/suggest', 'transcribe']) {
      await assert.rejects(make().assertCredits({ body: { method } }, org));
    }
    assert.equal(checks.length, 3);
  });

  it('lets any positive balance start a turn, however small', async () => {
    balance = 1;
    await make().assertCredits(run, org);
    assert.deepEqual(checks, ['org-1']);
  });

  it('charges /copilot/chat through its own metered client', () => {
    const chat = route("@Post('/chat')");
    assert.match(chat, /await this\.assertCredits\(req, organization\);/);
    assert.match(
      controller.slice(controller.indexOf("@Post('/chat')")),
      /openai: this\._openaiService\.meteredClient\(\s*organization\.id,\s*'copilot_chat'\s*\)/
    );
  });
});
