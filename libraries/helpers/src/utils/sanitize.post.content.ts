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
const VOID_TAGS = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'wbr']);
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
//   three seconds).
// The public preview sanitizes stored content on every view, so that cost
// could be paid again by anyone opening the link.
const MAX_NESTING = 100;
const MAX_MISNESTED = 100;
// Balanced markup is parsed in linear time, but at about a second per 40,000
// elements; no post comes near this many.
const MAX_TAGS = 20_000;
// Summing the open depth over all tags bounds the re-opened formatting.
const MAX_OPEN_WORK = 200_000;
// Removals cost about 0.2 s per thousand at this size.
const MAX_REMOVED = 500;
// What a post's content may be at most, in characters, before it is parsed.
// The longest a network takes is ListMonk's newsletter body, and a real one is
// a fraction of this.
export const MAX_POST_CONTENT_LENGTH = 1_000_000;

const ALLOWED = new Set(ALLOWED_TAGS);
// A picture DOMPurify keeps: one whose src is a web address (dropImageWithoutUrl).
const KEPT_IMAGE = /^<img\b[^<>]*\ssrc\s*=\s*["']?https?:\/\//i;

// How the markup must be handled, read in one pass: as it is, with what
// DOMPurify would remove stripped first, or flattened to text. The stack never
// grows past MAX_NESTING, so each tag costs at most that much.
const markupShape = (html: string): 'ok' | 'strip' | 'flatten' => {
  // A tag with a `<` inside a quoted attribute is a tag to the parser but not
  // to the pattern below; any tag start it cannot account for flattens.
  const starts = html.match(/<[a-zA-Z/]/g)?.length || 0;
  // Comments, CDATA and processing instructions are all removed.
  let removed = html.match(/<[!?]/g)?.length || 0;
  const open: string[] = [];
  let misnested = 0;
  let tags = 0;
  let work = 0;
  for (const [whole, closing, tag] of html.matchAll(
    /<(\/?)([a-zA-Z][\w-]*)[^<>]*>/g
  )) {
    if (++tags > MAX_TAGS || (work += open.length) > MAX_OPEN_WORK) {
      return 'flatten';
    }
    const name = tag.toLowerCase();
    if (
      !closing &&
      (!ALLOWED.has(name) || (name === 'img' && !KEPT_IMAGE.test(whole)))
    ) {
      removed++;
    }
    if (VOID_TAGS.has(name)) {
      continue;
    }
    if (!closing) {
      open.push(name);
      if (open.length > MAX_NESTING) {
        return 'flatten';
      }
      continue;
    }
    if (open[open.length - 1] === name) {
      open.pop();
      continue;
    }
    if (++misnested > MAX_MISNESTED) {
      return 'flatten';
    }
    const at = open.lastIndexOf(name);
    if (at !== -1) {
      open.length = at;
    }
  }
  if (tags < starts) {
    return 'flatten';
  }
  return removed > MAX_REMOVED ? 'strip' : 'ok';
};

// What DOMPurify would remove, taken out in linear time first: comments and
// the like, pictures with no web address, and every tag that is not allowed
// (its text stays).
const stripRemoved = (html: string) =>
  html
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<[!?][^>]*>?/g, '')
    .replace(/<\/?[a-zA-Z][\w-]*[^<>]*>/g, (tag) => {
      const name = tag.match(/^<\/?([a-zA-Z][\w-]*)/)![1].toLowerCase();
      return ALLOWED.has(name) && (name !== 'img' || KEPT_IMAGE.test(tag))
        ? tag
        : '';
    });

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
  let markup = paragraphs;
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
