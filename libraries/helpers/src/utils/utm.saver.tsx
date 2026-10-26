'use client';

import { FC, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocalStorage } from '@mantine/hooks';
import { TrackEnum } from '@gitroom/nestjs-libraries/user/track.enum';
import { useTrack } from '@gitroom/react/helpers/use.track';
import {
  normalizeTier,
  pricing,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';

/**
 * Plans the marketing site is allowed to preselect through `?plan=`.
 *
 * Derived from `pricing` rather than written out, because the hardcoded list
 * silently stopped matching when the tiers were renamed — `?plan=creator`
 * landed on a visitor who had picked a plan and was dropped without a trace.
 * Retired tiers are excluded: they are not for sale, so a link offering one
 * should not work.
 */
const SELECTABLE_PLANS = Object.keys(pricing).filter(
  (plan) => plan !== 'FREE' && !pricing[plan].retired
);
const SELECTABLE_PERIODS = ['MONTHLY', 'YEARLY'];
const UTM_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const;

const UtmSaver: FC = () => {
  const query = useSearchParams();
  const [value, setValue] = useLocalStorage({ key: 'utm', defaultValue: '' });
  const searchParams = useSearchParams();
  const track = useTrack();

  useEffect(() => {
    if (searchParams.get('check')) {
      track(TrackEnum.StartTrial);
    }
  }, []);

  useEffect(() => {
    const landingUrl = localStorage.getItem('landingUrl');
    if (landingUrl) {
      return;
    }

    localStorage.setItem('landingUrl', window.location.href);
    localStorage.setItem('referrer', document.referrer);
  }, []);

  useEffect(() => {
    const utm = query.get('utm_source') || query.get('utm') || query.get('ref');
    // Read from storage as well: `value` is still empty on the first render,
    // so a later visit with its own link would replace the first one.
    if (utm && !value && !localStorage.getItem('utm')) {
      setValue(utm);
      // The rest of the same link, kept whole: a medium from one visit next to
      // a campaign from another would describe a link nobody clicked.
      const params = Object.fromEntries(
        UTM_PARAMS.map((key) => [key, query.get(key)]).filter(([, v]) => v)
      );
      try {
        localStorage.setItem('utmParams', JSON.stringify(params));
      } catch (e) {}
    }
  }, [query, value]);

  // The marketing site sends the plan the visitor picked, but registration
  // redirects away before the trial screen mounts, so the choice has to survive
  // the round-trip. A later ?plan= wins: the visitor changed their mind.
  useEffect(() => {
    // `?plan=AGENCY` links predate the rename and are still out there.
    const plan = normalizeTier(query.get('plan')?.toUpperCase());
    if (plan && SELECTABLE_PLANS.includes(plan)) {
      localStorage.setItem('selectedPlan', plan);
    }

    const period = query.get('period')?.toUpperCase();
    if (period && SELECTABLE_PERIODS.includes(period)) {
      localStorage.setItem('selectedPeriod', period);
    }
  }, [query]);

  return <></>;
};

export const useUtmUrl = () => {
  const [value] = useLocalStorage({ key: 'utm', defaultValue: '' });
  return value || '';
};

const clip = (value?: string | null) => (value || '').slice(0, 200) || undefined;

/**
 * The buyer's first visit, for the checkout to send with a plan: the UTM link
 * that brought them, the site that referred them, and the page they landed
 * on. The server keeps it on the subscription, and the sales channel's card
 * shows it. Only the referrer's host and the landing page's first path segment
 * go out: a first page can be an activation, reset or invite link, and those
 * carry their token in the path (`/auth/activate/<code>`) or the query.
 *
 * Read when the request is made rather than through `useLocalStorage`, which
 * fills in after mount: the checkout can load before it does.
 */
export const readAttribution = () => {
  const read = (key: string) => {
    const raw = localStorage.getItem(key) || '';
    try {
      // `useLocalStorage` writes its values as JSON.
      return JSON.parse(raw);
    } catch (e) {
      return raw;
    }
  };
  try {
    const utm = String(read('utm') || '');
    const landingUrl = localStorage.getItem('landingUrl') || '';
    const landing = landingUrl ? new URL(landingUrl) : null;
    // Visitors from before `utmParams` was kept still have their landing URL.
    const params: Record<string, string | null> =
      read('utmParams') ||
      Object.fromEntries(
        UTM_PARAMS.map((key) => [key, landing?.searchParams.get(key) || null])
      );
    const referrerUrl = localStorage.getItem('referrer') || '';
    const referrer = referrerUrl ? new URL(referrerUrl).hostname : '';
    return {
      utm: clip(utm),
      utm_medium: clip(params.utm_medium),
      utm_campaign: clip(params.utm_campaign),
      utm_content: clip(params.utm_content),
      utm_term: clip(params.utm_term),
      referrer:
        referrer && referrer !== window.location.hostname
          ? clip(referrer)
          : undefined,
      landing: clip(landing ? `/${landing.pathname.split('/')[1] || ''}` : ''),
    };
  } catch (e) {
    return {};
  }
};
export default UtmSaver;
