'use client';

import { FC } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { ChannelHealth } from '@gitroom/frontend/components/launches/channel.health';

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
