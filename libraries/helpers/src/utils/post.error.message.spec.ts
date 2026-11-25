import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isUnconfirmedPostError,
  UNCONFIRMED_POST_ERRORS,
  unconfirmedPostError,
} from './post.error.message.ts';

// A post that was sent but never confirmed may be live already. The composer
// asks its person to look before posting it again, and nothing else does.
describe('isUnconfirmedPostError', () => {
  it('knows every error the post workflows store for one', () => {
    assert.deepEqual(UNCONFIRMED_POST_ERRORS, [
      'Could not confirm the post status',
      'Could not publish after several attempts',
      'A previous publish attempt was interrupted',
    ]);
    for (const stored of UNCONFIRMED_POST_ERRORS) {
      assert.equal(isUnconfirmedPostError(stored), true, stored);
      assert.equal(isUnconfirmedPostError(`  ${stored} `), true, stored);
    }
  });

  it('knows the notice they are read as, for a post and a comment', () => {
    const post = unconfirmedPostError('post', 'Instagram', 'Bakery');
    assert.equal(
      post,
      "Your post was sent to Instagram, but we couldn't confirm it was published. Please check your Bakery account before posting again to avoid duplicates."
    );
    assert.equal(isUnconfirmedPostError(post), true);
    assert.equal(
      isUnconfirmedPostError(unconfirmedPostError('comment', 'X', 'Acme')),
      true
    );
  });

  it('leaves every other failure, and no error at all, alone', () => {
    for (const error of [
      'Refresh channel needed',
      'Channel disabled',
      'Subscription required',
      'The network refused the post.',
      'Could not confirm',
      '',
      null,
      undefined,
      { message: 'Could not confirm the post status' },
      '{"message":"Could not confirm the post status"}',
    ]) {
      assert.equal(isUnconfirmedPostError(error), false, String(error));
    }
  });
});
