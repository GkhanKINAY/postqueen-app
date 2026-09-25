/**
 * Whether this installation sends product news to its customers.
 *
 * `getProvider()` in `newsletter.service.ts` picks the Resend provider with
 * this, which keeps each address on the list with its choice to stay on it.
 * The frontend reads it to say at sign-up that the news will come, and to
 * offer the switch in Settings, only where that list exists.
 */
export const isProductNewsEnabled = () =>
  !!process.env.RESEND_CONTACTS_API_KEY &&
  !!process.env.RESEND_NEWS_SEGMENT_ID &&
  !!process.env.RESEND_NEWS_TOPIC_ID;
