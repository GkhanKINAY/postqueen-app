'use client';

import { useT } from '@gitroom/react/translation/get.transation.service.client';

/**
 * What the billing pages show when this installation has no payment provider
 * (billing off, the self-hosted default): nothing to buy, everything open.
 * Shared by /billing and /billing/lifetime, which are both still navigable
 * even though the nav hides them.
 */
export const BillingNotConfigured = () => {
  const t = useT();
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
};
