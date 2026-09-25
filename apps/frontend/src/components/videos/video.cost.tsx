'use client';

import { useVideoQuote } from '@gitroom/frontend/components/media/use.generate.video';
import { useCreditsBalance } from '@gitroom/frontend/components/billing/use.credits.balance';

/**
 * What the video the form describes will cost, in credits, and whether the
 * balance covers it. `params` is only what changes the price. Nothing with
 * billing off, where nothing is metered: the quote is not even asked for.
 */
export const useVideoCost = (
  identifier: string,
  output: 'vertical' | 'horizontal',
  params: Record<string, unknown>
) => {
  const { data: quote } = useVideoQuote(identifier, output, params);
  const { data: credits } = useCreditsBalance();
  return {
    credits: quote?.credits,
    short:
      !!quote &&
      !!credits &&
      !credits.unlimited &&
      (credits.balance ?? 0) < quote.credits,
  };
};
