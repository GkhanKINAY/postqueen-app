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

  it('turns block tags the editor does not know into paragraphs', () => {
    assert.equal(
      sanitizePostContent(
        '<div>Line one</div><section class="x">Line two</section><blockquote>Three</blockquote><h4 id="t">Four</h4><pre>Five</pre><article>Six</article>'
      ),
      '<p dir="auto">Line one</p><p dir="auto">Line two</p><p dir="auto">Three</p><p dir="auto">Four</p><p dir="auto">Five</p><p dir="auto">Six</p>'
    );
    // h1 to h3 are the editor's own headings and stay.
    assert.equal(
      sanitizePostContent('<h2 dir="auto">Title</h2>'),
      '<h2 dir="auto">Title</h2>'
    );
  });

  it('adds no blank lines around blocks nested in a block', () => {
    assert.equal(
      sanitizePostContent('<blockquote><p>quoted</p></blockquote><p>after</p>'),
      '<p>quoted</p><p>after</p>'
    );
    assert.equal(
      sanitizePostContent('<div><p>one</p><p>two</p></div>'),
      '<p>one</p><p>two</p>'
    );
    assert.equal(
      sanitizePostContent('<div><div>a</div></div>'),
      '<p dir="auto">a</p>'
    );
  });

  it('leaves an encoded tag in the text alone', () => {
    assert.equal(
      sanitizePostContent('<p dir="auto">&lt;div&gt;x&lt;/div&gt;</p>'),
      '<p dir="auto">&lt;div&gt;x&lt;/div&gt;</p>'
    );
  });

  it('stays linear on block tags that are never closed', () => {
    // With `[^>]*` the rewrite scanned to the end of the string from every
    // `<div`: about 18 seconds for this input. Now it takes milliseconds.
    for (const input of [
      '<div '.repeat(50_000),
      '<div>' + 'a'.repeat(200_000),
      '<div>a</div '.repeat(20_000),
    ]) {
      const started = Date.now();
      sanitizePostContent(input);
      assert.ok(Date.now() - started < 2_000, `took ${Date.now() - started} ms`);
    }
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
