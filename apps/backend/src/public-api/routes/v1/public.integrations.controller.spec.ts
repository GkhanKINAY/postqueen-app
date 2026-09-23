import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const libraries = '../../../../../../libraries/nestjs-libraries/src/';
const controller = read('./public.integrations.controller.ts');
const media = read(`${libraries}database/prisma/media/media.service.ts`);
const posts = read(`${libraries}database/prisma/posts/posts.service.ts`);
const postsRepository = read(
  `${libraries}database/prisma/posts/posts.repository.ts`
);
const editor = read(
  '../../../../../frontend/src/components/new-launch/editor.tsx'
);
const integrations = read(
  `${libraries}database/prisma/integrations/integration.service.ts`
);
const repository = read(
  `${libraries}database/prisma/integrations/integration.repository.ts`
);
const scheduleTool = read(`${libraries}chat/tools/integration.schedule.post.ts`);
const triggerTool = read(`${libraries}chat/tools/integration.trigger.tool.ts`);
const clipping = read(`${libraries}database/prisma/clipping/clipping.service.ts`);
const middleware = read('../../../services/auth/auth.middleware.ts');
const appIntegrations = read('../../../api/routes/integrations.controller.ts');
const permissions = read(
  '../../../services/auth/permissions/permissions.service.ts'
);
const connect = read('../../../api/routes/no.auth.integrations.controller.ts');
const videoActivity = read(
  '../../../../../orchestrator/src/activities/video.activity.ts'
);

describe('the trial lock reads one derived flag', () => {
  it('derives it for video wherever the organization came from', () => {
    // The public API, MCP and the orchestrator's activity hand in the stored
    // row; the app hands in the middleware's derived one.
    assert.match(
      media,
      /const isTrialLocked = \([\s\S]*?\) => !video\.trial && effectiveIsTrailing\(org\);/
    );
    assert.match(videoActivity, /this\._mediaService\.generateVideo\(org, body\)/);
  });

  it('uses the same function in the middleware, the connect flow and clipping', () => {
    for (const source of [middleware, connect, clipping, integrations]) {
      assert.match(
        source,
        /import \{ effectiveIsTrailing \} from '@gitroom\/nestjs-libraries\/database\/prisma\/subscriptions\/pricing';/
      );
    }
    assert.doesNotMatch(middleware, /const effectiveIsTrailing =/);
    assert.match(connect, /effectiveIsTrailing\(org\) &&/);
    assert.match(
      integrations,
      /if \(!provider\.trialLocked \|\| !effectiveIsTrailing\(org\) \|\| refresh\)/
    );
  });
});

describe('an unknown video generator', () => {
  it('answers 404 with its identifier, not a 500', () => {
    assert.match(controller, /this\._mediaService\.videoFunction\(/);
    const videoFunction = media.slice(media.indexOf('async videoFunction('));
    assert.match(
      videoFunction,
      /throw new HttpException\(`Video generator \$\{identifier\} not found`, 404\);/
    );
    assert.doesNotMatch(media, /throw new Error\(`Video (type|with identifier)/);
  });
});

describe("type 'update' only changes a post that exists", () => {
  const createPost = posts.slice(
    posts.indexOf('  async createPost('),
    posts.indexOf('  async updatePostSettings(')
  );

  it('refuses a first entry that names no live main post, before writing', () => {
    const check = createPost.search(
      /if \(body\.type === 'update'\) \{\s*await this\.guardUpdateTargets\(orgId, body\.posts\);/
    );
    assert.ok(check > -1);
    assert.ok(check < createPost.indexOf('createOrUpdatePost('));
    const guard = posts.slice(
      posts.indexOf('  private async guardUpdateTargets('),
      posts.indexOf('  async createPost(')
    );
    assert.match(
      guard,
      /const id = post\.value\?\.\[0\]\?\.id;[\s\S]*?this\._postRepository\.getPostById\(id, orgId\)/
    );
    assert.match(
      guard,
      /if \(!existing \|\| existing\.deletedAt \|\| existing\.parentPostId\) \{\s*throw new BadRequestException\(/
    );
  });

  it('still creates a comment added while editing', () => {
    // The composer gives a new thread item an id of its own making, which
    // matches no row. Only the first entry is checked, so the upsert still
    // creates it.
    assert.match(editor, /id: makeId\(10\),/);
    assert.match(
      postsRepository,
      /where: \{\s*id: value\.id \|\| uuidv4\(\),\s*\},\s*create:/
    );
  });
});

describe('a deleted channel', () => {
  it('is left out by the lookup posting and channel endpoints use', () => {
    assert.match(
      repository,
      /getIntegrationByIdNotDeleted\(org: string, id: string\) \{\s*return this\._integration\.model\.integration\.findFirst\(\{\s*where: \{\s*organizationId: org,\s*id,\s*deletedAt: null,/
    );
    assert.match(
      posts,
      /getIntegrationByIdNotDeleted\(\s*organization,\s*post\.integration\.id\s*\)/
    );
    assert.match(scheduleTool, /getIntegrationByIdNotDeleted\(/);
    assert.match(triggerTool, /getIntegrationByIdNotDeleted\(/);
    // delete, integration-settings and integration-trigger
    assert.equal(
      controller.match(/getIntegrationByIdNotDeleted\(org\.id, id\)/g)?.length,
      3
    );
    assert.doesNotMatch(controller, /getIntegrationById\(/);
  });

  it('is refused by validation, the app channel routes, clipping and the refresh skip', () => {
    const validate = posts.slice(posts.indexOf('  async validatePosts('));
    assert.match(
      validate,
      /getIntegrationByIdNotDeleted\(\s*orgId,\s*post\?\.integration\?\.id\s*\)/
    );
    // nickname, mentions and function; a missing channel still answers the
    // controller's own "Invalid integration"
    assert.doesNotMatch(appIntegrations, /getIntegrationById\(/);
    assert.equal(
      appIntegrations.match(/getIntegrationByIdNotDeleted\(/g)?.length,
      3
    );
    assert.match(
      integrations,
      /async saveProviderPage\(org: string, id: string, data: any\) \{\s*const getIntegration =\s*await this\._integrationRepository\.getIntegrationByIdNotDeleted\(org, id\);/
    );
    assert.match(
      clipping,
      /!\(await this\._integrationService\.getIntegrationByIdNotDeleted\(\s*org\.id,\s*integration\s*\)\)/
    );
    // A removed channel named in ?refresh= is counted like a new one.
    assert.match(
      permissions,
      /if \(refreshChannelId\) \{\s*const existingIntegration =\s*await this\._integrationService\.getIntegrationByIdNotDeleted\(/
    );
  });

  it('keeps the plain lookup, and analytics telling a removed channel apart itself', () => {
    assert.match(
      repository,
      /getIntegrationById\(org: string, id: string\) \{\s*return this\._integration\.model\.integration\.findFirst\(\{\s*where: \{\s*organizationId: org,\s*id,\s*\},/
    );
    assert.match(
      integrations,
      /const getIntegration = await this\.getIntegrationById\(org\.id, integration\);[\s\S]*?if \(!getIntegration \|\| getIntegration\.deletedAt\) \{\s*throw new HttpException\('Channel not found', HttpStatus\.NOT_FOUND\);/
    );
  });
});
