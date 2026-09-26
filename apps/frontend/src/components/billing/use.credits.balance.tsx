'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useCallback } from 'react';
import useSWR from 'swr';

export interface CreditsBalance {
  /** Billing is off: nothing is metered. */
  unlimited: boolean;
  /** Credits, not hundredths. Null when unlimited. */
  balance: number | null;
  /** The credits that run out soonest, and when. */
  expiring: { amount: number; at: string } | null;
}

/**
 * The organization's credits balance. One key, so every place that shows it
 * (the user menu, the image and video modals) updates together: call
 * `mutate()` after anything that spends. Nothing is fetched with billing off.
 */
export const useCreditsBalance = () => {
  const fetch = useFetch();
  const { billingEnabled } = useVariables();

  const load = useCallback(async (): Promise<CreditsBalance> => {
    // customFetch resolves a 4xx/5xx; a failed read must not show as a
    // balance of zero and send somebody with credits off to buy more.
    const response = await fetch('/billing/credits');
    if (!response.ok) {
      throw new Error('Could not load the credits balance');
    }
    return response.json();
  }, [fetch]);

  // Read again when the tab comes back into focus: credits bought in the
  // Billing tab show up here without a reload.
  return useSWR(billingEnabled ? 'credits-balance' : null, load);
};

/** A balance as people read it: whole when it is whole, else one decimal. */
export const formatCredits = (credits: number) =>
  Number.isInteger(credits) ? String(credits) : credits.toFixed(1);
