import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sanitizePostContent } from './sanitize.post.content.ts';

describe('sanitizePostContent', () => {
  it('keeps the dir attribute the editor writes', () => {
    assert.equal(
      sanitizePostContent('<p dir="auto">שלום</p>'),
      '<p dir="auto">שלום</p>'
    );
  });
});
