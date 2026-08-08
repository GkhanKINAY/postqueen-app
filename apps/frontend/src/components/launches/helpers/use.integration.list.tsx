'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCallback } from 'react';
import useSWR from 'swr';
import { sortIntegrationsByProviderImportance } from '@gitroom/frontend/components/launches/helpers/sort.integrations';

export const useIntegrationList = () => {
  const fetch = useFetch();

  const load = useCallback(async (path: string): Promise<any[]> => {
    // `customFetch` resolves 4xx/5xx rather than rejecting, so without this the
    // API's usual `{statusCode, message}` body parses cleanly, `.integrations`
    // is undefined, and the hook hands back `[]` with no error — a server
    // failure and an account with no channels become the same answer. Callers
    // act on that: the Add buttons announce "connect a channel first" and
    // redirect people who have eight of them.
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error('Could not load channels');
    }
    const integrations = (await response.json()).integrations;
    return sortIntegrationsByProviderImportance(
      Array.isArray(integrations) ? integrations : []
    );
  }, [fetch]);

  return useSWR('/integrations/list', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    // Load-bearing, despite looking like a restatement of the default. It is
    // what forces SWR's first snapshot to `isLoading: true`; with it gone,
    // `fallbackData: []` plus `revalidateIfStale: false` pins `isLoading` to
    // false forever, and every consumer that reads an empty list as "this
    // account has no channels" (see `NewPost`) starts believing it before the
    // first fetch has landed.
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    fallbackData: [],
  });
};