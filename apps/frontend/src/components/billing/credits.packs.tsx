'use client';

import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@gitroom/react/form/button';
import { Skeleton } from '@gitroom/react/ui/skeleton';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { fromUtc } from '@gitroom/frontend/components/layout/set.timezone';
import {
  CREDIT_PACK_MONTHS,
  CREDIT_PACKS,
  CreditPackId,
  creditEstimates,
  CURRENT_CREDIT_PRICING,
  monthlyCredits,
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
 * The terms a plan or a credits pack is bought on, next to every way of
 * paying for one. A consumer keeps the right to withdraw: nothing asks them to
 * give it up. Only where this deployment publishes terms (see register.tsx).
 */
export const PurchaseTerms: FC = () => {
  const t = useT();
  const { legalUrl } = useVariables();
  if (!legalUrl) {
    return null;
  }
  return (
    <div
      data-pq="purchase-terms"
      className="text-[12.5px] leading-[1.5] text-pqMuted"
    >
      {t('purchase_terms_agree', 'By paying you agree to our')}{' '}
      <a
        href={`${legalUrl}/terms-of-service`}
        target="_blank"
        rel="nofollow noopener noreferrer"
        className="text-pqText underline"
      >
        {t('terms_of_service', 'Terms of Service')}
      </a>
      .{' '}
      {t(
        'purchase_terms_withdrawal',
        'If you are a consumer in the EU, the EEA or the UK, you can withdraw within 14 days and get a full refund.',
      )}
    </div>
  );
};

// What a credit costs in the smallest pack, which the larger ones save on.
const BASE_PRICE = CREDIT_PACKS[0].price / CREDIT_PACKS[0].credits;

/** The card's shape while the balance loads: header, divider, the packs. */
const CreditsPacksGhost: FC = () => (
  <div className="flex flex-col gap-[18px] rounded-[16px] bg-pqInner p-[20px_22px] outline outline-1 -outline-offset-1 outline-pqBorder">
    <div className="flex items-start gap-[14px]">
      <Skeleton className="size-[38px] shrink-0 !rounded-[12px]" />
      <div className="flex flex-1 flex-col gap-[8px] pt-[3px]">
        <Skeleton className="h-[18px] w-[90px]" />
        <Skeleton className="h-[13px] w-full max-w-[380px]" />
      </div>
      <Skeleton className="h-[29px] w-[130px] shrink-0 mobile:hidden" />
    </div>
    <div className="h-[1px] bg-pqLine" />
    <div className="flex flex-col gap-[6px]">
      <Skeleton className="h-[14px] w-[130px]" />
      <Skeleton className="h-[12.5px] w-full max-w-[420px]" />
    </div>
    <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-[11px]">
      {CREDIT_PACKS.map((pack) => (
        <Skeleton
          key={pack.id}
          className="h-[166px] !rounded-[14px] mobile:h-[100px]"
        />
      ))}
    </div>
  </div>
);

/**
 * The Billing page's credits: the balance, when the soonest of it runs out,
 * and the packs that top it up. Nothing for an unlimited balance.
 */
export const CreditsPacksCard: FC<{ tier?: string; period?: string }> = ({
  tier,
  period,
}) => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const router = useRouter();
  const pathname = usePathname();
  const queryParams = useSearchParams();
  const { data, isLoading, mutate } = useCreditsBalance();
  const [buying, setBuying] = useState<CreditPackId | null>(null);

  // Back from Stripe. The credits come with the webhook, which can land a
  // moment after this page does, so the balance is read again shortly after.
  // Announced once, and the flag leaves the address so a reload does not
  // announce it again; the reads outlive that, until the page is left.
  const purchased = queryParams.get('credits') === 'purchased';
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    if (!purchased) {
      return;
    }
    toast.show(
      t(
        'credits_purchased',
        'Payment received. Your credits will show up in a moment.',
      ),
    );
    timers.current = [3000, 8000].map((ms) => setTimeout(() => mutate(), ms));
    router.replace(pathname, { scroll: false });
  }, [purchased, mutate, toast, t, router, pathname]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Back from Stripe with the browser's back button, the page can come out of
  // the cache as it was left: mid-purchase, every Buy button disabled.
  useEffect(() => {
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setBuying(null);
      }
    };
    window.addEventListener('pageshow', restored);
    return () => window.removeEventListener('pageshow', restored);
  }, []);

  const buy = useCallback(
    (pack: CreditPackId) => async () => {
      setBuying(pack);
      try {
        const response = await fetch('/billing/credits/checkout', {
          method: 'POST',
          body: JSON.stringify({ pack }),
        });
        const body = await response.json().catch(() => ({}) as any);
        if (response.ok && body?.url) {
          window.location.href = body.url;
          return;
        }
        // A refusal says why ("Choose a plan before buying credits."); a
        // server error says nothing worth showing.
        toast.show(
          response.status < 500 && typeof body?.message === 'string'
            ? body.message
            : t(
                'credits_checkout_failed',
                'We could not start the checkout, please try again',
              ),
          'warning',
        );
        setBuying(null);
      } catch (err) {
        setBuying(null);
        toast.show(
          t(
            'credits_checkout_failed',
            'We could not start the checkout, please try again',
          ),
          'warning',
        );
      }
    },
    [fetch, toast, t],
  );

  // Billing off never reaches this page (BillingComponent says so instead),
  // and an unlimited balance has nothing to top up.
  if (data?.unlimited) {
    return null;
  }
  if (isLoading && !data) {
    return <CreditsPacksGhost />;
  }

  // The plan's credits on the organization's own list: a subscription keeps
  // the one it started with.
  const creditPricing = data?.creditPricing ?? CURRENT_CREDIT_PRICING;
  const planCredits = tier ? monthlyCredits(creditPricing, tier) : 0;

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
                    'AI features (Copilot, writing, images and videos) and activity on X spend credits. Your plan adds {{amount}} each year.',
                    { amount: planCredits * 12 },
                  )
                : t(
                    'credits_card_sub',
                    'AI features (Copilot, writing, images and videos) and activity on X spend credits. Your plan adds {{amount}} each month.',
                    { amount: planCredits },
                  )
              : t(
                  'credits_card_sub_plain',
                  'AI features (Copilot, writing, images and videos) and activity on X spend credits.',
                )}
          </div>
        </div>
        {!!data && (
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
                {t(
                  'credits_expiring',
                  '{{amount}} of them expire on {{date}}',
                  {
                    amount: formatCredits(data.expiring.amount),
                    date: fromUtc(data.expiring.at).format('D MMM, YYYY'),
                  },
                )}
              </div>
            )}
          </div>
        )}
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
            { months: CREDIT_PACK_MONTHS },
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
                {/* Roughly what the pack buys on the organization's list,
                    each on its own; two lines where the row is narrow. */}
                <div className="flex text-[12.5px] leading-[1.45] text-pqMuted mobile:flex-col">
                  <span>
                    {t('plan_credits_images', '≈ {{amount}} AI images', {
                      amount: new Intl.NumberFormat().format(
                        creditEstimates(creditPricing, pack.credits).images
                      ),
                    })}
                  </span>
                  <span aria-hidden="true" className="px-[5px] mobile:hidden">
                    ·
                  </span>
                  <span>
                    {t('plan_credits_videos', '≈ {{amount}} AI videos', {
                      amount: new Intl.NumberFormat().format(
                        creditEstimates(creditPricing, pack.credits).videos
                      ),
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

      <PurchaseTerms />
    </div>
  );
};
