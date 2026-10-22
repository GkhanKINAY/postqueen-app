'use client';

import { useSearchParams } from 'next/navigation';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { Analytics as DubAnalyticsIn } from '@dub/analytics/react';
import { getCookie } from 'react-use-cookie';

// Loading Dub's script hands Dub the visitor's IP, and the cookie policy says
// it runs only for a visit through an affiliate link. So it loads when the URL
// carries one of the two parameters the script itself reads (`?dub_id=` from a
// Dub short link, `?via=` from a partner link), or when one of the cookies it
// writes for such a visit is already there. A referred visitor gets the script
// on every page as before; everyone else never loads it.
const isReferredVisit = (query: URLSearchParams) => {
  if (query.get('dub_id') || query.get('via')) {
    return true;
  }
  try {
    return !!getCookie('dub_id', '') || !!getCookie('dub_partner_data', '');
  } catch (e) {
    // `getCookie` decodes the value, and only a cookie that exists can fail to.
    return true;
  }
};

export const DubAnalytics = () => {
  const { dub } = useVariables();
  const query = useSearchParams();
  if (!dub || !isReferredVisit(query)) return null;
  return (
    <DubAnalyticsIn />
  );
};

export const useDubClickId = () => {
  const { dub } = useVariables();
  if (!dub) return undefined;

  // `dub_id` is the click id Dub's docs read. A Dub short link redirects with
  // `?dub_id=`, and the script keeps only that cookie; a `?via=` link keeps it
  // in `dub_partner_data` as well. Reading only the second dropped every
  // partner who shares a short link.
  //
  // Both cookies are written by Dub's own script, and `react-use-cookie` reads
  // them with `split('=')[1]` — so any value containing `=` (base64 padding)
  // comes back truncated, and `decodeURIComponent` can throw on a split escape.
  // This hook runs during render of the billing screens, and the repo has no
  // route-level `error.tsx`, so an unguarded read whitescreened the page.
  try {
    const clickId = getCookie('dub_id', '');
    if (clickId) return clickId;
    return JSON.parse(getCookie('dub_partner_data', '{}'))?.clickId || undefined;
  } catch (e) {
    return undefined;
  }
};
