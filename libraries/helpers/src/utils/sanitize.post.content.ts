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

export const sanitizePostContent = (value: unknown): string => {
  if (typeof value !== 'string' || !value) {
    return '';
  }

  // A block tag the editor doesn't know would be dropped with its text kept,
  // gluing its line to the next one, so it becomes a paragraph the way the
  // editor writes one. Only a block with no block inside it is rewritten: a
  // paragraph cannot hold another, so rewriting `<div><p>a</p></div>` would
  // leave empty paragraphs (blank lines) around `a`. An outer block is left
  // for DOMPurify to unwrap, as before, once its inner ones are paragraphs.
  // Every scan stops at the next block tag (`[^<>]` in the opening tag, the
  // lookahead in the body), so hostile markup stays linear.
  const paragraphs = value.replace(
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
