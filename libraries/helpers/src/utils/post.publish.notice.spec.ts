import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  PQ_NOTIFY_SETTING,
  postWantsPublishNotice,
  publishNoticeReleaseUrl,
} from './post.publish.notice.ts';

describe('post publish notice', () => {
  it('notifies by default, and only skips when pq_notify is false', () => {
    assert.equal(postWantsPublishNotice(undefined), true);
    assert.equal(postWantsPublishNotice('{}'), true);
    assert.equal(postWantsPublishNotice({ [PQ_NOTIFY_SETTING]: true }), true);
    assert.equal(postWantsPublishNotice({ [PQ_NOTIFY_SETTING]: false }), false);
    assert.equal(
      postWantsPublishNotice(JSON.stringify({ [PQ_NOTIFY_SETTING]: false })),
      false
    );
    assert.equal(postWantsPublishNotice('not-json'), true);
  });

  it('pulls the release URL off the frozen workflow success message', () => {
    assert.equal(
      publishNoticeReleaseUrl(
        'Your post has been published on Instagram at https://www.instagram.com/p/abc/'
      ),
      'https://www.instagram.com/p/abc/'
    );
    assert.equal(
      publishNoticeReleaseUrl('Your post has been published on X at '),
      undefined
    );
  });

  it('skips the frozen success digest from the activity, not the workflow', () => {
    const activity = readFileSync(
      fileURLToPath(
        new URL(
          '../../../../apps/orchestrator/src/activities/post.activity.ts',
          import.meta.url
        )
      ),
      'utf8'
    );
    assert.match(activity, /shouldSkipPublishNotice/);
    assert.match(activity, /publishNoticeReleaseUrl/);
    assert.doesNotMatch(
      readFileSync(
        fileURLToPath(
          new URL(
            '../../../../apps/orchestrator/src/workflows/post-workflows/post.workflow.v1.0.9.ts',
            import.meta.url
          )
        ),
        'utf8'
      ),
      /pq_notify|shouldSkipPublishNotice/
    );
  });
});
