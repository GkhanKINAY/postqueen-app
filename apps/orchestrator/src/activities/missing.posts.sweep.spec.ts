import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PostActivity } from './post.activity.ts';

/**
 * The missing-post sweep loads the overdue QUEUE posts once and then starts
 * a workflow for each. A post its own workflow publishes (or someone deletes)
 * while the loop runs must be skipped, or the new run marks a published post
 * as an error.
 */
describe('missing-post sweep', () => {
  it('starts post workflow v1.0.12 only for posts still in the queue', async () => {
    const started: string[] = [];
    const states: Record<string, { state: string } | null> = {
      queued: { state: 'QUEUE' },
      published: { state: 'PUBLISHED' },
      deleted: null,
    };
    const post = (id: string) => ({
      id,
      organizationId: 'org-1',
      integration: { providerIdentifier: 'linkedin-page' },
    });
    const activity = Object.create(PostActivity.prototype);
    Object.assign(activity, {
      _postService: {
        searchForMissingThreeHoursPosts: async () => [
          post('published'),
          post('queued'),
          post('deleted'),
        ],
        getPostState: async (id: string) => states[id],
      },
      _temporalService: {
        client: {
          getRawClient: () => ({
            workflow: {
              signalWithStart: async (name: string, options: any) => {
                started.push(`${name}:${options.workflowId}`);
              },
            },
          }),
        },
      },
    });

    await activity.searchForMissingThreeHoursPosts();

    assert.deepEqual(started, ['postWorkflowV1012:post_queued']);
  });
});
