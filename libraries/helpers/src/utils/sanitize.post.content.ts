import DOMPurify from 'isomorphic-dompurify';

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
];

const ALLOWED_ATTR = [
  'href',
  'target',
  'rel',
  'class',
  'data-mention-id',
  'data-mention-label',
];

export const sanitizePostContent = (value: unknown): string => {
  if (typeof value !== 'string' || !value) {
    return '';
  }

  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/|#)/i,
  });
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
