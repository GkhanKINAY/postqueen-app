'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

export type AnalyticsRefreshStatus = {
  integrations: number;
  lastSyncedAt: string | null;
};

// Channels whose post metrics are only read on request: how many there are
// in view and when they were last read.
export const useAnalyticsRefreshStatus = (params: {
  integrationId?: string;
  enabled: boolean;
}) => {
  const fetch = useFetch();
  const search = new URLSearchParams();
  if (params.integrationId) {
    search.set('integrationId', params.integrationId);
  }
  const query = search.toString();
  const key = params.enabled ? `/analytics/refresh?${query}` : null;

  const load = useCallback(async () => {
    const response = await fetch(`/analytics/refresh?${query}`);
    if (!response.ok) {
      throw new Error('Could not load analytics refresh status');
    }
    return (await response.json()) as AnalyticsRefreshStatus;
  }, [fetch, query]);

  return useSWR(key, load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};
