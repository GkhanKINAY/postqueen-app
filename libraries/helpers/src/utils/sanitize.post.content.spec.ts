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

  it('stays fast and keeps the text on deeply nested markup', () => {
    for (const input of [
      'a<b>'.repeat(5_000),
      'a<span>'.repeat(5_000),
      '<li>x'.repeat(5_000),
    ]) {
      const started = Date.now();
      const out = sanitizePostContent(input);
      assert.ok(Date.now() - started < 1_000, `took ${Date.now() - started} ms`);
      assert.ok(!/<(b|span|li)>/.test(out));
      assert.match(out, /a|x/);
    }
  });

  it('stays fast on a very large post, and cuts what is longer than any post', () => {
    const many = '<p dir="auto">x <strong>y</strong></p>'.repeat(30_000);
    let started = Date.now();
    sanitizePostContent(many);
    assert.ok(Date.now() - started < 1_500, `took ${Date.now() - started} ms`);

    started = Date.now();
    const out = sanitizePostContent('a'.repeat(5_000_000));
    assert.ok(Date.now() - started < 1_500, `took ${Date.now() - started} ms`);
    assert.equal(out.length, 1_000_000);
  });

  it('flattens tags the one-pass count cannot see, and open formatting that multiplies', () => {
    const formatting = ['b', 'i', 'u', 's', 'em', 'strong', 'code', 'small'];
    for (const input of [
      // a `<` inside a quoted attribute hides the tag from the pattern
      '<b title="<">x'.repeat(5_000),
      // formatting left open is re-opened at every paragraph after it
      Array.from({ length: 98 }, (_, i) => `<${formatting[i % 8]} class="c${i}">`).join('') +
        '<p>y</p>'.repeat(9_900),
    ]) {
      const started = Date.now();
      const out = sanitizePostContent(input);
      assert.ok(Date.now() - started < 1_500, `took ${Date.now() - started} ms`);
      assert.match(out, /x|y/);
    }
  });

  it('stays fast on what it removes, keeping the text and the allowed tags', () => {
    for (const [input, kept] of [
      ['<font>x</font>'.repeat(4_000), /x/],
      ['<img>y'.repeat(6_000), /y/],
      ['<!--c-->y'.repeat(6_000), /y/],
      ['<p dir="auto"><em>x</em> <strong>y</strong></p>'.repeat(2_000), /^(<p dir="auto">x <strong>y<\/strong><\/p>)+$/],
      ['<code class="c"/>z'.repeat(5_000), /z/],
    ] as const) {
      const started = Date.now();
      const out = sanitizePostContent(input);
      assert.ok(Date.now() - started < 1_500, `took ${Date.now() - started} ms`);
      assert.match(out, kept);
      assert.doesNotMatch(out, /<(font|em|code|!--)/);
    }
  });

  it('keeps pictures with a web address when it strips', () => {
    const out = sanitizePostContent(
      '<font>x</font>'.repeat(600) + '<img src="https://cdn.example/a.png">'
    );
    assert.match(out, /<img src="https:\/\/cdn\.example\/a\.png">/);
  });

  it('cannot make new tags out of what flattening leaves', () => {
    const out = sanitizePostContent(
      'a<b>'.repeat(200) + '<<b>script>alert(1)<</b>/script>'
    );
    assert.doesNotMatch(out, /<script/i);
    assert.doesNotMatch(out, /<[a-z]/i);
  });

  it('reads tag names and quoted values the way the parser does', () => {
    // `<span.a>` is no <span> and `</span.b>` closes nothing, so these nest.
    // Read as <span>, the nesting went uncounted: 4,000 took 3.5 seconds and
    // threw.
    for (const input of [
      '<span.a>y</span.b>'.repeat(4_000),
      '<u:x>y</u:y>'.repeat(4_000),
    ]) {
      const started = Date.now();
      assert.match(sanitizePostContent(input), /y/);
      assert.ok(Date.now() - started < 1_000, `took ${Date.now() - started} ms`);
    }
    // jsdom writes `<` and `>` inside attribute values as they are; saved
    // content read again must not be flattened to text.
    for (const html of [
      '<p dir="auto">hi <span class="mention" data-mention-id="1" data-mention-label="</dev> Ana">@Ana</span></p>',
      '<img src="https://cdn.example.com/a.png" alt="The <Button> component"><p>x</p>',
    ]) {
      assert.equal(sanitizePostContent(sanitizePostContent(html)), html);
    }
  });

  it('counts pictures by the src the parser reads', () => {
    // A src written inside another attribute is no src: the picture is
    // removed, 9,000 removals took 45 seconds.
    const started = Date.now();
    const out = sanitizePostContent(
      '<img alt=" src=https://e.example/x.png">z'.repeat(9_000)
    );
    assert.ok(Date.now() - started < 1_000, `took ${Date.now() - started} ms`);
    assert.doesNotMatch(out, /<img/);
    assert.match(out, /z/);
  });

  it('strips tables and the other tags that change how the parser reads', () => {
    for (const [input, kept, gone] of [
      // stray content in a table is moved out of it (1.8 seconds)
      ['<table>' + '<p>x</p>'.repeat(9_000), /<p>x<\/p>/, /<table/],
      // a `<!--` inside a <textarea> is text, so the comment is not one
      [
        '<textarea><!--</textarea>' + '<b>'.repeat(5_000) + '-->',
        /^$/,
        /<b>/,
      ],
      // attributes of every <body> go to the one element
      [
        Array.from(
          { length: 450 },
          (_, i) =>
            '<body' +
            Array.from({ length: 30 }, (_, j) => ` b${i}_${j}=1`).join('') +
            '>'
        ).join('') + 'x',
        /x/,
        /<body/,
      ],
      // what DOMPurify drops whole goes with its content
      ['<p>a<script>alert(1)</script>b</p>', /^<p>ab<\/p>$/, /alert/],
    ] as const) {
      const started = Date.now();
      const out = sanitizePostContent(input);
      assert.ok(Date.now() - started < 1_500, `took ${Date.now() - started} ms`);
      assert.match(out, kept);
      assert.doesNotMatch(out, gone);
    }
  });

  it('flattens a tag with more attributes than the editor writes', () => {
    const attributes = Array.from({ length: 100_000 }, (_, i) => ` a${i}=1`);
    const started = Date.now();
    const out = sanitizePostContent(`<p${attributes.join('')}>x</p>`);
    // 102 seconds before: each attribute is checked against those before it
    assert.ok(Date.now() - started < 1_000, `took ${Date.now() - started} ms`);
    assert.doesNotMatch(out, /<p/);
  });

  it('keeps the formatting of a long newsletter', () => {
    const html = Array.from(
      { length: 3_000 },
      (_, i) =>
        `<p dir="auto">Part ${i} <strong>bold</strong> <u>u</u> <a href="https://e.example/${i}">link</a></p>`
    ).join('');
    assert.equal(sanitizePostContent(html), html);
  });

  it('keeps plain text that ends inside what looks like a tag', () => {
    assert.equal(
      sanitizePostContent('Use x <y as a rule'),
      'Use x &lt;y as a rule'
    );
    // `</3` is a bogus comment to the parser, which would drop the rest
    assert.equal(
      sanitizePostContent('I </3 Mondays. Back to work tomorrow.'),
      'I &lt;/3 Mondays. Back to work tomorrow.'
    );
  });

  it('counts nesting a closing tag cannot end, as the parser does', () => {
    // </span> does not close past a <ul>, and </b> past one moves the
    // formatting instead: the lists stay open. Popped anyway, 100 of these
    // hid a tree 3,000 levels deep that threw after a second.
    for (const open of ['<span>', '<b>', '<li>']) {
      const input =
        (open + '<ul>'.repeat(30) + open.replace('<', '</')).repeat(100) + 'x';
      const started = Date.now();
      assert.match(sanitizePostContent(input), /x/);
      assert.ok(Date.now() - started < 1_000, `took ${Date.now() - started} ms`);
    }
  });

  it('drops what DOMPurify drops with its content when it strips', () => {
    const many = '<font>f</font>'.repeat(600);
    assert.match(
      sanitizePostContent('<p>a <audio>aud</audio> b</p>' + many),
      /^<p>a {2}b<\/p>f/
    );
    // <plaintext> never closes
    assert.equal(
      sanitizePostContent('<p>a<plaintext>b</plaintext>c</p>'),
      '<p>a</p>'
    );
  });

  it('keeps the markup the editor writes', () => {
    const html =
      '<p dir="auto">Hi <strong>you</strong></p><ul><li><p dir="auto">one</p></li></ul>';
    assert.equal(sanitizePostContent(html), html);
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
