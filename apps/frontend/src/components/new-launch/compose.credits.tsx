'use client';

import { FC, useCallback } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { channelPlatformLabel } from '@gitroom/frontend/components/new-launch/channel.avatar';
import {
  CreditsIcon,
  useCanOpenBilling,
} from '@gitroom/frontend/components/billing/credits.amount';
import {
  formatCredits,
  useCreditsBalance,
} from '@gitroom/frontend/components/billing/use.credits.balance';

interface PublishCreditsQuote {
  /** What publishing these posts costs, in credits. */
  credits: number;
  /** What of it the balance still has to cover. */
  needed: number;
  channels: {
    integration: string;
    /** The channel's network. */
    identifier: string;
    credits: number;
    /** Its posts priced as a post with a link. */
    links: number;
    /** The network's price for a plain post and for one with a link. */
    rates: { post: number; link: number };
  }[];
}

type PublishCreditsPost = {
  integration: { id: string };
  settings: Record<string, unknown>;
  value: { id?: string; content: string }[];
};

const PublishCreditsTitle: FC<{ needed: number }> = ({ needed }) => {
  const t = useT();
  const { data: balance } = useCreditsBalance();
  const short =
    !!balance && !balance.unlimited && (balance.balance ?? 0) < needed;
  return (
    <>
      {short
        ? t('publish_credits_short', 'Not enough credits')
        : t('publish_credits_confirm_title', 'Publishing uses credits')}
    </>
  );
};

/**
 * Before a post that a network bills goes out: what it takes from the
 * credits balance, what is left after, and why, in one line. With too few
 * credits it offers Billing instead of the save.
 */
const PublishCreditsConfirm: FC<{
  quote: PublishCreditsQuote;
  confirmLabel: string;
  resolution: (value: boolean) => void;
}> = ({ quote, confirmLabel, resolution }) => {
  const t = useT();
  const canOpenBilling = useCanOpenBilling();
  const { data: balance } = useCreditsBalance();
  const known = !!balance && !balance.unlimited;
  const current = balance?.balance ?? 0;
  const short = known && current < quote.needed;

  // Said with both prices only when a link is what made this post dearer.
  const linked = quote.channels.find(
    (channel) => channel.links && channel.rates.link > channel.rates.post
  );
  const network = channelPlatformLabel(
    (linked || quote.channels[0])?.identifier || ''
  );

  return (
    <div className="flex flex-col gap-[16px]" data-pq="publish-credits-confirm">
      <div
        className={clsx(
          'flex items-center gap-[14px] rounded-[16px] p-[16px_18px]',
          short ? 'bg-pqWarnSoft' : 'bg-pqBrandSoft'
        )}
      >
        <span
          className={clsx(
            'grid size-[44px] shrink-0 place-items-center rounded-[12px] bg-pqInner',
            short ? 'text-pqWarn' : 'text-pqBrand'
          )}
        >
          <CreditsIcon size={22} />
        </span>
        <div className="flex min-w-0 flex-col gap-[4px]">
          <div className="text-[20px] font-[600] leading-tight text-pqText">
            {t('n_credits_amount', '{{amount}} credits', {
              amount: formatCredits(quote.needed),
            })}
          </div>
          {known && (
            <div
              className={clsx(
                'text-[13px] leading-[1.45]',
                short ? 'text-pqWarn' : 'text-pqMuted'
              )}
            >
              {short
                ? t(
                    'publish_credits_short_body',
                    'Your balance is {{balance}}.',
                    { balance: formatCredits(current) }
                  )
                : t(
                    'publish_credits_balance_after',
                    'Balance after: {{amount}}',
                    {
                      amount: formatCredits(
                        Math.round((current - quote.needed) * 100) / 100
                      ),
                    }
                  )}
            </div>
          )}
        </div>
      </div>

      {!!network && (
        <div className="text-[13.5px] leading-[1.55] text-pqMuted">
          {linked
            ? t(
                'publish_credits_why_link',
                '{{network}} charges PostQueen for every post published through its API, and far more for a post with a link: {{link}} credits instead of {{post}}.',
                {
                  network,
                  link: formatCredits(linked.rates.link),
                  post: formatCredits(linked.rates.post),
                }
              )
            : t(
                'publish_credits_why',
                '{{network}} charges PostQueen for every post published through its API.',
                { network }
              )}
        </div>
      )}

      <div className="flex flex-col gap-[10px] sm:flex-row">
        {!short && (
          <button
            type="button"
            data-pq="publish-credits-approve"
            // The composer's own button is disabled while this is open, so
            // the keyboard starts here rather than at the top of the page.
            autoFocus
            onClick={() => resolution(true)}
            className="h-[46px] min-h-[44px] min-w-[112px] cursor-pointer rounded-[12px] border-0 bg-pqBrand px-[24px] text-[14.5px] font-[600] text-pqOnBrand transition-[filter] hover:brightness-110"
          >
            {confirmLabel}
          </button>
        )}
        {short && canOpenBilling && (
          <Link
            href="/billing"
            target="_blank"
            rel="noopener noreferrer"
            autoFocus
            className="flex h-[46px] min-h-[44px] min-w-[112px] items-center justify-center rounded-[12px] bg-pqBrand px-[24px] text-[14.5px] font-[600] text-pqOnBrand transition-[filter] hover:brightness-110"
          >
            {t('get_more_credits', 'Get more credits')}
          </Link>
        )}
        <button
          type="button"
          onClick={() => resolution(false)}
          className="h-[46px] min-h-[44px] min-w-[112px] cursor-pointer rounded-[12px] border-0 bg-pqBtnSimple px-[24px] text-[14.5px] font-[600] text-pqText transition-shadow hover:shadow-[inset_0_0_0_999px_var(--hover)]"
        >
          {short ? t('back', 'Back') : t('cancel', 'Cancel')}
        </button>
      </div>
    </div>
  );
};

