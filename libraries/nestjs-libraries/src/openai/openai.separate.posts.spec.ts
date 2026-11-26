import 'reflect-metadata';
import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';

// The module's OpenAI client takes the global fetch when it is built, on
// import, so the fake is in place before the service is loaded.
let answers: string[][];
let sent: any[];

const completion = (posts: string[]) =>
  new Response(
    JSON.stringify({
      id: 'chatcmpl-1',
      object: 'chat.completion',
      created: 0,
      model: 'gpt-6.2-sol',
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: JSON.stringify({ posts }),
            refusal: null,
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );

let service: any;

before(async () => {
  globalThis.fetch = (async (_input: any, init?: any) => {
    sent.push(JSON.parse(init.body));
    return completion(answers.shift() || []);
  }) as typeof fetch;
  const { OpenaiService } = await import('./openai.service.ts');
  service = new OpenaiService({} as any);
});

beforeEach(() => {
  answers = [];
  sent = [];
});

describe('OpenaiService.separatePosts', () => {
  it('asks once more when the model answers an empty thread', async () => {
    answers = [[], ['First part.', 'Second part.']];
    const result = await service.separatePosts('A post to split', 280);
    assert.deepEqual(result.posts, ['First part.', 'Second part.']);
    assert.equal(sent.length, 2);
  });

  it('throws after a second empty answer, so the credits go back', async () => {
    answers = [[], []];
    await assert.rejects(
      service.separatePosts('A post to split', 280),
      /could not be split/
    );
    assert.equal(sent.length, 2);
  });

  it('asks once when the first answer has parts', async () => {
    answers = [['Only part.']];
    const result = await service.separatePosts('A post to split', 280);
    assert.deepEqual(result.posts, ['Only part.']);
    assert.equal(sent.length, 1);
  });

  it('sets a maximum and no minimum the parts cannot always meet', async () => {
    answers = [['Only part.']];
    await service.separatePosts('A post to split', 280);
    const system = sent[0].messages[0].content;
    assert.match(system, /maximum 280 characters/);
    assert.doesNotMatch(system, /minimum/);
    assert.equal(sent[0].reasoning_effort, 'low');
  });
});
