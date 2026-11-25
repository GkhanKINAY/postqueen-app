import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseFragment } from 'parse5';
import { hasHtmlTag, stripHtmlValidation } from './strip.html.validation.ts';
import { countLength } from './count.length.ts';
import { sanitizePostContent } from './sanitize.post.content.ts';

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

});

// What the composer stores for text someone typed is encoded, and the html
// path is published as HTML, so it has to stay encoded: text stays text.
describe('stripHtmlValidation html text', () => {
  const html = (value: string) => stripHtmlValidation('html', value);

  it('publishes a typed <script> as text, not a tag', () => {
    const out = html('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    assert.equal(out, '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    assert.deepEqual(
      elements(out).map((e) => e.tag),
      ['p']
    );
  });

  it('keeps an ampersand encoded, once', () => {
    assert.equal(
      html('<p>Tom &amp; Jerry &quot;live&quot;</p>'),
      '<p>Tom &amp; Jerry "live"</p>'
    );
  });

  it('keeps typed angle brackets encoded', () => {
    assert.equal(html('<p>a &lt; b &gt; c</p>'), '<p>a &lt; b &gt; c</p>');
  });

  it('does not decode or encode a typed entity twice', () => {
    assert.equal(
      html('<p>&amp;lt; &amp;amp; &amp;nbsp; &amp;quot;</p>'),
      '<p>&amp;lt; &amp;amp; &amp;nbsp; &amp;quot;</p>'
    );
    assert.doesNotMatch(html('<p>Tom &amp; Jerry</p>'), /&amp;amp;/);
  });

  it('turns &nbsp; into a space', () => {
    assert.equal(html('<p>a&nbsp;b</p>'), '<p>a b</p>');
  });

  it('keeps links and formatting', () => {
    assert.equal(
      html(
        '<p dir="auto">Read <a href="https://example.com/?a=1&amp;b=2">this &amp; that</a> <strong>now</strong></p>'
      ),
      '<p dir="auto">Read <a href="https://example.com/?a=1&amp;b=2">this &amp; that</a> <strong>now</strong></p>'
    );
  });

  it('keeps pictures', () => {
    assert.equal(
      inlineHtml(
        '<p>a &amp; b</p><img src="https://cdn.example.com/a.png" alt="Tom &amp; Jerry">'
      ),
      '<p>a &amp; b</p><img src="https://cdn.example.com/a.png" alt="Tom &amp; Jerry">'
    );
  });
});

// Shift+Enter in the editor writes a <br> inside the paragraph: a line break
// that is not a new paragraph.
describe('stripHtmlValidation soft line breaks', () => {
  const soft = '<p dir="auto">one<br>two</p><p dir="auto">three</p>';

  it('is a newline in plain text, with or without unicode bold', () => {
    assert.equal(stripHtmlValidation('normal', soft), 'one\ntwo\nthree');
    assert.equal(stripHtmlValidation('normal', soft, true), 'one\ntwo\nthree');
    assert.equal(
      stripHtmlValidation('normal', soft, false, true),
      'one\ntwo\nthree'
    );
    assert.equal(stripHtmlValidation('none', '<p>one<br>two</p>'), 'one\ntwo');
  });

  it('is a newline in markdown', () => {
    assert.equal(stripHtmlValidation('markdown', soft), 'one\ntwo\nthree\n');
  });

  it('stays a <br> for a channel that takes HTML', () => {
    assert.equal(stripHtmlValidation('html', soft), soft);
    assert.equal(
      stripHtmlValidation('html', '<p>one<br/>two<br />three</p>'),
      '<p>one<br>two<br>three</p>'
    );
  });

  it('reads every spelling of the tag, one newline each', () => {
    for (const spelling of ['<br>', '<br/>', '<br />', '<BR>', '<br class="x">']) {
      assert.equal(
        stripHtmlValidation('normal', `<p>one${spelling}two</p>`, true),
        'one\ntwo'
      );
    }
    assert.equal(
      stripHtmlValidation('normal', '<p>one<br><br><br>two</p>', true),
      'one\n\n\ntwo'
    );
  });

  it('is a space inside a list item, whose lines are joined', () => {
    const list = '<ul><li><p dir="auto">one<br>two</p></li></ul>';
    assert.equal(stripHtmlValidation('normal', list, true), '\n- one two\n');
    assert.equal(stripHtmlValidation('markdown', list), '- one two\n');
    assert.equal(stripHtmlValidation('none', list), 'one two');
    // in an item that holds a nested list too
    assert.match(
      stripHtmlValidation(
        'normal',
        '<ul><li><p>a<br>b</p><ul><li><p>c</p></li></ul></li></ul>',
        true
      ),
      /- a b/
    );
  });

  it('keeps bold and underline that span it', () => {
    assert.equal(
      stripHtmlValidation(
        'normal',
        '<p><strong>ab<br>cd</strong> <u>ef<br>gh</u></p>',
        true
      ),
      '𝗮𝗯\n𝗰𝗱 e̲f̲\ng̲h̲'
    );
    assert.equal(
      stripHtmlValidation('markdown', '<p><strong>ab<br>cd</strong></p>'),
      '**ab\ncd**\n'
    );
  });

  it('leaves a "<br>" inside an attribute value alone', () => {
    assert.equal(
      stripHtmlValidation(
        'normal',
        '<p>hi <span class="mention" data-mention-id="1" data-mention-label="<br>">@Ana</span></p>',
        true
      ),
      'hi @Ana'
    );
  });

  it('reads HTML with a break and no paragraph as HTML', () => {
    // API content; its entities were returned encoded before.
    assert.equal(
      stripHtmlValidation('normal', 'one<br>two &amp; three', true),
      'one\ntwo & three'
    );
    assert.equal(stripHtmlValidation('normal', 'Just text'), 'Just text');
  });

  it('counts as one character', () => {
    const text = stripHtmlValidation('normal', '<p>ab<br>cd</p>', true);
    assert.equal(countLength('linkedin', text), 5);
    assert.equal(countLength('x', text), 5);
    assert.equal(countLength('threads', text), 5);
  });

  // Stored content went through sanitizePostContent, and the public preview
  // reads it with the 'none' type on every view.
  it('stays fast on list items and breaks in any shape a post can hold', () => {
    for (const input of [
      '<li>a<br>'.repeat(25_000),
      '<p class="<li">x<br></p>'.repeat(10_000),
      '<li class="<li<li<li">a<br>'.repeat(10_000),
      '<li' + ' a'.repeat(150_000),
      '<p>' + 'a<br>'.repeat(19_000) + '</p>',
      '<ul>' + '<li><p>a<br>b</p></li>'.repeat(6_000) + '</ul>',
    ]) {
      const stored = sanitizePostContent(input);
      for (const type of ['none', 'normal', 'markdown', 'html'] as const) {
        const started = Date.now();
        stripHtmlValidation(type, stored, true);
        assert.ok(
          Date.now() - started < 1_500,
          `${type} took ${Date.now() - started} ms`
        );
      }
    }
  });
});

describe('hasHtmlTag', () => {
  // The pattern it replaces, kept to compare against.
  const before = (text: string) => /<\/?[a-z][\s\S]*>/i.test(text);

  it('answers what the pattern it replaces answered', () => {
    for (const text of [
      '',
      'plain text',
      'a > b',
      'a < b',
      '<p>x</p>',
      '<P DIR="auto">x</P>',
      'x </b',
      'x </b>',
      '<3 and >',
      '</a',
      'a <b',
      '< b>',
      '</>',
      '<1>',
      'x<a\n\ny>',
      '> <a',
      '<a<a>',
      '<<a>',
      '<//a>',
      'Tom &amp; Jerry',
      '&lt;p&gt;',
    ]) {
      assert.equal(hasHtmlTag(text), before(text), JSON.stringify(text));
    }
  });

  it('stays linear on a long run of tag openers with no end', () => {
    const started = Date.now();
    assert.equal(hasHtmlTag('<a'.repeat(500_000)), false);
    assert.equal(hasHtmlTag('</a'.repeat(300_000) + '>'), true);
    assert.ok(Date.now() - started < 1_000, `took ${Date.now() - started} ms`);
  });
});