/**
 * Asks before a save that sets credits aside: prices the posts as they are
 * about to be saved and, when the balance has to cover something, shows what
 * and why. Resolves true to go ahead. Nothing is asked with billing off, for
 * a draft, or when the price cannot be read: the save is checked again
 * server-side, and a short balance still refuses it there.
 */
export const usePublishCreditsConfirm = () => {
  const fetch = useFetch();
  const { openModal, closeById } = useModals();
  const { billingEnabled } = useVariables();

  return useCallback(
    async (params: {
      type: 'draft' | 'now' | 'schedule' | 'update';
      posts: PublishCreditsPost[];
      /** The button that saves, which the dialog's own repeats. */
      confirmLabel: string;
    }) => {
      if (!billingEnabled || params.type === 'draft') {
        return true;
      }
      const response = await fetch('/posts/credits', {
        method: 'POST',
        body: JSON.stringify({ type: params.type, posts: params.posts }),
      }).catch((): null => null);
      const quote: PublishCreditsQuote | null = response?.ok
        ? await response.json().catch((): null => null)
        : null;
      if (!quote?.needed || !Array.isArray(quote.channels)) {
        return true;
      }

      return new Promise<boolean>((resolve) => {
        const id = makeId(20);
        let settled = false;
        const finish = (value: boolean) => {
          if (settled) {
            return;
          }
          settled = true;
          resolve(value);
          // As the Are you sure? dialog does: on a microtask, so the click
          // that answered cannot land on the composer under it.
          queueMicrotask(() => closeById(id));
        };
        openModal({
          id,
          title: <PublishCreditsTitle needed={quote.needed} />,
          compact: 460,
          askClose: false,
          onClose: () => finish(false),
          children: (
            <PublishCreditsConfirm
              quote={quote}
              confirmLabel={params.confirmLabel}
              resolution={finish}
            />
          ),
        });
      });
    },
    [billingEnabled, fetch, openModal, closeById]
  );
};
