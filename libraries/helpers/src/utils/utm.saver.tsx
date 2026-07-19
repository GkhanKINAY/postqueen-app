'use client';

import { FC, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocalStorage } from '@mantine/hooks';
import { TrackEnum } from '@gitroom/nestjs-libraries/user/track.enum';
import { useFireEvents } from '@gitroom/helpers/utils/use.fire.events';
import { useTrack } from '@gitroom/react/helpers/use.track';

/** Plans the marketing site is allowed to preselect through ?plan=. */
const SELECTABLE_PLANS = ['STANDARD', 'TEAM', 'PRO', 'ULTIMATE'];
const SELECTABLE_PERIODS = ['MONTHLY', 'YEARLY'];

const UtmSaver: FC = () => {
  const query = useSearchParams();
  const [value, setValue] = useLocalStorage({ key: 'utm', defaultValue: '' });
  const searchParams = useSearchParams();
  const fireEvents = useFireEvents();
  const track = useTrack();

  useEffect(() => {
    if (searchParams.get('check')) {
      fireEvents('purchase');
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
    if (utm && !value) {
      setValue(utm);
    }
  }, [query, value]);

  // The marketing site sends the plan the visitor picked, but registration
  // redirects away before the trial screen mounts, so the choice has to survive
  // the round-trip. A later ?plan= wins: the visitor changed their mind.
  useEffect(() => {
    const plan = query.get('plan')?.toUpperCase();
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
export default UtmSaver;
