'use client';

import { FC } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export type ChannelHealth = {
  /** Channels the rule targets. For an "all channels" rule this is every channel. */
  total: number;
  /** Of those, how many can actually publish right now. */
  healthy: number;
};

/**
 * Mirrors the server-side filter in AutopostsService.startAutopost, which skips
 * disabled, reconnect-needed and half-connected channels. A rule whose channels
 * have all gone that way still shows its toggle "on" and still answers "RSS
 * valid!" to Test connection, because that only checks the feed. This is the
 * only place the row can say it is not actually running.
 */
export const computeChannelHealth = (
  savedIds: string[],
  all: any[]
): ChannelHealth => {
  // No channel list, no verdict. useIntegrationList answers `[]` from
  // fallbackData while /integrations/list is in flight — and that request is
  // the slower of the two the page makes — so measuring against it flashed
  // "Not running" on every healthy rule at every page load, and made it stick
  // if the request failed.
  if (!all?.length) {
    return { total: 0, healthy: 0 };
  }

  const usable = all.filter(
    (f: any) => !f?.disabled && !f?.refreshNeeded && !f?.inBetweenSteps
  );

  // An empty saved list means "all channels" — both here and in startAutopost.
  // Such a rule is not degraded because one unrelated channel is off: it fires
  // for whatever is connected, which is what it says it does. Only report when
  // there is nothing left for it to act on at all.
  if (!savedIds.length) {
    return usable.length
      ? { total: 0, healthy: 0 }
      : { total: all.length, healthy: 0 };
  }

  const usableIds = new Set(usable.map((f: any) => f.id));
  return {
    total: savedIds.length,
    healthy: savedIds.filter((id) => usableIds.has(id)).length,
  };
};

export const ChannelHealthBadge: FC<{ health: ChannelHealth }> = ({
  health,
}) => {
  const t = useT();
  const { total, healthy } = health;

  // Nothing to report while the channel list is still loading, or when every
  // targeted channel is fine.
  if (!total || healthy === total) {
    return null;
  }

  const dead = healthy === 0;

  return (
    <span
      data-tooltip-id="tooltip"
      data-tooltip-content={
        dead
          ? t(
              'rule_not_running_tip',
              'None of this rule’s channels can publish. Reconnect them, or pick different ones.'
            )
          : t(
              'rule_degraded_tip',
              'Some of this rule’s channels cannot publish right now.'
            )
      }
      className={clsx(
        'shrink-0 rounded-full px-[7px] py-[2px] text-[10.5px] font-[700] uppercase tracking-[0.02em]',
        dead ? 'bg-pqDanger text-pqOnBrand' : 'bg-pqWarn text-pqOnBrand'
      )}
    >
      {dead
        ? t('rule_not_running', 'Not running')
        : t('rule_channels_of', '{n}/{m} channels')
            .replace('{n}', String(healthy))
            .replace('{m}', String(total))}
    </span>
  );
};
