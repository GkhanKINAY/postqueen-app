'use client';

import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@gitroom/react/form/button';
import { Checkbox } from '@gitroom/react/form/checkbox';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import {
  CREDIT_PACK_MONTHS,
  CREDIT_PACKS,
  CreditPackId,
  pricing,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import {
  formatCredits,
  useCreditsBalance,
} from '@gitroom/frontend/components/billing/use.credits.balance';
import {
  CreditsAmount,
  CreditsIcon,
} from '@gitroom/frontend/components/billing/credits.amount';

/**
 * The customer asking for what they buy to start at once, and acknowledging
 * that their 14-day right of withdrawal ends once they use it. A yearly plan
 * and a credits pack are both sold only with it ticked; the server refuses
 * either without it.
 */
export const WithdrawalWaiver: FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  kind: 'yearly' | 'credits';
}> = ({ checked, onChange, kind }) => {
  const t = useT();
  return (
    <div data-pq="withdrawal-waiver" className="text-[13px] leading-[1.5]">
      <Checkbox
        disableForm
        checked={checked}
        onChange={(e) => onChange(e.target.value)}
        label={
          kind === 'yearly'
            ? t(
                'withdrawal_waiver_yearly',
                'I want my yearly credits right away, and I understand I lose my 14-day right to withdraw once I use them.'
              )
            : t(
                'withdrawal_waiver_credits',
                'I want these credits right away, and I understand I lose my 14-day right to withdraw once I use them.'
              )
        }
      />
    </div>
  );
};

// What a credit costs in the smallest pack, which the larger ones save on.
const BASE_PRICE = CREDIT_PACKS[0].price / CREDIT_PACKS[0].credits;

/**
 * The Billing page's credits: the balance, when the soonest of it runs out,
 * and the packs that top it up. Nothing with billing off.
 */
