/**
 * Whether this installation has a link shortener configured.
 *
 * Mirrors `getProvider()` in `short.link.service.ts` on the backend, and has to
 * keep mirroring it: with none of these set it falls back to the `Empty`
 * provider, which never shortens a link and reports no clicks. The frontend
 * needs this to stop offering what that cannot do, the shortlink preference
 * and the short link table in a post's statistics.
 */
export const isShortLinkEnabled = () =>
  !!process.env.DUB_TOKEN ||
  !!process.env.SHORT_IO_SECRET_KEY ||
  !!process.env.KUTT_API_KEY ||
  !!process.env.LINK_DRIP_API_KEY;
