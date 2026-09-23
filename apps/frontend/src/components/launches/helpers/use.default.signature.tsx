'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCallback } from 'react';
import useSWR from 'swr';

/**
 * Same `default-sign` key, fetcher and options the calendar context uses, so
 * the two share one cache entry. Create Post in the header needs the
 * signature that is added to a new post, outside the calendar page, where that
 * context does not exist.
 */
export const useDefaultSignature = () => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    return await (await fetch('/signatures/default')).json();
  }, [fetch]);

  return useSWR('default-sign', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};
