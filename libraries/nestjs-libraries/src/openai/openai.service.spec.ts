import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  OpenaiService,
  OpenAiUsage,
  meteredFetch,
  openAiUsage,
} from './openai.service.ts';

const encoder = new TextEncoder();

// A server-sent event body delivered in pieces cut anywhere, the way the
// network hands it over.
const sse = (text: string, cuts: number[]) => {
  const bounds = [0, ...cuts, text.length];
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bounds.length - 1; i++) {
        controller.enqueue(
          encoder.encode(text.slice(bounds[i], bounds[i + 1]))
        );
      }
      controller.close();
    },
  });
};

const eventStream = (text: string, cuts: number[] = []) =>
  new Response(sse(text, cuts), {
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8' },
  });

let reported: OpenAiUsage[];
let sent: { url: string; body?: any }[];

const fetchReturning =
  (response: () => Response): typeof fetch =>
  async (input, init) => {
    sent.push({
      url: String(input),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    return response();
  };

const responsesStream = [
  'event: response.created',
  `data: ${JSON.stringify({ type: 'response.created', response: { id: 'resp_1', model: 'gpt-4.1-2025-04-14', usage: null } })}`,
  '',
  'event: response.output_text.delta',
  `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'Hi' })}`,
  '',
  'event: response.completed',
  `data: ${JSON.stringify({ type: 'response.completed', response: { id: 'resp_1', model: 'gpt-4.1-2025-04-14', usage: { input_tokens: 812, output_tokens: 47 } } })}`,
  '',
  '',
].join('\n');

const chatStream = [
  `data: ${JSON.stringify({ id: 'chatcmpl-1', model: 'gpt-4.1-2025-04-14', choices: [{ delta: { content: 'Hi' } }] })}`,
  '',
  `data: ${JSON.stringify({ id: 'chatcmpl-1', model: 'gpt-4.1-2025-04-14', choices: [], usage: { prompt_tokens: 300, completion_tokens: 20 } })}`,
  '',
  'data: [DONE]',
  '',
  '',
].join('\n');

const readAll = async (response: Response) => response.text();

beforeEach(() => {
  reported = [];
  sent = [];
});

describe('meteredFetch', () => {
  it("reads a Responses stream's usage from its last event, across cut lines", async () => {
    const cut = responsesStream.indexOf('input_tokens') + 3;
    const fetcher = meteredFetch(
      (usage) => reported.push(usage),
      fetchReturning(() => eventStream(responsesStream, [17, cut, cut + 9]))
    );
    const response = await fetcher('https://api.openai.com/v1/responses', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-4.1', stream: true }),
    });
    // the caller reads exactly what was sent
    assert.equal(await readAll(response), responsesStream);
    assert.deepEqual(reported, [
      {
        id: 'resp_1',
        model: 'gpt-4.1-2025-04-14',
        inputTokens: 812,
        outputTokens: 47,
      },
    ]);
    // the Responses API reports usage on its own; its request is left alone
    assert.deepEqual(sent[0].body, { model: 'gpt-4.1', stream: true });
  });

  it('asks a streamed chat completion for its usage, and reads it', async () => {
    const fetcher = meteredFetch(
      (usage) => reported.push(usage),
      fetchReturning(() => eventStream(chatStream, [40, 41, 150]))
    );
    const response = await fetcher(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        body: JSON.stringify({ model: 'gpt-4.1', stream: true, messages: [] }),
      }
    );
    assert.equal(await readAll(response), chatStream);
    assert.deepEqual(sent[0].body.stream_options, { include_usage: true });
    assert.deepEqual(reported, [
      {
        id: 'chatcmpl-1',
        model: 'gpt-4.1-2025-04-14',
        inputTokens: 300,
        outputTokens: 20,
      },
    ]);
  });

  it('reads a stream with CRLF line ends, and keeps the stream options a caller set', async () => {
    const fetcher = meteredFetch(
      (usage) => reported.push(usage),
      fetchReturning(() => eventStream(chatStream.replace(/\n/g, '\r\n'), [99]))
    );
    const response = await fetcher(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        body: JSON.stringify({
          model: 'gpt-4.1',
          stream: true,
          stream_options: { include_obfuscation: false },
          messages: [],
        }),
      }
    );
    await readAll(response);
    assert.deepEqual(sent[0].body.stream_options, {
      include_obfuscation: false,
      include_usage: true,
    });
    assert.deepEqual(
      reported.map((u) => [u.id, u.inputTokens, u.outputTokens]),
      [['chatcmpl-1', 300, 20]]
    );
  });

  it('reports nothing, and throws nothing, for a stream its reader cancels', async () => {
    const fetcher = meteredFetch(
      (usage) => reported.push(usage),
      fetchReturning(() =>
        eventStream(responsesStream, [
          responsesStream.indexOf('event: response.completed'),
        ])
      )
    );
    const response = await fetcher('https://api.openai.com/v1/responses', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-4.1', stream: true }),
    });
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    assert.deepEqual(reported, []);
  });

  it("reads a whole answer's usage and leaves its body to the caller", async () => {
    const body = {
      id: 'chatcmpl-2',
      model: 'gpt-4.1',
      choices: [{ message: { content: 'Hi' } }],
      usage: { prompt_tokens: 10, completion_tokens: 2 },
    };
    const fetcher = meteredFetch(
      (usage) => reported.push(usage),
      fetchReturning(
        () =>
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
      )
    );
    const response = await fetcher(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        body: JSON.stringify({ model: 'gpt-4.1', messages: [] }),
      }
    );
    assert.deepEqual(await response.json(), body);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(sent[0].body.stream_options, undefined);
    assert.deepEqual(reported, [
      { id: 'chatcmpl-2', model: 'gpt-4.1', inputTokens: 10, outputTokens: 2 },
    ]);
  });

  it('reports nothing for a refused call', async () => {
    const fetcher = meteredFetch(
      (usage) => reported.push(usage),
      fetchReturning(
        () =>
          new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
            status: 429,
            headers: { 'content-type': 'application/json' },
          })
      )
    );
    const response = await fetcher('https://api.openai.com/v1/responses', {
      method: 'POST',
      body: '{}',
    });
    assert.equal(response.status, 429);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(reported, []);
  });
});

