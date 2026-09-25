/**
 * Whether this installation sends product news to its customers.
 *
 * Mirrors `getProvider()` in `newsletter.service.ts` on the backend, and has to
 * keep mirroring it: these three pick the Resend provider, which keeps every
 * account's address on the list and each one's choice to stay on it. The
 * frontend needs this to tell people at sign-up that the news will come, and
 * to offer the switch in Settings, only where a list really exists.
 */
export const isProductNewsEnabled = () =>
  !!process.env.RESEND_CONTACTS_API_KEY &&
  !!process.env.RESEND_NEWS_SEGMENT_ID &&
  !!process.env.RESEND_NEWS_TOPIC_ID;
