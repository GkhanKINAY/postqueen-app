'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCallback } from 'react';
import useSWR from 'swr';

/**
 * Same `sets` key and options the calendar context uses, so the two share one
 * cache entry. Create Post needs the list outside the calendar page, where that
 * context does not exist.
 */
export const useSets = () => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    // `customFetch` resolves 4xx/5xx instead of rejecting, so without this a
    // server error parses as data and reads as "this account has no sets".
    // `new.post.tsx` acts on that by skipping the Select-a-Set step entirely —
    // silently, for someone who does have sets. Same hole and same fix as
    // `use.integration.list.tsx`.
    const response = await fetch('/sets');
    if (!response.ok) {
      throw new Error('Could not load sets');
    }
    const sets = await response.json();
    return Array.isArray(sets) ? sets : [];
  }, [fetch]);

  // `any[]` on purpose: `SetSelectionModal` takes `any[]` and callers
  // `JSON.parse(set.content)`, which the context's own `content: string[]`
  // declaration already contradicts.
  return useSWR<any[]>('sets', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};
