import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * The reason written on a dropped comment part is duplicated on purpose: a
 * workflow cannot import a runtime value out of the activity module without
 * pulling Nest and Prisma into its bundle, so the two hold the same literal.
 * If they ever drift, the silencing in `changeState` stops matching and every
 * dropped part sends its own notification saying the same thing.
 */
const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('not-commentable reason', () => {
  const workflow = read('./post.workflow.v1.0.11.ts');
  const activity = read('../../activities/post.activity.ts');

  it('is the same literal in the workflow and in changeState', () => {
    const declared = workflow.match(
      /const NOT_COMMENTABLE = '([^']+)';/
    )?.[1];
    assert.ok(declared, 'the workflow declares the reason');
    assert.ok(
      activity.includes(`reason === '${declared}'`),
      `changeState must silence the exact reason the workflow writes (${declared})`
    );
  });

  it('names no provider, so the reason stays generic', () => {
    const declared = workflow.match(
      /const NOT_COMMENTABLE = '([^']+)';/
    )?.[1] as string;
    for (const name of ['tiktok', 'youtube', 'instagram', 'facebook']) {
      assert.ok(
        !declared.toLowerCase().includes(name),
        `the stored reason must not name ${name}`
      );
    }
  });

  it('marks the dropped parts and sends exactly one notice', () => {
    const block = workflow.slice(
      workflow.indexOf('const droppedParts'),
      workflow.indexOf('// list of all the saved results')
    );
    assert.match(block, /for \(const part of droppedParts\)/);
    assert.match(block, /changeState\(part\.id, 'ERROR', NOT_COMMENTABLE/);
    assert.equal(
      (block.match(/inAppNotification\(/g) || []).length,
      1,
      'one notice for the whole set, not one per part'
    );
  });
});
