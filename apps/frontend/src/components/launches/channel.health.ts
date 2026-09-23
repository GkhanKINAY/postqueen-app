export type ChannelHealth = {
  /** Channels the rule targets. For an "all channels" rule this is every channel. */
  total: number;
  /** Of those, how many can actually publish right now. */
  healthy: number;
};

/**
 * Mirrors the server-side filter in AutopostsService.startAutopost, which skips
 * disabled, reconnect-needed and half-connected channels. A rule whose channels
 * have all gone that way still shows its toggle "on" and still answers "RSS
 * valid!" to Test connection, because that only checks the feed. This is the
 * only place the row can say it is not actually running.
 *
 * startAutopost filters only when the rule publishes (`autoPublish`). In
 * draft mode a draft waiting on a channel that needs reconnecting is what the
 * user wants, so such a rule is still running and only a channel that is gone
 * altogether counts against it.
 */
export const computeChannelHealth = (
  savedIds: string[],
  all: any[],
  autoPublish = true
): ChannelHealth => {
  // No channel list, no verdict. useIntegrationList answers `[]` from
  // fallbackData while /integrations/list is in flight — and that request is
  // the slower of the two the page makes — so measuring against it flashed
  // "Not running" on every healthy rule at every page load, and made it stick
  // if the request failed.
  if (!all?.length) {
    return { total: 0, healthy: 0 };
  }

  const usable = autoPublish
    ? all.filter(
        (f: any) => !f?.disabled && !f?.refreshNeeded && !f?.inBetweenSteps
      )
    : all;

  // An empty saved list means "all channels" — both here and in startAutopost.
  // Such a rule is not degraded because one unrelated channel is off: it fires
  // for whatever is connected, which is what it says it does. Only report when
  // there is nothing left for it to act on at all.
  if (!savedIds.length) {
    return usable.length
      ? { total: 0, healthy: 0 }
      : { total: all.length, healthy: 0 };
  }

  const usableIds = new Set(usable.map((f: any) => f.id));
  return {
    total: savedIds.length,
    healthy: savedIds.filter((id) => usableIds.has(id)).length,
  };
};
