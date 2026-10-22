import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SendNoticeDto } from './send.notice.dto.ts';

const notice = {
  noticeKey: 'terms-2026-11',
  subject: 'We are updating our Terms',
  dryRun: true,
  content: {
    category: 'Terms update',
    preheader: 'The new Terms apply from 21 November.',
    tone: 'brand',
    icon: 'help',
    title: 'We are updating our',
    accent: 'Terms.',
    blocks: [
      { type: 'text', text: 'Here is what changes.' },
      { type: 'details', rows: [['Takes effect', '21 November 2026']] },
      {
        type: 'button',
        link: { label: 'Read the new Terms', url: 'https://example.com/terms' },
      },
    ],
  },
};

// Paths of every failed rule, sorted, e.g. "content.blocks.0.text:isNotEmpty".
const failures = async (body: unknown) => {
  const flat = (errors: any[], path = ''): string[] =>
    errors.flatMap((e) => [
      ...Object.keys(e.constraints || {}).map(
        (rule) => `${path}${e.property}:${rule}`
      ),
      ...flat(e.children || [], `${path}${e.property}.`),
    ]);
  return flat(
    await validate(plainToInstance(SendNoticeDto, body) as object)
  ).sort();
};

const withBlocks = (blocks: unknown[]) => ({
  ...notice,
  content: { ...notice.content, blocks },
});

describe('SendNoticeDto', () => {
  it('takes a whole notice', async () => {
    assert.deepEqual(await failures(notice), []);
  });

  it('wants a slug for the key, and dryRun said out loud', async () => {
    assert.deepEqual(await failures({ ...notice, noticeKey: 'Terms 2026' }), [
      'noticeKey:matches',
    ]);
    assert.deepEqual(await failures({ ...notice, dryRun: undefined }), [
      'dryRun:isBoolean',
      'dryRun:isDefined',
    ]);
  });

  it('refuses a block that would go out blank', async () => {
    assert.deepEqual(await failures(withBlocks([{ type: 'text' }])), [
      'content.blocks.0.text:isNotEmpty',
      'content.blocks.0.text:isString',
    ]);
    assert.ok(
      (
        await failures(withBlocks([{ type: 'button', link: { url: '/x' } }]))
      ).includes('content.blocks.0.link.label:isNotEmpty')
    );
    assert.deepEqual(await failures(withBlocks([{ type: 'image' }])), [
      'content.blocks.0.type:isIn',
    ]);
  });

  it('knows only the tones and icons emails have', async () => {
    assert.deepEqual(
      await failures({
        ...notice,
        content: { ...notice.content, tone: 'pink', icon: 'bell' },
      }),
      ['content.icon:isIn', 'content.tone:isIn']
    );
  });
});
