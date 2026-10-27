import DOMPurify from 'isomorphic-dompurify';
import { parseFragment } from 'parse5';

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'u',
  'a',
  'ul',
  'li',
  'h1',
  'h2',
  'h3',
  'span',
  'img',
];

const ALLOWED_ATTR = [
  'dir',
  'href',
  'target',
  'rel',
  'class',
  'data-mention-id',
  'data-mention-label',
  'src',
  'alt',
];

// <img> keeps data: URIs whatever ALLOWED_URI_REGEXP says, and a relative src
// passes it, so a picture that doesn't point to a real file is dropped.
// DOMPurify is one shared instance, so the hook is added for this call only:
// sanitizePreviewHtml and every other caller must not inherit it.
const dropImageWithoutUrl = (node: Node, data: { tagName: string }) => {
  if (
    data.tagName === 'img' &&
    !/^https?:\/\//i.test((node as Element).getAttribute('src') || '')
  ) {
    node.parentNode?.removeChild(node);
  }
};

// Tags that never take a closing tag, so they never nest. In HTML a `/>` on
// any other tag is ignored: `<code/>` opens a `<code>` like `<code>` does.
const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);
// Tags that change how the parser reads or places what follows them: raw text
// (a `<!--` inside <style> is text, outside it a comment), foreign content,
// tables (the parser moves stray content out of them, at a cost that grows
// with the square of it) and <html>/<body>, whose attributes every repeat adds
// to the one element. None is allowed and the pass below does not model them,
// so markup holding any is stripped first, and passed on only once a second
// look finds none.
const RESHAPING_TAGS = new Set([
  'script',
  'style',
  'title',
  'textarea',
  'xmp',
  'iframe',
  'noembed',
  'noframes',
  'noscript',
  'plaintext',
  'svg',
  'math',
  'template',
  'select',
  'table',
  'caption',
  'colgroup',
  'col',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'html',
  'head',
  'body',
  'frameset',
  'frame',
]);
// The tags DOMPurify drops with everything inside (FORBID_CONTENTS).
// Stripping drops them the same way: up to their first closing tag, or to the
// end for <plaintext>, which never closes.
const DROPPED_WITH_CONTENT = new Set([
  'script',
  'style',
  'title',
  'xmp',
  'iframe',
  'noembed',
  'noframes',
  'noscript',
  'plaintext',
  'svg',
  'math',
  'template',
  'head',
  'thead',
  'colgroup',
  'audio',
  'video',
]);
// A closing tag that is not for the innermost element closes it only in some
// cases (https://html.spec.whatwg.org/multipage/parsing.html#parsing-main-inbody).
// These pop everything above their element unless one of SCOPE_LIMITS is in
// between (and <button> for </p>, <ul> or <ol> for </li>); </h1> to </h6>
// close the nearest heading of any level.
const CLOSED_IN_SCOPE = new Set([
  'address',
  'applet',
  'article',
  'aside',
  'blockquote',
  'button',
  'center',
  'dd',
  'details',
  'dialog',
  'dir',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'header',
  'hgroup',
  'li',
  'listing',
  'main',
  'marquee',
  'menu',
  'nav',
  'object',
  'ol',
  'p',
  'pre',
  'search',
  'section',
  'summary',
  'ul',
]);
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
// The others that end the scope are among RESHAPING_TAGS, stripped first.
const SCOPE_LIMITS = new Set(['applet', 'marquee', 'object']);
// Any other closing tag (formatting, <span>, unknown names) pops up to its
// element only when no element of this "special" category is in between;
// otherwise the parser ignores it, or moves the formatting around, and the
// nesting above stays.
const SPECIAL = new Set([
  ...CLOSED_IN_SCOPE,
  ...HEADINGS,
  ...RESHAPING_TAGS,
  'form',
]);
// The editor's output nests a handful of levels (a list item, a mention inside
// bold inside a paragraph), always closes what it opens and holds only allowed
// tags. jsdom and DOMPurify take time that grows with the square of shapes the
// editor never writes:
// - deep nesting (`a<b>` 2,000 times took two seconds, 5,000 overflowed the
//   stack);
// - close tags that do not end the innermost element, whose misnesting repair
//   is redone for every one (`<b><i></b></i>` 5,000 times took six seconds);
// - formatting left open, which the parser re-opens at every block after it;
// - nodes DOMPurify removes (tags it does not allow, comments, pictures with
//   no URL): each removal costs as much as the nodes beside it (4,000 took
//   three seconds);
// - attributes, each checked against the ones before it on its tag (40,000
//   on one tag took ten seconds);
// - the RESHAPING_TAGS above.
// The public preview sanitizes stored content on every view, so that cost
// could be paid again by anyone opening the link.
const MAX_NESTING = 100;
const MAX_MISNESTED = 100;
// Balanced markup is parsed in linear time, but at about a second per 40,000
// elements; no post comes near this many (a 3,000-paragraph newsletter with
// bold, underline and a link in each has 12,000).
const MAX_TAGS = 20_000;
// Summing the open depth over all tags bounds the re-opened formatting.
const MAX_OPEN_WORK = 200_000;
// Removals cost about 0.2 s per thousand at this size.
const MAX_REMOVED = 500;
// The editor writes at most a handful on a tag.
const MAX_ATTRIBUTES = 32;
// What a post's content may be at most, in characters, before it is parsed.
// The longest a network takes is ListMonk's newsletter body, and a real one is
// a fraction of this.
export const MAX_POST_CONTENT_LENGTH = 1_000_000;

