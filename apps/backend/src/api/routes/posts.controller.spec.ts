import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const controller = readFileSync(
  fileURLToPath(new URL('./posts.controller.ts', import.meta.url)),
  'utf8'
);
const service = readFileSync(
  fileURLToPath(
    new URL(
      '../../../../../libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts',
      import.meta.url
    )
  ),
  'utf8'
);

describe('Create Post find-slot', () => {
  it('uses a 1–4 hour soon slot, not postingTimes 02:00', () => {
    assert.match(controller, /findSoonDateTime\(org\.id\)/);
    assert.match(service, /async findSoonDateTime/);
    assert.match(service, /soonWindow/);
  });

  it('keeps per-channel slots on the postingTimes grid', () => {
    assert.match(controller, /findFreeDateTime\(org\.id, id\)/);
  });
});

describe('changeDate does not publish drafts', () => {
  it('forces action update when the row is still a draft', () => {
    assert.match(
      service,
      /if \(getPostById\?\.state === 'DRAFT'\) \{\s*action = 'update';/s
    );
  });

  it('still starts Temporal only after a schedule date change', () => {
    assert.match(service, /if \(action === 'schedule'\) \{/);
    assert.match(service, /path: 'changeDate'/);
  });
});

describe('Stop repeating a published post', () => {
  const repository = readFileSync(
    fileURLToPath(
      new URL(
        '../../../../../libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts',
        import.meta.url
      )
    ),
    'utf8'
  );
  const stopRepeat = service.slice(
    service.indexOf('async stopRepeat('),
    service.indexOf('async deletePostsByGroups(')
  );

  it('is a route of its own, scoped to the organization', () => {
    assert.match(controller, /@Delete\('\/:group\/repeat'\)/);
    assert.match(controller, /stopRepeat\(org\.id, group\)/);
  });

  it('only stops a published post, so a first publish is never cancelled', () => {
    assert.match(stopRepeat, /post\.state !== 'PUBLISHED'/);
  });

  it('clears the interval before it ends the runs still waiting', () => {
    const clear = stopRepeat.indexOf('this._postRepository.stopRepeat(');
    const end = stopRepeat.indexOf('this.terminatePostWorkflows(post.id)');
    assert.ok(clear > -1 && end > -1);
    assert.ok(clear < end);
  });

  it('clears every row of the group in this organization', () => {
    const block = repository.slice(
      repository.indexOf('stopRepeat(orgId: string, group: string)'),
      repository.indexOf('getPostsByGroup(orgId: string, group: string)')
    );
    assert.match(block, /updateMany\(/);
    assert.match(block, /organizationId: orgId/);
    assert.match(block, /intervalInDays: null/);
  });
});

describe('The older AI features and credits', () => {
  it('refuses the AI post generator before its stream starts', () => {
    const generator = controller.slice(
      controller.indexOf("@Post('/generator')"),
      controller.indexOf("@Delete('/:group')")
    );
    const check = generator.indexOf(
      'await this._agentGraphService.assertCredits(org.id, body);'
    );
    assert.ok(check > -1);
    assert.ok(check < generator.indexOf('res.setHeader('));
    assert.ok(check < generator.indexOf('res.write('));
  });

  it('charges separating a post to the organization asking', () => {
    assert.match(
      controller,
      /this\._postsService\.separatePosts\(org\.id, body\.content, body\.len\)/
    );
  });
});
