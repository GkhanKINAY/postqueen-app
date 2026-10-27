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
// bold inside a paragraph). jsdom's cost grows with the square of the nesting
// and its recursion overflows the stack past a few thousand levels: `a<b>`
// 2,000 times took two seconds, 5,000 times threw. The public preview
// sanitizes stored content on every view, so that cost could be paid again by
// anyone opening the link.
const MAX_NESTING = 100;

// How deep the markup nests, counted in one pass. An unclosed tag counts as
// open, which is exactly the shape that makes the parser slow.
const nestingDepth = (html: string) => {
  let depth = 0;
  let deepest = 0;
  for (const [, closing, name, selfClosing] of html.matchAll(
    /<(\/?)([a-zA-Z][\w-]*)[^<>]*?(\/?)>/g
  )) {
    if (VOID_TAGS.has(name.toLowerCase()) || selfClosing) {
      continue;
    }
    depth = closing ? Math.max(0, depth - 1) : depth + 1;
    deepest = Math.max(deepest, depth);
  }
  return deepest;
};

export const sanitizePostContent = (value: unknown): string => {
  if (typeof value !== 'string' || !value) {
    return '';
  }

  // Past the limit the tags go and the text stays, so the parser below only
  // ever sees flat markup.
  const markup =
    nestingDepth(value) > MAX_NESTING ? value.replace(/<[^<>]*>/g, ' ') : value;

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