const ALLOWED = new Set(ALLOWED_TAGS);

type Token = {
  start: number;
  // After its `>`, or -1 when the input ends inside the tag (the parser then
  // drops it) or the tag has more than MAX_ATTRIBUTES.
  end: number;
  comment: boolean;
  closing: boolean;
  // A comment's is #comment, #bogus or #doctype.
  name: string;
  attributes: number;
  // The first src, the one the parser keeps.
  src: string | null;
};

const isSpace = (char: string | undefined) =>
  char === ' ' ||
  char === '\n' ||
  char === '\t' ||
  char === '\f' ||
  char === '\r';
const isLetter = (char: string | undefined) =>
  !!char && ((char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z'));
const endsName = (char: string) =>
  isSpace(char) || char === '/' || char === '>';

// A tag (or closing tag) at `start`, read the way the HTML tokenizer reads it
// (https://html.spec.whatwg.org/multipage/parsing.html#tag-open-state): its
// name runs to whitespace, `/` or `>`, so `<a.b>` is not an <a>, and a quoted
// value can hold `<` and `>`, as jsdom writes them back.
const readTag = (html: string, start: number, closing: boolean): Token => {
  const length = html.length;
  let at = start + (closing ? 2 : 1);
  const nameStart = at;
  while (at < length && !endsName(html[at])) {
    at++;
  }
  const token: Token = {
    start,
    end: -1,
    comment: false,
    closing,
    name: html.slice(nameStart, at).toLowerCase(),
    attributes: 0,
    src: null,
  };
  while (at < length) {
    const char = html[at];
    if (isSpace(char) || char === '/') {
      at++;
      continue;
    }
    if (char === '>') {
      token.end = at + 1;
      return token;
    }
    // An attribute's name runs to whitespace, `/`, `>` or `=`, and keeps a
    // `=` it starts with.
    const nameAt = at++;
    while (at < length && !endsName(html[at]) && html[at] !== '=') {
      at++;
    }
    const name = html.slice(nameAt, at).toLowerCase();
    if (++token.attributes > MAX_ATTRIBUTES) {
      return token;
    }
    while (at < length && isSpace(html[at])) {
      at++;
    }
    let value = '';
    if (html[at] === '=') {
      at++;
      while (at < length && isSpace(html[at])) {
        at++;
      }
      const quote = html[at];
      if (quote === '"' || quote === "'") {
        const close = html.indexOf(quote, at + 1);
        if (close === -1) {
          return token;
        }
        value = html.slice(at + 1, close);
        at = close + 1;
      } else {
        const valueAt = at;
        while (at < length && !isSpace(html[at]) && html[at] !== '>') {
          at++;
        }
        value = html.slice(valueAt, at);
      }
    }
    if (name === 'src' && token.src === null) {
      token.src = value;
    }
  }
  return token;
};

// Every tag and comment of the markup in order, in one pass. `visit` can
// answer where to go on from (to skip what it drops), or false to stop.
const scanMarkup = (
  html: string,
  visit: (token: Token) => number | false | void
) => {
  const length = html.length;
  // The next `-->` and `--!>`, found once and reused, so that many comments
  // do not each search to the end.
  let dashEnd = -2;
  let bangEnd = -2;
  let at = 0;
  while (at < length) {
    const open = html.indexOf('<', at);
    if (open === -1) {
      return;
    }
    const next = html[open + 1];
    let token: Token;
    if (isLetter(next) || (next === '/' && isLetter(html[open + 2]))) {
      token = readTag(html, open, next === '/');
    } else if (next === '!' || next === '?' || next === '/') {
      if (next === '/' && (html[open + 2] === '>' || open + 2 >= length)) {
        // `</>` is dropped, and a `</` that ends the input is text
        at = open + 3;
        continue;
      }
      let end: number;
      // A doctype is dropped with no node; any other `<!`, `<?` or `</` that
      // is no tag is a bogus comment.
      let name = /^<!doctype/i.test(html.slice(open, open + 9))
        ? '#doctype'
        : '#bogus';
      if (next === '!' && html.startsWith('--', open + 2)) {
        name = '#comment';
        // `<!-->` and `<!--->` end there, any other comment at `-->` or `--!>`
        const body = open + 4;
        if (html[body] === '>') {
          end = body + 1;
        } else if (html.startsWith('->', body)) {
          end = body + 2;
        } else {
          if (dashEnd !== -1 && dashEnd < body) {
            dashEnd = html.indexOf('-->', body);
          }
          if (bangEnd !== -1 && bangEnd < body) {
            bangEnd = html.indexOf('--!>', body);
          }
          end = Math.min(
            dashEnd === -1 ? length : dashEnd + 3,
            bangEnd === -1 ? length : bangEnd + 4
          );
        }
      } else {
        // Any other `<!`, `<?` or `</`: a doctype or a bogus comment, to `>`
        const close = html.indexOf('>', open + 2);
        end = close === -1 ? length : close + 1;
      }
      token = {
        start: open,
        end,
        comment: true,
        closing: false,
        name,
        attributes: 0,
        src: null,
      };
    } else {
      at = open + 1;
      continue;
    }
    const resume = visit(token);
    if (resume === false || token.end === -1) {
      return;
    }
    at = typeof resume === 'number' ? resume : token.end;
  }
};

// A tag DOMPurify keeps: an allowed one, and a picture only with a web
// address (dropImageWithoutUrl).
const keeps = (token: Token) =>
  ALLOWED.has(token.name) &&
  (token.name !== 'img' || /^https?:\/\//i.test(token.src || ''));

// How the markup must be handled, read in one pass: as it is, with what
// DOMPurify would remove stripped first, or flattened to text. The stack never
// grows past MAX_NESTING, so each tag costs at most that much.
const markupShape = (html: string): 'ok' | 'strip' | 'flatten' => {
  const open: string[] = [];
  let removed = 0;
  let misnested = 0;
  let elements = 0;
  let work = 0;
  let shape = 'ok' as 'ok' | 'strip' | 'flatten';
  scanMarkup(html, (token) => {
    if (token.comment) {
      removed++;
      return;
    }
    const { name, closing } = token;
    if (
      token.attributes > MAX_ATTRIBUTES ||
      (work += open.length) > MAX_OPEN_WORK ||
      // `</br>` makes a <br> too
      ((!closing || name === 'br') && ++elements > MAX_TAGS)
    ) {
      shape = 'flatten';
      return false;
    }
    if (!closing && RESHAPING_TAGS.has(name)) {
      shape = 'strip';
      return false;
    }
    if (!closing && !keeps(token)) {
      removed++;
    }
    if (VOID_TAGS.has(name)) {
      return;
    }
    if (!closing) {
      open.push(name);
      if (open.length > MAX_NESTING) {
        shape = 'flatten';
        return false;
      }
      return;
    }
    if (open[open.length - 1] === name) {
      open.pop();
      return;
    }
    if (++misnested > MAX_MISNESTED) {
      shape = 'flatten';
      return false;
    }
    // Only what the parser certainly closes leaves the stack: counting an
    // element still open is safe, missing one is how nesting went unseen.
    let at = open.length - 1;
    while (
      at >= 0 &&
      !(HEADINGS.has(name) ? HEADINGS.has(open[at]) : open[at] === name)
    ) {
      at--;
    }
    if (at === -1) {
      return;
    }
    if (name === 'form') {
      // </form> takes the form off the stack and leaves what is above it
      open.splice(at, 1);
      return;
    }
    const between = open.slice(at + 1);
    const closes =
      CLOSED_IN_SCOPE.has(name) || HEADINGS.has(name)
        ? !between.some(
            (tag) =>
              SCOPE_LIMITS.has(tag) ||
              (name === 'p' && tag === 'button') ||
              (name === 'li' && (tag === 'ul' || tag === 'ol'))
          )
        : !between.some((tag) => SPECIAL.has(tag));
    if (closes) {
      open.length = at;
    }
  });
  if (shape !== 'ok') {
    return shape;
  }
  return removed > MAX_REMOVED ? 'strip' : 'ok';
};

// Plain text that only looks like markup loses words to the parser: a tag the
// input ends inside is dropped with everything from its `<` (`use x <y as a
// rule`), and so is a bogus comment up to its `>` (`I </3 Mondays`). Their
// `<` is escaped instead, so the text stays.
const keepStrayText = (html: string) => {
  const stray: number[] = [];
  scanMarkup(html, (token) => {
    if (
      token.name === '#bogus' ||
      (token.end === -1 &&
        !token.comment &&
        token.attributes <= MAX_ATTRIBUTES)
    ) {
      stray.push(token.start);
    }
  });
  let out = '';
  let from = 0;
  for (const at of stray) {
    out += `${html.slice(from, at)}&lt;`;
    from = at + 1;
  }
  return out + html.slice(from);
};

// What DOMPurify would remove, taken out in linear time first: comments and
// the like, pictures with no web address, and every tag that is not allowed.
// A removed tag's text stays, except in the ones DOMPurify drops whole.
const stripRemoved = (html: string) => {
  let out = '';
  let from = 0;
  scanMarkup(html, (token) => {
    out += html.slice(from, token.start);
    from = token.end === -1 ? html.length : token.end;
    if (token.comment) {
      return;
    }
    if (keeps(token)) {
      out += html.slice(token.start, from);
      return;
    }
    if (!token.closing && DROPPED_WITH_CONTENT.has(token.name)) {
      const closingTag = new RegExp(`</${token.name}[\\t\\n\\f\\r />]`, 'gi');
      closingTag.lastIndex = from;
      from =
        (token.name !== 'plaintext' && closingTag.exec(html)?.index) ||
        html.length;
      return from;
    }
  });
  return out + html.slice(from);
};

// Removing tags can join a stray `<` and `>` into a new one, so whatever is
// left of either is escaped: the parser then sees text only.
const flatten = (html: string) =>
  html.replace(/<[^<>]*>/g, ' ').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const sanitizePostContent = (value: unknown): string => {
  if (typeof value !== 'string' || !value) {
    return '';
  }

  // Content longer than any post is cut first: callers that take content from
  // a request refuse it before this.
  const bounded = value.slice(0, MAX_POST_CONTENT_LENGTH);

  // A block tag the editor doesn't know would be dropped with its text kept,
  // gluing its line to the next one, so it becomes a paragraph the way the
  // editor writes one. Only a block with no block inside it is rewritten: a
  // paragraph cannot hold another, so rewriting `<div><p>a</p></div>` would
  // leave empty paragraphs (blank lines) around `a`. An outer block is left
  // for DOMPurify to unwrap, as before, once its inner ones are paragraphs.
  // Every scan stops at the next block tag (`[^<>]` in the opening tag, the
  // lookahead in the body), so hostile markup stays linear.
  const paragraphs = bounded.replace(
    /<(div|section|article|blockquote|pre|h[4-6])\b[^<>]*>((?:(?!<\/?(?:div|section|article|blockquote|pre|h[1-6]|p|ul|ol|li)\b)[\s\S])*?)<\/\1\s*>/gi,
    '<p dir="auto">$2</p>'
  );

  // Past any limit the parser below would be slow on, the markup is stripped
  // to the tags it keeps or, failing that, flattened to text.
  let markup = keepStrayText(paragraphs);
  let shape = markupShape(markup);
  if (shape === 'strip') {
    markup = stripRemoved(markup);
    shape = markupShape(markup);
  }
  if (shape !== 'ok') {
    markup = flatten(markup);
  }

  DOMPurify.addHook('uponSanitizeElement', dropImageWithoutUrl);
  try {
    return DOMPurify.sanitize(markup, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/|#)/i,
      // An attribute DOMPurify does not know as URI-safe has its value tested
      // against ALLOWED_URI_REGEXP, so without this every dir="auto" the
      // editor writes would be dropped on save.
      ADD_URI_SAFE_ATTR: ['dir'],
    });
  } finally {
    DOMPurify.removeHook('uponSanitizeElement', dropImageWithoutUrl);
  }
};

/**
 * For the composer's network previews, which render post text as HTML.
 *
 * The previews run the text through stripHtmlValidation, which decodes
 * entities for the plain text the networks receive, and then add markup of
 * their own: the mention colour and the red `<mark>` with its tooltip over text
 * that will be cropped. The strict list above would strip that markup, so this
 * uses DOMPurify's defaults instead: they keep formatting, classes, inline
 * styles and data attributes, and remove scripts, event handlers and
 * javascript: URLs.
 */
export const sanitizePreviewHtml = (value: unknown): string => {
  if (typeof value !== 'string' || !value) {
    return '';
  }

  return DOMPurify.sanitize(value);
};

// The plain text a reviewer sees for a post item: the text nodes of the
// sanitised HTML, in order, entities decoded. This is what anchor offsets
// index into on both the frontend (element.textContent) and the backend.
export const postContentPlainText = (value: unknown): string => {
  const walk = (nodes: any[]): string =>
    nodes
      .map((node) =>
        node.nodeName === '#text' ? node.value : walk(node.childNodes || [])
      )
      .join('');

  return walk(parseFragment(sanitizePostContent(value)).childNodes as any[]);
};
