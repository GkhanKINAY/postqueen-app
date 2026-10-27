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

// Tags that never take a closing tag, so they never nest.
const VOID_TAGS = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'wbr']);
// The editor's output nests a handful of levels (a list item, a mention inside
// bold inside a paragraph) and always closes what it opens. jsdom's cost grows
// with the square of two shapes it is not written for: deep nesting (`a<b>`
// 2,000 times took two seconds, 5,000 times overflowed the stack) and close
// tags that do not end the innermost element, which its misnesting repair
// redoes for every one (`<b><i></b></i>` 5,000 times took six seconds). The
// public preview sanitizes stored content on every view, so that cost could
// be paid again by anyone opening the link.
const MAX_NESTING = 100;
const MAX_MISNESTED = 100;
// Balanced markup is parsed in linear time, but at about a second per 40,000
// elements; no post comes near this many.
const MAX_TAGS = 20_000;
// What a post's content may be at most, in characters, before it is parsed.
// The longest a network takes is ListMonk's newsletter body, and a real one is
// a fraction of this.
export const MAX_POST_CONTENT_LENGTH = 1_000_000;

// Whether the markup has any of these shapes, read in one pass. The stack never grows
// past MAX_NESTING, so each tag costs at most that much.
const tooTangled = (html: string) => {
  const open: string[] = [];
  let misnested = 0;
  let tags = 0;
  for (const [, closing, tag, selfClosing] of html.matchAll(
    /<(\/?)([a-zA-Z][\w-]*)[^<>]*?(\/?)>/g
  )) {
    if (++tags > MAX_TAGS) {
      return true;
    }
    const name = tag.toLowerCase();
    if (VOID_TAGS.has(name) || selfClosing) {
      continue;
    }
    if (!closing) {
      open.push(name);
      if (open.length > MAX_NESTING) {
        return true;
      }
      continue;
    }
    if (open[open.length - 1] === name) {
      open.pop();
      continue;
    }
    if (++misnested > MAX_MISNESTED) {
      return true;
    }
    const at = open.lastIndexOf(name);
    if (at !== -1) {
      open.length = at;
    }
  }
  return false;
};

export const sanitizePostContent = (value: unknown): string => {
  if (typeof value !== 'string' || !value) {
    return '';
  }

  // Past any limit the tags go and the text stays, so the parser below only
  // ever sees markup it handles quickly. Content longer than any post is cut
  // first: callers that take content from a request refuse it before this.
  const bounded = value.slice(0, MAX_POST_CONTENT_LENGTH);
  const markup = tooTangled(bounded)
    ? bounded.replace(/<[^<>]*>/g, ' ')
    : bounded;

  // A block tag the editor doesn't know would be dropped with its text kept,
  // gluing its line to the next one, so it becomes a paragraph the way the
  // editor writes one. Only a block with no block inside it is rewritten: a
  // paragraph cannot hold another, so rewriting `<div><p>a</p></div>` would
  // leave empty paragraphs (blank lines) around `a`. An outer block is left
  // for DOMPurify to unwrap, as before, once its inner ones are paragraphs.
  // Every scan stops at the next block tag (`[^<>]` in the opening tag, the
  // lookahead in the body), so hostile markup stays linear.
  const paragraphs = markup.replace(
    /<(div|section|article|blockquote|pre|h[4-6])\b[^<>]*>((?:(?!<\/?(?:div|section|article|blockquote|pre|h[1-6]|p|ul|ol|li)\b)[\s\S])*?)<\/\1\s*>/gi,
    '<p dir="auto">$2</p>'
  );

  DOMPurify.addHook('uponSanitizeElement', dropImageWithoutUrl);
  try {
    return DOMPurify.sanitize(paragraphs, {
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
