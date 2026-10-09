/**
 * The name a person sees for a channel: the one they gave it in PostQueen
 * when they renamed it, otherwise the platform's own.
 *
 * Apply it only where a name is shown (lists, calendar, analytics, the
 * public API and the agent tools). Posting, refreshing and reconnecting work
 * with the platform's name in `name`, which is also the column every refresh
 * writes, so a rename survives them.
 */
export const withChannelDisplayName = <
  T extends { name: string; customName?: string | null }
>(
  integration: T
): T => ({
  ...integration,
  name: integration.customName || integration.name,
});

/** The same for a row that carries its channel as `integration`. */
export const withPostChannelDisplayName = <
  P extends { integration?: { name: string; customName?: string | null } | null }
>(
  post: P
): P =>
  post.integration
    ? { ...post, integration: withChannelDisplayName(post.integration) }
    : post;
