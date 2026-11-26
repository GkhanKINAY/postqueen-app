import 'reflect-metadata';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { after, before, describe, it } from 'node:test';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { IntegrationSchedulePostTool } from './integration.schedule.post.ts';
import { MediaDto } from '../../dtos/media/media.dto.ts';

// As in integration.pages.spec.ts: tsx follows tsconfig's mapping of
// `file-type` and `mime` to their declarations, so the code the service
// imports is pointed at the packages' own entries. On a Node without
// registerHooks the specs that need the service are skipped rather than
// failed.
const entries: Record<string, string> = {
  'file-type': '../../../../../node_modules/file-type/source/index.js',
  mime: '../../../../../node_modules/mime/dist/src/index.js',
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

const domain = 'uploads.postqueen.test';
let saved: string | undefined;
let IntegrationService: any;
before(async () => {
  saved = process.env.RESTRICT_UPLOAD_DOMAINS;
  process.env.RESTRICT_UPLOAD_DOMAINS = domain;
  if (canLoadService) {
    ({ IntegrationService } = await import(
      '../../database/prisma/integrations/integration.service.ts'
    ));
  }
});
after(() => {
  if (saved === undefined) {
    delete process.env.RESTRICT_UPLOAD_DOMAINS;
  } else {
    process.env.RESTRICT_UPLOAD_DOMAINS = saved;
  }
});

const schema = () =>
  (
    new IntegrationSchedulePostTool(
      null as any,
      null as any,
      null as any
    ).run() as any
  ).inputSchema;

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

const contextFor = (organizationId: string) => {
  const values = new Map([
    ['organization', JSON.stringify({ id: organizationId })],
  ]);
  return {
    requestContext: {
      get: (key: string) => values.get(key),
      set: (key: string, value: string) => values.set(key, value),
    },
  };
};
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

describe('MCP post content', () => {
  it('is cleaned the way CreatePostDto cleans the dashboard and API posts', async () => {
    const created: any[] = [];
    const validated: any[] = [];
    const tool = new IntegrationSchedulePostTool(
      {
        validatePosts: async (_org: string, posts: any[]) => {
          validated.push(...posts);
          return [{ valid: true, errors: true }];
        },
        assertPostsQuota: async () => undefined,
        assertPublishCredits: async () => undefined,
        createPost: async (_org: string, request: any) => {
          created.push(request);
          return [{ postId: 'post-1', integration: 'int-1' }];
        },
      } as any,
      {
        getIntegrationByIdNotDeleted: async () => ({
          id: 'int-1',
          name: 'Channel',
          providerIdentifier: 'bluesky',
        }),
        needsPageSelection: () => false,
      } as any,
      { getSocialIntegration: () => ({}) } as any
    );
    const input = withAttachment(video);
    input.socialPost[0].postsAndComments[0].content =
      '<p>Hi<script>alert(1)</script> <a href="javascript:alert(1)">there</a></p>';

    await (tool.run() as any).execute(input, contextFor('org-1'));

    const clean = '<p>Hi <a>there</a></p>';
    assert.equal(validated[0].value[0].content, clean);
    assert.equal(created[0].posts[0].value[0].content, clean);
  });
});

describe('MCP scheduling to an unfinished channel', { skip: !canLoadService }, () => {
  const providers: Record<string, Record<string, unknown>> = {
    facebook: { pageRequiredToPost: true },
    youtube: {},
  };
  const schedule = async (row: Record<string, unknown>) => {
    const created: any[] = [];
    let validated = 0;
    const tool = new IntegrationSchedulePostTool(
      {
        validatePosts: async () => {
          validated += 1;
          return [{ valid: true, errors: true }];
        },
        assertPostsQuota: async () => undefined,
        assertPublishCredits: async () => undefined,
        createPost: async (_org: string, request: any) => {
          created.push(request);
          return [{ postId: 'post-1', integration: 'int-1' }];
        },
      } as any,
      {
        getIntegrationByIdNotDeleted: async () => ({
          id: 'int-1',
          name: 'Channel',
          disabled: false,
          refreshNeeded: false,
          internalId: 'login-1',
          rootInternalId: 'login-1',
          inBetweenSteps: false,
          ...row,
        }),
        needsPageSelection: IntegrationService.prototype.needsPageSelection,
      } as any,
      {
        getSocialIntegration: (name: string) => providers[name],
      } as any
    );
    const input = withAttachment(video);
    input.socialPost[0].type = 'schedule';
    const result = await (tool.run() as any).execute(
      input,
      contextFor('org-1')
    );
    return { result, created, validated };
  };

  // A renewal writes inBetweenSteps: false, also over a channel that never
  // picked its page; the Channels page still shows it as unfinished.
  it('refuses a channel the Channels page shows as unfinished, before anything is made', async () => {
    for (const row of [
      { providerIdentifier: 'facebook' },
      { providerIdentifier: 'youtube', inBetweenSteps: true },
    ]) {
      const { result, created, validated } = await schedule(row);
      assert.match(result.output.errors, /needs to be reconnected/);
      assert.equal(validated, 0);
      assert.deepEqual(created, []);
    }
  });

  it('schedules to a channel that picked its page, or posts with its login', async () => {
    for (const row of [
      { providerIdentifier: 'facebook', internalId: 'page-1' },
      { providerIdentifier: 'youtube' },
    ]) {
      const { result, created } = await schedule(row);
      assert.equal(result.output.errors, undefined);
      assert.equal(result.output[0].postId, 'post-1');
      assert.equal(created.length, 1);
    }
  });
});
