'use client';

import { useVariables } from '@gitroom/react/helpers/variable.context';
import { Analytics as DubAnalyticsIn } from '@dub/analytics/react';
import { getCookie } from 'react-use-cookie';

export const DubAnalytics = () => {
  const { dub } = useVariables();
  if (!dub) return null;
  return (
    <DubAnalyticsIn />
  );
};

export const useDubClickId = () => {
  const { dub } = useVariables();
  if (!dub) return undefined;

  // The cookie is written by Dub's own script, and `react-use-cookie` reads it
  // with `split('=')[1]` — so any value containing `=` (base64 padding) comes
  // back truncated, and `decodeURIComponent` can throw on a split escape.
  // This hook runs during render of the billing screens, and the repo has no
  // route-level `error.tsx`, so an unguarded parse whitescreened the page.
  const dubCookie = getCookie('dub_partner_data', '{}');
  try {
    return JSON.parse(dubCookie)?.clickId || undefined;
  } catch (e) {
    return undefined;
  }
};
