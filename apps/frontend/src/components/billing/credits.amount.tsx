'use client';

import { FC } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  useMenuFilter,
  useMenuItem,
} from '@gitroom/frontend/components/layout/top.menu';
import {
  formatCredits,
  useCreditsBalance,
} from '@gitroom/frontend/components/billing/use.credits.balance';

/** A small coin, drawn in the current text colour. */
export const CreditsIcon: FC<{ size?: number }> = ({ size = 13 }) => (
  <svg
    viewBox="0 0 16 16"
    width={size}
    height={size}
    fill="none"
    aria-hidden="true"
    className="shrink-0"
  >
    <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M8 5v6M6 6.5h3a1 1 0 0 1 0 2H7a1 1 0 0 0 0 2h3"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * An amount of credits as a coin and a number, the same in every language
 * ("1 credits" is what a plain template gives for one). The label is for
 * screen readers.
 */
export const CreditsAmount: FC<{
  amount: number;
  className?: string;
  size?: number;
}> = ({ amount, className, size }) => {
  const t = useT();
  const value = formatCredits(amount);
  return (
    <span
      className={clsx('inline-flex items-center gap-[4px]', className)}
      aria-label={t('n_credits_amount', '{{amount}} credits', {
        amount: value,
      })}
    >
      <CreditsIcon size={size} />
      <span aria-hidden="true">{value}</span>
    </span>
  );
};

/**
 * Whether this person may open Billing: the gate the rail and the user menu
 * apply, so nothing here sends a member to a screen they are not shown.
 */
export const useCanOpenBilling = () => {
  const { secondMenu } = useMenuItem();
  const filter = useMenuFilter();
  const billing = secondMenu.find((f) => f.path === '/billing');
  return !!billing && filter(billing);
};

/**
 * Under a generator's button when the balance does not cover it, with the way
 * to more credits for whoever may open Billing.
 */
export const CreditsShortNote: FC<{ message: string }> = ({ message }) => {
  const t = useT();
  const canOpenBilling = useCanOpenBilling();
  return (
    <div
      className="text-center text-[12.5px] text-pqWarn"
      data-pq="credits-short"
    >
      {message}
      {canOpenBilling && (
        <>
          {' '}
          <Link href="/billing" className="font-[600] underline">
            {t('get_more_credits', 'Get more credits')}
          </Link>
        </>
      )}
    </div>
  );
};

/**
 * "N credits left", for a generator's title. Nothing with billing off, or
 * before the balance has loaded.
 */
export const CreditsLeft: FC<{ className?: string }> = ({ className }) => {
  const t = useT();
  const { data } = useCreditsBalance();
  if (!data || data.unlimited) {
    return null;
  }
  return (
    <span className={className} data-pq="credits-left">
      {t('credits_balance_left', '{{amount}} credits left', {
        amount: formatCredits(data.balance ?? 0),
      })}
    </span>
  );
};
