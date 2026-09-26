'use client';

import { FC, useCallback, useMemo } from 'react';
import clsx from 'clsx';
import useSWR from 'swr';
import { useDebounce } from 'use-debounce';
import { useShallow } from 'zustand/react/shallow';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { CreditsAmount } from '@gitroom/frontend/components/billing/credits.amount';
import {
  formatCredits,
  useCreditsBalance,
} from '@gitroom/frontend/components/billing/use.credits.balance';

interface PublishCredits {
  /** What publishing these posts costs, in credits. */
  credits: number;
  /** What of it the balance still has to cover. */
  needed: number;
  channels: { integration: string; credits: number }[];
}

type PublishCreditsPost = {
  integration: { id: string };
  settings: Record<string, unknown>;
  value: { id?: string; content: string }[];
};

/**
 * What the posts being written will cost from the credits balance, priced
 * by the server as the text changes (a link can cost more than a plain
 * post). Nothing with billing off.
 */
export const usePublishCredits = (posts: PublishCreditsPost[]) => {
  const fetch = useFetch();
  const { billingEnabled } = useVariables();
  const [body] = useDebounce(JSON.stringify({ type: 'schedule', posts }), 400);
  const load = useCallback(
    async ([, payload]: [string, string]): Promise<PublishCredits> => {
      const response = await fetch('/posts/credits', {
        method: 'POST',
        body: payload,
      });
      if (!response.ok) {
        throw new Error('Could not price this post');
      }
      return response.json();
    },
    [fetch]
  );
  // The key follows every keystroke: the last price stays up while the next
  // one is asked for, instead of blinking out.
  return useSWR(
    billingEnabled && posts.length ? ['publish-credits', body] : null,
    load,
    { keepPreviousData: true, revalidateOnFocus: false }
  );
};

/**
 * Next to Schedule: what the selected channels will take from the credits
 * balance when the post is scheduled, and a warning when the balance cannot
 * cover it. Only for networks that bill per post. `row` sits with the
 * date and the other options where the footer is stacked, `explain` adds
 * what the tooltip says where there is no pointer to hover with.
 */
export const ComposeCredits: FC<{
  variant?: 'chip' | 'row';
  explain?: boolean;
}> = ({ variant = 'chip', explain = false }) => {
  const t = useT();
  const { global, internal, selectedIntegrations } = useLaunchStore(
    useShallow((state) => ({
      global: state.global,
      internal: state.internal,
      selectedIntegrations: state.selectedIntegrations,
    }))
  );

  const posts = useMemo(
    () =>
      selectedIntegrations.map(({ integration, settings }) => {
        const custom = internal.find(
          (i) => i.integration.id === integration.id
        )?.integrationValue;
        return {
          integration: { id: integration.id },
          settings: { ...(settings || {}), __type: integration.identifier },
          value: (custom?.length ? custom : global).map((v) => ({
            id: v.id,
            content: v.content,
          })),
        };
      }),
    [global, internal, selectedIntegrations]
  );

  const { data } = usePublishCredits(posts);
  const { data: balance } = useCreditsBalance();

  if (!data?.credits) {
    return null;
  }

  const short =
    !!balance && !balance.unlimited && (balance.balance ?? 0) < data.needed;
  const perChannel = data.channels
    .map(({ integration, credits }) => {
      const name = selectedIntegrations.find(
        (s) => s.integration.id === integration
      )?.integration.name;
      return name ? `${name}: ${formatCredits(credits)}` : '';
    })
    .filter(Boolean)
    .join(', ');

  const hint = t(
    'publish_credits_hint',
    'Set aside from your credits when the post is scheduled, and given back if it is deleted or saved as a draft. A post with a link can cost more.'
  );

  const label = short
    ? t('publish_credits_short', 'Not enough credits')
    : t('publish_credits_to_publish', 'to publish');

  if (variant === 'row') {
    return (
      <div
        data-pq="composer-credits"
        data-short={short ? '1' : undefined}
        className={clsx(
          'flex min-h-[44px] w-full flex-col items-center justify-center gap-[2px] rounded-[10px] border px-[12px] py-[8px] text-center',
          short
            ? 'border-pqWarnLine bg-pqWarnSoft text-pqWarn'
            : 'border-pqLine text-pqText'
        )}
      >
        <div className="flex items-center gap-[6px] text-[15px] font-[600]">
          <CreditsAmount amount={data.credits} />
          <span>{label}</span>
        </div>
        {explain && (
          <div
            className={clsx(
              'text-[12.5px] leading-[1.45]',
              short ? 'text-pqWarn' : 'text-pqMuted'
            )}
          >
            {hint}
          </div>
        )}
      </div>
    );
  }

  // Compact, so the footer keeps its room: the coin and the amount, the
  // rest in the tooltip and for screen readers.
  return (
    <div
      data-pq="composer-credits"
      data-short={short ? '1' : undefined}
      data-tooltip-id="tooltip"
      data-tooltip-content={[
        short ? t('publish_credits_short', 'Not enough credits') + '.' : '',
        hint,
        perChannel ? `(${perChannel})` : '',
      ]
        .filter(Boolean)
        .join(' ')}
      className={clsx(
        'flex h-[32px] shrink-0 items-center rounded-[8px] border px-[10px] text-[13px] font-[600]',
        short
          ? 'border-pqWarnLine bg-pqWarnSoft text-pqWarn'
          : 'border-pqLine text-pqSoft'
      )}
    >
      <CreditsAmount amount={data.credits} />
      <span className="sr-only">{label}</span>
    </div>
  );
};
