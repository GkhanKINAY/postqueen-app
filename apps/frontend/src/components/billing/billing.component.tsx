'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { MainBillingComponent } from './main.billing.component';

export const BillingComponent = () => {
  const fetch = useFetch();
  const user = useUser();
  const t = useT();
  const { billingEnabled } = useVariables();
  // Both endpoints below are ADMIN-gated. The page is directly navigable, so
  // without this a regular member fired two 402s and sat on a spinner.
  const isOrgAdmin = ['ADMIN', 'SUPERADMIN'].includes(user?.role!);
  const load = useCallback(async (path: string) => {
    return await (await fetch(path)).json();
  }, []);
  const { isLoading: isLoadingTiers, data: tiers } = useSWR(
    isOrgAdmin && billingEnabled ? '/user/subscription/tiers' : null,
    load
  );
  const { isLoading: isLoadingSubscription, data: subscription } = useSWR(
    isOrgAdmin && billingEnabled ? '/user/subscription' : null,
    load
  );
  // The nav hides this page when billing is off, but the route is still
  // navigable. Without this it rendered the full plan grid from the local
  // `pricing` constant with live Purchase buttons, and pressing one posted to
  // /billing/subscribe, which calls Stripe with the `sk_nothing` placeholder
  // and answers 500. A storefront that cannot take money should say so rather
  // than look open.
  if (!billingEnabled) {
    return (
      <div className="flex flex-1 items-center justify-center p-[56px_24px]">
        <div className="flex max-w-[520px] flex-col items-center gap-[16px] text-center">
          <span className="grid size-[56px] place-items-center rounded-full bg-pqSettings text-pqSoft">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none">
              <path
                d="M2 9h20M6 15h4M2 7.8v8.4C2 17.9 3.1 19 4.8 19h14.4c1.7 0 2.8-1.1 2.8-2.8V7.8C22 6.1 20.9 5 19.2 5H4.8C3.1 5 2 6.1 2 7.8Z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <h1 className="font-display text-[24px] font-[700] -tracking-[0.02em] text-pqText">
            {t('billing_not_configured_title', 'Billing is not set up')}
          </h1>
          <p className="text-[16px] leading-[1.6] text-pqMuted">
            {t(
              'billing_not_configured',
              'This installation has no payment provider configured, so there is nothing to subscribe to. Every feature is available without a plan.'
            )}
          </p>
        </div>
      </div>
    );
  }
  if (!isOrgAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center p-[56px_24px]">
        <div className="flex max-w-[520px] flex-col items-center gap-[16px] text-center">
          <span className="grid size-[56px] place-items-center rounded-full bg-pqSettings text-pqSoft">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none">
              <path
                d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.9"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <h1 className="font-display text-[24px] font-[700] -tracking-[0.02em] text-pqText">
            {t('billing_admin_only_title', 'Billing is managed by admins')}
          </h1>
          <p className="text-[16px] leading-[1.6] text-pqMuted">
            {t(
              'billing_admin_only',
              'Only a workspace admin can manage billing. Please ask an admin of this workspace.'
            )}
          </p>
        </div>
      </div>
    );
  }
  if (isLoadingSubscription || isLoadingTiers) {
    return <LoadingComponent />;
  }

  return (
    <MainBillingComponent
      sub={subscription?.subscription}
      discount={subscription?.discount}
      paymentFailed={subscription?.paymentFailed}
    />
  );
};
