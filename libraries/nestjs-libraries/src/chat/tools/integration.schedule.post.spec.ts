import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { IntegrationSchedulePostTool } from './integration.schedule.post.ts';
import { MediaDto } from '../../dtos/media/media.dto.ts';

const domain = 'uploads.postqueen.test';
let saved: string | undefined;
before(() => {
  saved = process.env.RESTRICT_UPLOAD_DOMAINS;
  process.env.RESTRICT_UPLOAD_DOMAINS = domain;
});
after(() => {
  if (saved === undefined) {
    delete process.env.RESTRICT_UPLOAD_DOMAINS;
  } else {
    process.env.RESTRICT_UPLOAD_DOMAINS = saved;
  }
});

const schema = () =>
  (new IntegrationSchedulePostTool(null as any, null as any).run() as any)
    .inputSchema;

const withAttachment = (attachment: unknown) => ({
  socialPost: [
    {
      integrationId: 'int-1',
      isPremium: false,
      date: '2026-11-01T10:00:00',
      shortLink: false,
      type: 'draft',
      settings: [],
      postsAndComments: [{ content: '<p>Hi</p>', attachments: [attachment] }],
    },
  ],
});

const video = `https://${domain}/v.mp4`;
const accepts = (attachment: unknown) =>
  schema().safeParse(withAttachment(attachment)).success;

describe('MCP attachments', () => {
  it('take a URL or an object with a jpeg or png cover on the upload domain', () => {
    assert.ok(accepts(video));
    assert.ok(accepts({ path: video, thumbnail: `https://${domain}/c.jpg` }));
    assert.ok(accepts({ path: video, thumbnail: `https://${domain}/c.JPEG?v=2` }));
    assert.ok(accepts({ path: video, thumbnail: `https://${domain}/c.png` }));
  });

  // the platforms refuse these as a cover, at publish time
  it('refuse a cover that is a gif, a webp or a video', () => {
    for (const ext of ['gif', 'webp', 'mp4']) {
      assert.ok(!accepts({ path: video, thumbnail: `https://${domain}/c.${ext}` }), ext);
    }
  });

  it('refuse a cover on another domain', () => {
    assert.ok(!accepts({ path: video, thumbnail: 'https://elsewhere.test/c.jpg' }));
  });

  it('keep alt text to 1000 characters, like MediaDto', async () => {
    assert.ok(accepts({ path: video, alt: 'a'.repeat(1000) }));
    assert.ok(!accepts({ path: video, alt: 'a'.repeat(1001) }));

    const dto = (alt: string) =>
      validate(plainToInstance(MediaDto, { id: 'm1', path: video, alt }));
    assert.equal((await dto('a'.repeat(1000))).length, 0);
    assert.ok((await dto('a'.repeat(1001))).some((e) => e.property === 'alt'));
  });
});