describe('openAiUsage', () => {
  it('is nothing until the usage is there', () => {
    assert.equal(
      openAiUsage({
        type: 'response.created',
        response: { id: 'resp_1', usage: null },
      }),
      null
    );
    assert.equal(openAiUsage({ id: 'chatcmpl-1', choices: [{}] }), null);
    assert.equal(openAiUsage(null), null);
  });
});

describe('meteredClient', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('charges each call to the organization, keyed by its response id', async () => {
    const charges: unknown[][] = [];
    globalThis.fetch = fetchReturning(
      () =>
        new Response(
          JSON.stringify({
            id: 'chatcmpl-9',
            object: 'chat.completion',
            model: 'gpt-4.1-2025-04-14',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Hi' },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 120,
              completion_tokens: 8,
              total_tokens: 128,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    );
    const service = new OpenaiService({
      chargeLlm: async (org: string, usage: unknown) => {
        charges.push([org, usage]);
        return { id: 'spend', charged: true };
      },
    } as any);
    const client = service.meteredClient('org-1', 'copilot_chat');
    await client.chat.completions.create({
      model: 'gpt-4.1',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(charges, [
      [
        'org-1',
        {
          key: 'llm:chatcmpl-9',
          model: 'gpt-4.1-2025-04-14',
          inputTokens: 120,
          outputTokens: 8,
          action: 'copilot_chat',
        },
      ],
    ]);
  });
});

describe('/copilot/chat', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('charges the model CopilotKit builds from the metered client', async () => {
    const { OpenAIAdapter } = await import('@copilotkit/runtime');
    const created = {
      id: 'resp_7',
      object: 'response',
      created_at: 1,
      model: 'gpt-4.1-2025-04-14',
      output: [],
    };
    globalThis.fetch = fetchReturning(() =>
      eventStream(
        [
          `data: ${JSON.stringify({ type: 'response.created', sequence_number: 0, response: created })}`,
          '',
          `data: ${JSON.stringify({
            type: 'response.completed',
            sequence_number: 1,
            response: {
              ...created,
              status: 'completed',
              usage: {
                input_tokens: 640,
                input_tokens_details: { cached_tokens: 0 },
                output_tokens: 32,
                output_tokens_details: { reasoning_tokens: 0 },
              },
            },
          })}`,
          '',
          '',
        ].join('\n')
      )
    );
    const charges: unknown[][] = [];
    const service = new OpenaiService({
      chargeLlm: async (org: string, usage: unknown) => {
        charges.push([org, usage]);
        return { id: 'spend', charged: true };
      },
    } as any);
    // The same adapter the controller builds; the runtime's default agent
    // runs on `getLanguageModel()`.
    const model: any = new OpenAIAdapter({
      model: 'gpt-4.1',
      openai: service.meteredClient('org-1', 'copilot_chat'),
    }).getLanguageModel();
    const { stream } = await model.doStream({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    });
    const reader = stream.getReader();
    while (!(await reader.read()).done) {
      /** drain **/
    }
    assert.match(sent[0].url, /\/responses$/);
    assert.deepEqual(charges, [
      [
        'org-1',
        {
          key: 'llm:resp_7',
          model: 'gpt-4.1-2025-04-14',
          inputTokens: 640,
          outputTokens: 32,
          action: 'copilot_chat',
        },
      ],
    ]);
  });
});