export const CreditsPacksCard: FC<{ tier?: string; period?: string }> = ({
  tier,
  period,
}) => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const queryParams = useSearchParams();
  const { data, mutate } = useCreditsBalance();
  const [waiver, setWaiver] = useState(false);
  const [buying, setBuying] = useState<CreditPackId | null>(null);

  // Back from Stripe. The credits come with the webhook, which can land a
  // moment after this page does, so the balance is read again shortly after.
  // Once per return, however often the toaster or `t` change identity.
  const purchased = queryParams.get('credits') === 'purchased';
  const announced = useRef(false);
  useEffect(() => {
    if (!purchased || announced.current) {
      return;
    }
    announced.current = true;
    toast.show(
      t(
        'credits_purchased',
        'Payment received. Your credits will show up in a moment.'
      )
    );
    [3000, 8000].forEach((ms) => setTimeout(() => mutate(), ms));
  }, [purchased, mutate, toast, t]);

  const buy = useCallback(
    (pack: CreditPackId) => async () => {
      if (!waiver) {
        toast.show(
          t(
            'withdrawal_waiver_required',
            'Tick the box below the packs to continue.'
          ),
          'warning'
        );
        return;
      }
      setBuying(pack);
      const response = await fetch('/billing/credits/checkout', {
        method: 'POST',
        body: JSON.stringify({ pack, withdrawalWaiver: true }),
      });
      const { url } = response?.ok
        ? await response.json().catch(() => ({} as any))
        : ({} as any);
      if (!url) {
        setBuying(null);
        toast.show(
          t(
            'credits_checkout_failed',
            'We could not start the checkout, please try again'
          ),
          'warning'
        );
        return;
      }
      window.location.href = url;
    },
    [waiver, fetch, toast, t]
  );

  if (!data || data.unlimited) {
    return null;
  }

  const planCredits = tier ? pricing[tier]?.monthly_credits : 0;

  return (
    <div
      data-pq="credits-card"
      className="flex flex-col gap-[18px] rounded-[16px] bg-pqInner p-[20px_22px] outline outline-1 -outline-offset-1 outline-pqBorder"
    >
      <div className="flex flex-wrap items-start gap-[14px]">
        <span className="grid size-[38px] shrink-0 place-items-center rounded-[12px] bg-pqBrandSoft text-pqBrand">
          <CreditsIcon size={19} />
        </span>
        <div className="flex min-w-[200px] flex-1 flex-col gap-[3px]">
          <div className="text-[18px] font-[600] -tracking-[0.01em] text-pqText">
            {t('credits', 'Credits')}
          </div>
          <div className="text-[13px] leading-[1.45] text-pqMuted">
            {planCredits
              ? period === 'YEARLY'
                ? t(
                    'credits_card_sub_yearly',
                    'AI images and videos spend credits. Your plan adds {{amount}} each year.',
                    { amount: planCredits * 12 }
                  )
                : t(
                    'credits_card_sub',
                    'AI images and videos spend credits. Your plan adds {{amount}} each month.',
                    { amount: planCredits }
                  )
              : t(
                  'credits_card_sub_plain',
                  'AI images and videos spend credits.'
                )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-[3px] mobile:w-full mobile:items-start mobile:ps-[52px]">
          <div className="flex items-baseline gap-[6px]">
            <span className="font-display text-[29px] font-[600] leading-none -tracking-[0.02em] text-pqText">
              {formatCredits(data.balance ?? 0)}
            </span>
            <span className="text-[13px] text-pqMuted">
              {t('credits_left_short', 'credits left')}
            </span>
          </div>
          {!!data.expiring && (
            <div className="text-[12.5px] text-pqSoft">
              {t('credits_expiring', '{{amount}} of them expire on {{date}}', {
                amount: formatCredits(data.expiring.amount),
                date: newDayjs(data.expiring.at).local().format('D MMM, YYYY'),
              })}
            </div>
          )}
        </div>
      </div>

      <div className="h-[1px] bg-pqLine" />

      <div className="flex flex-col gap-[4px]">
        <div className="text-[14px] font-[600] text-pqText">
          {t('credits_buy_more', 'Buy more credits')}
        </div>
        <div className="text-[12.5px] text-pqMuted">
          {t(
            'credits_pack_validity',
            'Bought credits last {{months}} months. The credits closest to running out are spent first.',
            { months: CREDIT_PACK_MONTHS }
          )}
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-[11px]">
        {CREDIT_PACKS.map((pack) => {
          const perCredit = pack.price / pack.credits;
          const save = Math.round((1 - perCredit / BASE_PRICE) * 100);
          return (
            <div
              key={pack.id}
              data-credit-pack={pack.id}
              className="relative flex flex-col gap-[12px] rounded-[14px] p-[16px] outline outline-1 -outline-offset-1 outline-pqBorder mobile:flex-row mobile:items-center mobile:justify-between"
            >
              {save > 0 && (
                <span className="absolute -top-[9px] end-[14px] flex h-[19px] items-center rounded-full bg-pqOkSoft px-[8px] text-[10px] font-[700] uppercase tracking-[0.05em] text-pqOk">
                  {t('credits_save_percent', 'Save {{percent}}%', {
                    percent: save,
                  })}
                </span>
              )}
              <div className="flex flex-col gap-[4px]">
                <CreditsAmount
                  amount={pack.credits}
                  size={16}
                  className="text-[17px] font-[600] text-pqText"
                />
                <div className="flex items-baseline gap-[6px]">
                  <span className="font-display text-[24px] font-[600] -tracking-[0.02em] text-pqText">
                    ${pack.price}
                  </span>
                  <span className="text-[12.5px] text-pqSoft">
                    {t('credits_per_credit', '${{price}} a credit', {
                      price: perCredit.toFixed(2),
                    })}
                  </span>
                </div>
              </div>
              <Button
                loading={buying === pack.id}
                disabled={!!buying && buying !== pack.id}
                onClick={buy(pack.id)}
                className="!h-[38px] w-full !rounded-[10px] !text-[13.5px] !font-[600] mobile:!w-[96px] mobile:shrink-0"
              >
                {t('credits_buy', 'Buy')}
              </Button>
            </div>
          );
        })}
      </div>

      <WithdrawalWaiver kind="credits" checked={waiver} onChange={setWaiver} />
    </div>
  );
};
