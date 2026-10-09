import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  sanitizePostContent,
  sanitizePreviewHtml,
} from './sanitize.post.content.ts';

describe('sanitizePostContent', () => {
  it('keeps the dir attribute the editor writes', () => {
    assert.equal(
      sanitizePostContent('<p dir="auto">שלום</p>'),
      '<p dir="auto">שלום</p>'
    );
  });

  it('keeps a picture that points to an http(s) file', () => {
    assert.equal(
      sanitizePostContent('<img src="https://cdn.example.com/a.png" alt="A">'),
      '<img src="https://cdn.example.com/a.png" alt="A">'
    );
  });

  it('drops a picture with a data: or relative src', () => {
    assert.equal(
      sanitizePostContent(
        '<p>a</p><img src="data:image/png;base64,AAAA"><img src="/b.png">'
      ),
      '<p>a</p>'
    );
  });

  it('does not leave its picture rule on the shared instance', () => {
    sanitizePostContent('<img src="data:image/png;base64,AAAA">');
    // DOMPurify's defaults keep a data: picture; the post rule must not leak
    // into the preview sanitizer.
    assert.match(
      sanitizePreviewHtml('<img src="data:image/png;base64,AAAA">'),
      /<img src="data:image\/png;base64,AAAA">/
    );
  });
});
