import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { stripHtmlValidation } from './strip.html.validation.ts';

// The editor writes paragraphs and headings as <p dir="auto"> and
// <h1 dir="auto"> so right-to-left text lines up on its own. Every output
// type has to read them the same as the bare tags older posts carry.
describe('stripHtmlValidation with dir="auto"', () => {
  const bare = '<p>Hello</p><p>World</p>';
  const auto = '<p dir="auto">Hello</p><p dir="auto">World</p>';

  it('splits paragraphs into lines for the plain text types', () => {
    assert.equal(stripHtmlValidation('normal', auto), 'Hello\nWorld');
    assert.equal(
      stripHtmlValidation('normal', auto),
      stripHtmlValidation('normal', bare)
    );
    assert.equal(stripHtmlValidation('normal', auto, true), 'Hello\nWorld');
    assert.equal(stripHtmlValidation('normal', auto, false, true), 'Hello\nWorld');
  });

  it('converts headings and paragraphs to markdown', () => {
    assert.equal(
      stripHtmlValidation(
        'markdown',
        '<h1 dir="auto">Title</h1><h2 dir="auto">Sub</h2><p dir="auto">Body</p>'
      ),
      stripHtmlValidation('markdown', '<h1>Title</h1><h2>Sub</h2><p>Body</p>')
    );
    assert.equal(
      stripHtmlValidation('markdown', '<h3 dir="auto">Small</h3>'),
      '### Small\n'
    );
  });

  it('still treats text without a paragraph tag as plain text', () => {
    assert.equal(stripHtmlValidation('normal', 'Just text'), 'Just text');
  });
});
