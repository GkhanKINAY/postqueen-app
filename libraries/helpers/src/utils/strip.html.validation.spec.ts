import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseFragment } from 'parse5';
import { stripHtmlValidation } from './strip.html.validation.ts';

// Every element of a fragment with its attribute names, as a browser would
// read the HTML a channel publishes.
const elements = (html: string) => {
  const out: { tag: string; attrs: string[] }[] = [];
  const walk = (nodes: any[]) => {
    for (const node of nodes) {
      if (node.tagName) {
        out.push({
          tag: node.tagName,
          attrs: (node.attrs || []).map((a: any) => a.name),
        });
      }
      walk(node.childNodes || []);
    }
  };
  walk((parseFragment(html) as any).childNodes);
  return out;
};

const inlineHtml = (value: string) =>
  stripHtmlValidation('html', value, true, false, false, undefined, true);

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

describe('stripHtmlValidation html with inline images', () => {
  const body =
    '<p dir="auto">Intro</p><img src="https://cdn.example.com/a.png" alt="A" class="x" onerror="alert(1)"><p dir="auto">End</p>';

  it('drops pictures for a channel that takes attachments only', () => {
    assert.doesNotMatch(stripHtmlValidation('html', body), /<img/);
  });

  it('keeps only the src and alt of a picture for a channel that takes them inline', () => {
    const html = stripHtmlValidation('html', body, true, false, false, undefined, true);
    assert.match(html, /<img src="https:\/\/cdn\.example\.com\/a\.png" alt="A">/);
    assert.doesNotMatch(html, /onerror|class=/);
  });

  it('drops a picture that does not point to an http(s) file', () => {
    const html = stripHtmlValidation(
      'html',
      '<p>a</p><img src="data:image/png;base64,AAAA"><img src="/uploads/b.png">',
      true,
      false,
      false,
      undefined,
      true
    );
    assert.doesNotMatch(html, /<img/);
  });

  it('drops a picture from outside where uploads are allowed', () => {
    const before = process.env.RESTRICT_UPLOAD_DOMAINS;
    process.env.RESTRICT_UPLOAD_DOMAINS = 'uploads.example.com';
    try {
      const html = stripHtmlValidation(
        'html',
        '<img src="https://uploads.example.com/a.png"><img src="https://elsewhere.test/b.png">',
        true,
        false,
        false,
        undefined,
        true
      );
      assert.match(html, /uploads\.example\.com\/a\.png/);
      assert.doesNotMatch(html, /elsewhere\.test/);
    } finally {
      if (before === undefined) {
        delete process.env.RESTRICT_UPLOAD_DOMAINS;
      } else {
        process.env.RESTRICT_UPLOAD_DOMAINS = before;
      }
    }
  });

  for (const [name, payload] of [
    [
      'an encoded quote',
      '<img src="https://cdn.example.com/a.png" alt="&amp;quot; onerror=&amp;quot;alert(1)">',
    ],
    [
      'a double-encoded quote',
      '<img src="https://cdn.example.com/a.png" alt="&amp;amp;quot; onerror=&amp;amp;quot;alert(1)">',
    ],
    [
      'an encoded quote in the src',
      '<img src="https://cdn.example.com/a.png?&amp;quot; onerror=&amp;quot;alert(1)">',
    ],
  ]) {
    it(`cannot be given an attribute through ${name}`, () => {
      for (const element of elements(inlineHtml(payload))) {
        assert.deepEqual(
          element.attrs.filter((a) => !['src', 'alt'].includes(a)),
          [],
          `${element.tag} gained an attribute`
        );
      }
    });
  }

  it('keeps a query string in a picture src', () => {
    assert.match(
      inlineHtml('<img src="https://cdn.example.com/a.png?w=1&amp;h=2">'),
      /<img src="https:\/\/cdn\.example\.com\/a\.png\?w=1&amp;h=2">/
    );
  });
});

describe('stripHtmlValidation html links', () => {
  it('cannot be given an attribute through an encoded quote in the href', () => {
    for (const payload of [
      '<p><a href="https://example.com/&amp;quot; onclick=&amp;quot;alert(1)">x</a></p>',
      '<p><a href="https://example.com/&amp;amp;quot; onclick=&amp;amp;quot;alert(1)">x</a></p>',
    ]) {
      const html = stripHtmlValidation('html', payload);
      for (const element of elements(html)) {
        assert.ok(!element.attrs.includes('onclick'), html);
      }
    }
  });

  it('still decodes entities in the text', () => {
    assert.equal(
      stripHtmlValidation('html', '<p>Tom &amp; Jerry &quot;live&quot;</p>'),
      '<p>Tom & Jerry "live"</p>'
    );
  });
});

