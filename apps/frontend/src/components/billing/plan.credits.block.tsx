'use client';

import { FC, useState } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Skeleton } from '@gitroom/react/ui/skeleton';
import {
  creditEstimates,
  monthlyCredits,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { useCreditPricing } from '@gitroom/frontend/components/billing/use.credits.balance';
import { useViewport } from '@gitroom/frontend/components/layout/use.viewport';

// Whole numbers with the reader's separators: 1,200, not 1200.
const amount = (value: number) => new Intl.NumberFormat().format(value);

const Sparkle = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true">
    <path
      d="M12 3l1.9 4.8 4.8 1.9-4.8 1.9L12 16.4l-1.9-4.8L5.3 9.7l4.8-1.9L12 3ZM18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const InfoIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
    <path
      d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16.2v-4.7M12 7.8h.01"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * The top of a plan's feature list: the credits it adds a month and, under
 * them, roughly what they buy, each on its own (medium images, default
 * videos, plain X posts). Counted on the viewer's own price list, so a
 * subscription sold before v2 sees the numbers it keeps; nothing is shown
 * until that list is known.
 *
 * `card` is the Billing page's plan card (13px muted rows), `checkout` the
 * first checkout's "Included in" list (14px rows). The note on what counts
 * opens from the info button on a pointer, and is a line of its own on touch.
 */
export const PlanCreditsBlock: FC<{
  tier: string;
  size: 'card' | 'checkout';
  tone?: 'brand' | 'lifetime';
}> = ({ tier, size, tone = 'brand' }) => {
  const t = useT();
  const creditPricing = useCreditPricing();
  const { touch } = useViewport();
  const [open, setOpen] = useState(false);

  if (!creditPricing) {
    return (
      <div className="flex flex-col gap-[6px]">
        <Skeleton className="h-[18px] w-[180px]" />
        <Skeleton className="ms-[26px] h-[54px] w-[120px]" />
      </div>
    );
  }

  const credits = monthlyCredits(creditPricing, tier);
  if (!credits) {
    return null;
  }
  const { images, videos, xPosts } = creditEstimates(creditPricing, credits);
  const note = t(
    'plan_credits_note',
    'One balance for AI images, videos, Copilot and X posts. Counts are for the default image quality and video length.'
  );
  const lifetime = tone === 'lifetime';

  return (
    <div data-plan-credits="1" className="flex flex-col">
      <div
        className={clsx(
          'flex items-start gap-[9px]',
          size === 'card'
            ? 'text-[13px] leading-[1.5]'
            : 'text-[14px] leading-[1.5]'
        )}
      >
        <span
          className={clsx(
            'mt-[1px] grid size-[17px] shrink-0 place-items-center rounded-[5px]',
            lifetime ? 'bg-pqLtTick text-pqLtTickFg' : 'bg-pqBrandSoft text-pqFocused'
          )}
        >
          <Sparkle />
        </span>
        <span
          className={clsx(
            'font-[600]',
            lifetime ? 'text-pqLtText' : 'text-pqText'
          )}
        >
          {t('plan_ai_credits_month', '{{amount}} AI credits a month', {
            amount: amount(credits),
          })}
        </span>
        {!touch && (
          <span className="relative flex shrink-0">
            <button
              type="button"
              aria-label={t('plan_credits_about', 'About AI credits')}
              aria-describedby={open ? `plan-credits-${tier}` : undefined}
              onMouseEnter={() => setOpen(true)}
              onMouseLeave={() => setOpen(false)}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              className={clsx(
                'mt-[1px] grid size-[18px] place-items-center rounded-[5px] text-pqSoft',
                open && 'bg-pqHover text-pqText'
              )}
            >
              <InfoIcon />
            </button>
            {open && (
              <span
                id={`plan-credits-${tier}`}
                role="tooltip"
                className="absolute bottom-[calc(100%+9px)] left-1/2 z-[5] w-[252px] -translate-x-1/2 rounded-[8px] bg-pqInner px-[10px] py-[8px] text-start text-[12.5px] font-[400] leading-[1.45] text-pqText shadow-[var(--e2),inset_0_0_0_1px_var(--border)]"
              >
                {note}
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 top-full size-[8px] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-pqInner shadow-[inset_-1px_-1px_0_0_var(--border)]"
                />
              </span>
            )}
          </span>
        )}
      </div>
      <div
        className={clsx(
          'flex flex-col ps-[26px]',
          size === 'card'
            ? 'text-[12.5px] leading-[1.5]'
            : 'text-[13px] font-[500] leading-[1.55]',
          lifetime ? 'text-pqLtText' : 'text-pqMuted'
        )}
      >
        <span>
          {t('plan_credits_images', '≈ {{amount}} AI images', {
            amount: amount(images),
          })}
        </span>
        <span>
          {t('plan_credits_videos', '≈ {{amount}} AI videos', {
            amount: amount(videos),
          })}
        </span>
        <span>
          {t('plan_credits_x_posts', '≈ {{amount}} X posts', {
            amount: amount(xPosts),
          })}
        </span>
        {touch && <span className="mt-[4px] text-pqSoft">{note}</span>}
      </div>
    </div>
  );
};
