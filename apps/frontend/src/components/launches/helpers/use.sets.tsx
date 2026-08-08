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
    return (await fetch('/sets')).json();
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
