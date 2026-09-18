import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import {
  AGUI_TEXT_CONTINUATION,
  mastraToAgUiMessages,
} from './mastra.thread.runner.ts';

const stored = (
  id: string,
  role: 'user' | 'assistant' | 'system',
  parts: any[]
) => ({ id, role, content: { format: 2 as const, parts } });

describe('Mastra history to AG-UI messages', () => {
  it('keeps user and assistant ids so the bridge does not re-send history', () => {
    const out = mastraToAgUiMessages([
      stored('u1', 'user', [{ type: 'text', text: 'Write a post' }]),
      stored('a1', 'assistant', [{ type: 'text', text: 'Here you go' }]),
    ]);
    assert.deepEqual(out, [
      { id: 'u1', role: 'user', content: 'Write a post' },
      { id: 'a1', role: 'assistant', content: 'Here you go' },
    ]);
  });

  it('orders text, tool calls, tool results and the continuation like the live stream', () => {
    const out = mastraToAgUiMessages([
      stored('a1', 'assistant', [
        { type: 'step-start' },
        { type: 'text', text: 'Checking the rules.' },
        {
          type: 'tool-invocation',
          toolInvocation: {
            state: 'result',
            toolCallId: 'call_1',
            toolName: 'integrationSchema',
            args: { platform: 'x', isPremium: false },
            result: { output: { maxLength: 280 } },
          },
        },
        { type: 'text', text: 'Done.' },
      ]),
    ]);
    assert.deepEqual(out, [
      {
        id: 'a1',
        role: 'assistant',
        content: 'Checking the rules.',
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'integrationSchema',
              arguments: '{"platform":"x","isPremium":false}',
            },
          },
        ],
      },
      {
        id: 'call_1-result',
        role: 'tool',
        toolCallId: 'call_1',
        content: '{"output":{"maxLength":280}}',
      },
      { id: `a1${AGUI_TEXT_CONTINUATION}`, role: 'assistant', content: 'Done.' },
    ]);
  });

  it('closes a call without a result as interrupted, with valid JSON arguments', () => {
    const out = mastraToAgUiMessages([
      stored('a1', 'assistant', [
        {
          type: 'tool-invocation',
          toolInvocation: {
            state: 'call',
            toolCallId: 'call_2',
            toolName: 'manualPosting',
          },
        },
      ]),
    ]);
    assert.equal(out.length, 2);
    const head = out[0] as any;
    assert.equal(head.toolCalls[0].function.arguments, '{}');
    assert.doesNotThrow(() => JSON.parse(head.toolCalls[0].function.arguments));
    assert.deepEqual(out[1], {
      id: 'call_2-result',
      role: 'tool',
      toolCallId: 'call_2',
      content: '{"status":"interrupted"}',
    });
  });

  it('skips system and signal messages and empty assistant turns', () => {
    const out = mastraToAgUiMessages([
      stored('s1', 'system', [{ type: 'text', text: 'hidden' }]),
      { id: 'sig', role: 'signal', content: { format: 2, parts: [] } } as any,
      stored('a1', 'assistant', [{ type: 'step-start' }]),
      stored('u1', 'user', [{ type: 'text', text: 'hi' }]),
    ]);
    assert.deepEqual(out, [{ id: 'u1', role: 'user', content: 'hi' }]);
  });

  // The bridge gives text that follows a tool call its own message id with
  // this suffix; replaying history under a different one would make the
  // client re-send it. Resolved through the package entry, not a build hash.
  it('uses the same continuation suffix as the installed @ag-ui/mastra bridge', () => {
    const dist = dirname(createRequire(import.meta.url).resolve('@ag-ui/mastra'));
    const chunks = readdirSync(dist).filter((file) =>
      /^mastra-.*\.js$/.test(file)
    );
    assert.ok(chunks.length, 'no mastra chunk in the bridge build');
    assert.ok(
      chunks.some((file) =>
        readFileSync(join(dist, file), 'utf8').includes(AGUI_TEXT_CONTINUATION)
      )
    );
  });
});
