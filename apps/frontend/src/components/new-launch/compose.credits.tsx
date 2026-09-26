'use client';

import { FC, ReactNode, useCallback } from 'react';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { CrownGlyph } from '@gitroom/frontend/components/ui/logo.component';
import {
  ChannelAvatar,
  channelPlatformLabel,
} from '@gitroom/frontend/components/new-launch/channel.avatar';
import {
  CreditsAmount,
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
    credits: number;
    /** Its posts that are billed, and of them, those priced with a link. */
    posts: number;
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

type PublishCreditsChannel = {
  id: string;
  name?: string;
  picture?: string | null;
  identifier: string;
};

const round = (credits: number) => Math.round(credits * 100) / 100;

const LinkIcon: FC = () => (
  <svg
    viewBox="0 0 16 16"
    width="13"
    height="13"
    fill="none"
    aria-hidden="true"
    className="shrink-0"
  >
    <path
      d="M6.7 9.3a2.6 2.6 0 0 0 3.7 0l2.2-2.2a2.6 2.6 0 0 0-3.7-3.7l-.9.9M9.3 6.7a2.6 2.6 0 0 0-3.7 0L3.4 8.9a2.6 2.6 0 0 0 3.7 3.7l.9-.9"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

const InfoIcon: FC = () => (
  <svg
    viewBox="0 0 16 16"
    width="14"
    height="14"
    fill="none"
    aria-hidden="true"
    className="mt-[2px] shrink-0"
  >
    <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.4" />
    <path
      d="M8 7.2v3.6M8 5.2v.1"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

const ArrowIcon: FC = () => (
  <svg
    viewBox="0 0 16 16"
    width="12"
    height="12"
    fill="none"
    aria-hidden="true"
    className="shrink-0 rtl:rotate-180"
  >
    <path
      d="M3 8h9.5M9 4.5 12.5 8 9 11.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** One line of a channel's breakdown: what kind of post, how many, and their price. */
const BreakdownRow: FC<{
  label: string;
  count: number;
  amount: number;
  link?: boolean;
}> = ({ label, count, amount, link }) => (
  <div className="flex items-center gap-[6px]">
    {link && (
      <span className="text-pqAmber">
        <LinkIcon />
      </span>
    )}
    <span>{label}</span>
    <span className="text-pqSoft">×{count}</span>
    <span className="ms-auto tabular-nums">{formatCredits(round(amount))}</span>
  </div>
);

/** A network's price for one kind of post, marked when this post has some. */
const RateCard: FC<{
  label: string;
  amount: number;
  used: boolean;
  link?: boolean;
}> = ({ label, amount, used, link }) => {
  const t = useT();
  return (
    <div
      className={clsx(
        'flex min-w-0 flex-col gap-[6px] rounded-[12px] bg-pqInner p-[10px_12px] outline outline-1 -outline-offset-1',
        used
          ? link
            ? 'outline-pqAmberLine'
            : 'outline-pqBrand'
          : 'outline-pqBorder'
      )}
    >
      <div
        className={clsx(
          'flex items-center gap-[5px] text-[12.5px]',
          link ? 'text-pqAmber' : 'text-pqMuted'
        )}
      >
        {link && <LinkIcon />}
        <span className="truncate">{label}</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-[6px]">
        <CreditsAmount
          amount={amount}
          size={15}
          className="text-[18px] font-[600] text-pqText"
        />
        {used && (
          <span
            className={clsx(
              'rounded-full px-[7px] py-[1px] text-[10.5px] font-[700] uppercase tracking-[0.04em]',
              link
                ? 'bg-pqAmberSoft text-pqAmber'
                : 'bg-pqBrandSoft text-pqBrand'
            )}
          >
            {t('publish_credits_in_post', 'In this post')}
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * Why posting to a network uses credits, drawn: every post PostQueen sends
 * through the network's API is billed, and where a link changes the price,
 * both prices side by side.
 */
const WhyCredits: FC<{
  identifier: string;
  rates: { post: number; link: number };
  plain: boolean;
  links: boolean;
}> = ({ identifier, rates, plain, links }) => {
  const t = useT();
  const network = channelPlatformLabel(identifier);
  const linkPriced = rates.link > rates.post;
  return (
    <div className="flex flex-col gap-[12px] rounded-[14px] bg-pqTableHeader p-[14px_16px]">
      <div className="text-[13.5px] font-[600] text-pqText">
        {t('publish_credits_why_title', 'Why {{network}} posts use credits', {
          network,
        })}
      </div>
      <div className="flex flex-col gap-[6px]" aria-hidden="true">
        <div className="flex items-center gap-[10px]">
          <span className="grid size-[36px] shrink-0 place-items-center rounded-[8px] bg-pqBrand">
            <CrownGlyph className="size-[20px] text-pqOnBrand" />
          </span>
          <span className="relative flex flex-1 items-center">
            <span className="h-0 flex-1 border-t-[1.5px] border-dashed border-pqBorder" />
            <span className="text-pqSoft">
              <ArrowIcon />
            </span>
            <span className="absolute inset-x-0 flex justify-center">
              <span className="flex items-center gap-[4px] rounded-full bg-pqInner px-[8px] py-[2px] text-[11.5px] font-[600] text-pqAmber outline outline-1 -outline-offset-1 outline-pqAmberLine">
                <CreditsIcon size={12} />
                {t('publish_credits_flow_per_post', 'per post')}
              </span>
            </span>
          </span>
          <ChannelAvatar
            integration={{ identifier }}
            size={36}
            badge={false}
            className="rounded-[8px] outline outline-1 -outline-offset-1 outline-pqBorder"
          />
        </div>
        <div className="flex justify-between text-[11.5px] text-pqSoft">
          <span>PostQueen</span>
          <span>
            {t('publish_credits_flow_api', '{{network}} API', { network })}
          </span>
        </div>
      </div>
      <div className="text-[13px] leading-[1.55] text-pqMuted">
        {linkPriced
          ? t(
              'publish_credits_why_link',
              '{{network}} charges PostQueen for every post published through its API, and far more for a post that carries a link. Credits cover that cost.',
              { network }
            )
          : t(
              'publish_credits_why',
              '{{network}} charges PostQueen for every post published through its API. Credits cover that cost.',
              { network }
            )}
      </div>
      {linkPriced && (
        <div className="grid grid-cols-2 gap-[8px]">
          <RateCard
            label={t('publish_credits_row_post', 'Post')}
            amount={rates.post}
            used={plain}
          />
          <RateCard
            label={t('publish_credits_row_link', 'Post with a link')}
            amount={rates.link}
            used={links}
            link
          />
        </div>
      )}
    </div>
  );
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
 * credits balance, per channel, why, and the balance after. With too few
 * credits it offers Billing instead of the save.
 */
const PublishCreditsConfirm: FC<{
  quote: PublishCreditsQuote;
  channels: PublishCreditsChannel[];
  confirmLabel: string;
  repeats: boolean;
  resolution: (value: boolean) => void;
}> = ({ quote, channels, confirmLabel, repeats, resolution }) => {
  const t = useT();
  const canOpenBilling = useCanOpenBilling();
  const { data: balance } = useCreditsBalance();
  const known = !!balance && !balance.unlimited;
  const current = balance?.balance ?? 0;
  const short = known && current < quote.needed;
  const held = round(quote.credits - quote.needed);

  // One explanation per network, with the prices of its first channel.
  const identifierOf = (integration: string) =>
    channels.find((c) => c.id === integration)?.identifier || '';
  const networks = [
    ...new Set(
      quote.channels.map((c) => identifierOf(c.integration)).filter(Boolean)
    ),
  ].map((identifier) => {
    const own = quote.channels.filter(
      (c) => identifierOf(c.integration) === identifier
    );
    return {
      identifier,
      rates: own[0].rates,
      plain: own.some((c) => c.posts > c.links),
      links: own.some((c) => c.links > 0),
    };
  });

  let lead: ReactNode = t(
    'publish_credits_confirm_lead',
    'Set aside from your balance for this post now.'
  );
  if (short) {
    lead = t(
      'publish_credits_short_body',
      'This post needs {{needed}} credits and your balance is {{balance}}.',
      { needed: formatCredits(quote.needed), balance: formatCredits(current) }
    );
  } else if (held > 0) {
    lead = t(
      'publish_credits_confirm_lead_more',
      'More set aside for this change, on top of the {{amount}} this post already holds.',
      { amount: formatCredits(held) }
    );
  }

  return (
    <div className="flex flex-col gap-[16px]" data-pq="publish-credits-confirm">
      <div
        className={clsx(
          'flex flex-wrap items-center gap-x-[14px] gap-y-[12px] rounded-[16px] p-[16px_18px]',
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
        <div className="flex min-w-[160px] flex-1 flex-col gap-[4px]">
          {/* `!`: a compact modal sizes every font-display inside it for its
              title. */}
          <div className="font-display !text-[30px] font-[600] leading-none -tracking-[0.02em] text-pqText">
            <span aria-hidden="true">{formatCredits(quote.needed)}</span>
            <span className="sr-only">
              {t('n_credits_amount', '{{amount}} credits', {
                amount: formatCredits(quote.needed),
              })}
            </span>
          </div>
          <div
            className={clsx(
              'text-[13px] leading-[1.45]',
              short ? 'text-pqWarn' : 'text-pqMuted'
            )}
          >
            {lead}
          </div>
        </div>
        {known && !short && (
          <div className="flex flex-col gap-[2px] text-[12.5px] text-pqMuted">
            <span>{t('publish_credits_balance', 'Your balance')}</span>
            <span className="flex items-center gap-[6px] text-[14px] font-[600] tabular-nums text-pqText">
              {formatCredits(current)}
              <span className="text-pqSoft">
                <ArrowIcon />
              </span>
              {formatCredits(round(current - quote.needed))}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col divide-y divide-pqLine rounded-[14px] outline outline-1 -outline-offset-1 outline-pqBorder">
        {quote.channels.map((channel) => {
          const integration = channels.find(
            (c) => c.id === channel.integration
          );
          if (!integration) {
            return null;
          }
          const plain = channel.posts - channel.links;
          return (
            <div
              key={channel.integration}
              className="flex flex-col gap-[6px] p-[12px_14px]"
            >
              <div className="flex items-center gap-[10px]">
                <ChannelAvatar integration={integration} size={28} />
                <span className="min-w-0 flex-1 truncate text-[14px] font-[600] text-pqText">
                  {integration.name}
                </span>
                <CreditsAmount
                  amount={channel.credits}
                  className="text-[14px] font-[600] text-pqText"
                />
              </div>
              <div className="flex flex-col gap-[3px] ps-[38px] text-[12.5px] text-pqMuted">
                {plain > 0 && (
                  <BreakdownRow
                    label={t('publish_credits_row_post', 'Post')}
                    count={plain}
                    amount={plain * channel.rates.post}
                  />
                )}
                {channel.links > 0 && (
                  <BreakdownRow
                    label={t('publish_credits_row_link', 'Post with a link')}
                    count={channel.links}
                    amount={channel.links * channel.rates.link}
                    link
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {networks.map((network) => (
        <WhyCredits key={network.identifier} {...network} />
      ))}

      <div className="flex gap-[8px] text-[12.5px] leading-[1.5] text-pqMuted">
        <InfoIcon />
        <span>
          {t(
            'publish_credits_returned',
            'Used when the post publishes. Delete it or move it to drafts and the credits come back.'
          )}
          {repeats &&
            ' ' +
              t(
                'publish_credits_repeats',
                'It repeats: each run sets aside the same again before it goes out.'
              )}
        </span>
      </div>

      {/* Kept in view while the rest scrolls on a short screen. */}
      <div className="sticky bottom-0 flex flex-col gap-[10px] bg-pqInner pt-[4px] sm:flex-row">
        {!short && (
          <button
            type="button"
            data-pq="publish-credits-approve"
            onClick={() => resolution(true)}
            className="h-[46px] min-h-[44px] min-w-[112px] cursor-pointer rounded-[12px] border-0 bg-pqBrand px-[24px] text-[14.5px] font-[600] text-pqOnBrand transition-[filter] hover:brightness-110"
          >
            {confirmLabel}
          </button>
        )}
        {short && canOpenBilling && (
          <a
            href="/billing"
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-[46px] min-h-[44px] min-w-[112px] items-center justify-center rounded-[12px] bg-pqBrand px-[24px] text-[14.5px] font-[600] text-pqOnBrand transition-[filter] hover:brightness-110"
          >
            {t('get_more_credits', 'Get more credits')}
          </a>
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
  const t = useT();
  const fetch = useFetch();
  const { openModal, closeById } = useModals();
  const { billingEnabled } = useVariables();

  return useCallback(
    async (params: {
      type: 'draft' | 'now' | 'schedule' | 'update';
      posts: PublishCreditsPost[];
      channels: PublishCreditsChannel[];
      repeats: boolean;
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

      const confirmLabel =
        params.type === 'now'
          ? t('post_now', 'Post Now')
          : params.type === 'update'
          ? t('update', 'Update')
          : t('schedule', 'Schedule');

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
              channels={params.channels}
              confirmLabel={confirmLabel}
              repeats={params.repeats}
              resolution={finish}
            />
          ),
        });
      });
    },
    [billingEnabled, fetch, openModal, closeById, t]
  );
};
