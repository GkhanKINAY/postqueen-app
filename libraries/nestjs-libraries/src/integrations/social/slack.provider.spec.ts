import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { SlackProvider, slackSectionBlocks } from './slack.provider.ts';

const provider = new SlackProvider();
const texts = (blocks: Array<{ text: { text: string } }>) =>
  blocks.map((b) => b.text.text);

describe('Slack section blocks', () => {
  it('keeps text that fits as one section, byte for byte', () => {
    // A media-only post has no text, and Slack refuses an empty section.
    assert.deepEqual(slackSectionBlocks(''), []);
    const short = 'Hello *team*\nsecond line';
    assert.deepEqual(slackSectionBlocks(short), [
      { type: 'section', text: { type: 'mrkdwn', text: short } },
    ]);
    assert.equal(slackSectionBlocks('a'.repeat(3000)).length, 1);
  });

  it('cuts long text into sections of at most 3,000, at a line break', () => {
    const paragraph = 'word '.repeat(400).trim(); // 1,999 characters
    const text = [paragraph, paragraph, paragraph].join('\n');
    const parts = texts(slackSectionBlocks(text));
    assert.deepEqual(parts, [paragraph, paragraph, paragraph]);
  });

  it('cuts hard at 3,000 when there is no line break, never inside an emoji', () => {
    const parts = texts(slackSectionBlocks('a'.repeat(7000)));
    assert.deepEqual(parts.map((p) => p.length), [3000, 3000, 1000]);

    const emoji = `${'a'.repeat(2999)}😀${'b'.repeat(10)}`;
    const [first, second] = texts(slackSectionBlocks(emoji));
    assert.equal(first, 'a'.repeat(2999));
    assert.equal(second, `😀${'b'.repeat(10)}`);
  });
});

describe('Slack checkValidity', () => {
  const picture = { path: 'https://cdn.test/a.png' };

  it('refuses a video, which Slack cannot show as an image block', async () => {
    assert.equal(
      await provider.checkValidity([[{ path: 'https://cdn.test/a.mp4' }]], {}, [], ['hi']),
      'Slack posts can include pictures but not videos'
    );
    assert.equal(
      await provider.checkValidity([[picture], [{ path: 'https://cdn.test/b.mp4' }]], {}, []),
      'Slack posts can include pictures but not videos'
    );
  });

  it('allows up to 50 blocks in a message, pictures included', async () => {
    const text = 'a'.repeat(3000 * 45);
    assert.equal(
      await provider.checkValidity([Array(5).fill(picture)], {}, [], [text]),
      true
    );
    assert.match(
      String(await provider.checkValidity([Array(6).fill(picture)], {}, [], [text])),
      /at most 50 blocks/
    );
  });

  it('caps the text at 50 full sections', () => {
    assert.equal(provider.maxLength(), 150000);
  });
});

describe('Slack publishing', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('sends the split sections, then the pictures', async () => {
    const bodies: any[] = [];
    globalThis.fetch = (async (url: string, init?: { body?: string }) => {
      if (String(url).includes('chat.postMessage')) {
        bodies.push(JSON.parse(init?.body || '{}'));
      }
      return { json: async () => ({ ts: '1', channel: 'C1', permalink: '' }) };
    }) as any;

    await provider.post(
      'id',
      'token',
      [
        {
          id: 'post',
          message: 'a'.repeat(3500),
          settings: { channel: 'C1' },
          media: [{ type: 'image', path: 'https://cdn.test/a.png' }],
        },
      ] as any,
      { name: 'Bot', picture: '' } as any
    );

    const [{ blocks }] = bodies;
    assert.deepEqual(
      blocks.map((b: any) => b.type),
      ['section', 'section', 'image']
    );
    assert.equal(blocks[0].text.text.length, 3000);
    assert.equal(blocks[1].text.text.length, 500);
  });

  it('threads every reply under the post, not under the previous reply', async () => {
    const threads: string[] = [];
    globalThis.fetch = (async (url: string, init?: { body?: string }) => {
      if (String(url).includes('chat.postMessage')) {
        threads.push(JSON.parse(init?.body || '{}').thread_ts);
      }
      return {
        json: async () => ({ ts: 'reply', channel: 'C1', permalink: '' }),
      };
    }) as any;

    for (const lastCommentId of [undefined, 'previous-reply']) {
      await provider.comment(
        'id',
        'post-ts',
        lastCommentId,
        'token',
        [{ id: 'c', message: 'hi', settings: { channel: 'C1' } }] as any,
        { name: 'Bot', picture: '' } as any
      );
    }

    assert.deepEqual(threads, ['post-ts', 'post-ts']);
  });
});

describe('Slack editor', () => {
  it('counts to the same 150,000 as the server', () => {
    const component = readFileSync(
      fileURLToPath(
        new URL(
          '../../../../../apps/frontend/src/components/new-launch/providers/slack/slack.provider.tsx',
          import.meta.url
        )
      ),
      'utf8'
    );
    assert.match(component, /maximumCharacters: 150000,/);
  });
});
