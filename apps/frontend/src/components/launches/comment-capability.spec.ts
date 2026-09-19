import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const dir = (rel: string) =>
  readdirSync(fileURLToPath(new URL(rel, import.meta.url)));

const controller = read(
  '../../../../backend/src/api/routes/integrations.controller.ts'
);
const context = read('./calendar.context.tsx');
const hoc = read('../new-launch/providers/high.order.provider.tsx');
const information = read('./information.component.tsx');

describe('comment capability has one source', () => {
  it('is derived from the provider and shipped on /integrations/list', () => {
    assert.match(controller, /canComment: !!findIntegration\?\.comment,/);
    assert.match(context, /canComment\?: boolean;/);
  });

  it('is the same signal the post workflow acts on', () => {
    const activity = read(
      '../../../../orchestrator/src/activities/post.activity.ts'
    );
    // `isCommentable` answers `!!getIntegration.comment`. If these two ever
    // disagree, the composer offers a part the workflow then drops.
    assert.match(activity, /return !!getIntegration\.comment;/);
  });

  it('overrides the per-provider declaration for the boolean case', () => {
    assert.match(
      hoc,
      /selectedIntegration\?\.integration\?\.canComment === false/
    );
    // `'no-media'` is a restriction on media inside a comment and has no
    // server counterpart, so it must keep coming from the provider.
    assert.match(hoc, /params\.comments/);
  });

  it('re-runs when the selected integration changes, not only the tab', () => {
    assert.match(hoc, /selectedIntegration\?\.integration\?\.canComment,/);
  });
});

describe('the composer says which channels will drop a comment', () => {
  it('warns in the existing panel, keyed off the comment variant', () => {
    assert.match(information, /variant !== 'comment'/);
    assert.match(
      information,
      /\.filter\(\(p\) => p\.integration\.canComment === false\)/
    );
    assert.match(information, /comments_cannot_be_published_on/);
  });

  it('paints the pill invalid, exactly as stripLinks does', () => {
    assert.match(
      information,
      /if \(showStripLinkWarning \|\| showCannotCommentWarning\)/
    );
  });

  it('warns rather than blocks', () => {
    // Nothing here may disable the editor or drop the part: the same comment
    // is going to the channels that can take it.
    const block = information.slice(
      information.indexOf('const cannotCommentNames'),
      information.indexOf('const isInternal')
    );
    assert.doesNotMatch(block, /disabled|readOnly|splice|slice\(1\)/);
  });
});

describe('the drift this closes', () => {
  // Measured, not assumed: these six implement no `comment()` server-side and
  // never declared `comments: false` in their composer component, so the
  // composer offered extra parts that the workflow silently dropped — in the
  // per-channel tab, not only in global mode.
  const DRIFTED = [
    ['dev.to.provider.ts', 'devto/devto.provider.tsx'],
    ['dribbble.provider.ts', 'dribbble/dribbble.provider.tsx'],
    ['gmb.provider.ts', 'gmb/gmb.provider.tsx'],
    ['hashnode.provider.ts', 'hashnode/hashnode.provider.tsx'],
    ['listmonk.provider.ts', 'listmonk/listmonk.provider.tsx'],
    ['wordpress.provider.ts', 'wordpress/wordpress.provider.tsx'],
  ] as const;

  for (const [server, client] of DRIFTED) {
    it(`${server} still has no comment(), and is now covered anyway`, () => {
      const provider = read(
        `../../../../../libraries/nestjs-libraries/src/integrations/social/${server}`
      );
      assert.doesNotMatch(provider, /^\s*(override )?async comment\(/m);

      // Left declaring nothing on purpose: the server flag covers them, so
      // six files did not need touching. If someone later adds
      // `comments: false` here it is harmless, but it is no longer required —
      // which is the point of having one source.
      const component = read(`../new-launch/providers/${client}`);
      assert.doesNotMatch(component, /comments: true/);
    });
  }

  it('leaves the providers that do implement comment() alone', () => {
    const socialDir = dir(
      '../../../../../libraries/nestjs-libraries/src/integrations/social'
    );
    const withComment = socialDir
      .filter((f) => f.endsWith('.provider.ts'))
      .filter((f) => {
        const body = read(
          `../../../../../libraries/nestjs-libraries/src/integrations/social/${f}`
        );
        return /^\s*(override )?async comment\(/m.test(body);
      });

    // A sanity floor rather than an exact count, so adding a provider does not
    // fail this: the point is that the majority do implement it and none of
    // them is affected by the flag.
    assert.ok(
      withComment.length >= 15,
      `expected most providers to implement comment(), found ${withComment.length}`
    );
  });
});
