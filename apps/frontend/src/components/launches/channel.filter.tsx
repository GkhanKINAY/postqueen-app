'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useClickOutside } from '@mantine/hooks';
import {
  useCalendar,
} from '@gitroom/frontend/components/launches/calendar.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import { useAnchoredPopover } from '@gitroom/frontend/components/layout/use.anchored.popover';
import { ChannelPickList } from '@gitroom/frontend/components/launches/channel.pick.list';

/**
 * Design chromeVals chanFilter — multi-select channels for the calendar grid
 * and posts panel. Empty selection means all channels.
 */
export const ChannelFilter: FC = () => {
  const t = useT();
  const { integrations, channelFilter, setChannelFilter } = useCalendar();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  // Trailing-edge toolbar control — prefer end alignment, flip/shift if needed.
  const { referenceRef, floatingRef } = useAnchoredPopover<
    HTMLButtonElement,
    HTMLDivElement
  >(open, 'end');

  const active = channelFilter.length > 0;

  const toggle = useCallback(
    (id: string) => {
      if (channelFilter.includes(id)) {
        setChannelFilter(channelFilter.filter((x) => x !== id));
        return;
      }
      setChannelFilter([...channelFilter, id]);
    },
    [channelFilter, setChannelFilter]
  );

  const selectAll = useCallback(
    (visible: any[]) => {
      // Union, not replace: with a search active, replacing threw away every
      // channel the search happened to hide.
      setChannelFilter([
        ...channelFilter,
        ...visible
          .map((i) => i.id)
          .filter((id) => !channelFilter.includes(id)),
      ]);
    },
    [channelFilter, setChannelFilter]
  );

  const clear = useCallback(() => {
    setChannelFilter([]);
  }, [setChannelFilter]);

  const stack = useMemo(
    () =>
      channelFilter
        .map((id) => integrations.find((i) => i.id === id))
        .filter(Boolean)
        .slice(0, 3),
    [channelFilter, integrations]
  );

  if (!integrations?.length) {
    return null;
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        ref={referenceRef}
        data-pq="channel-filter"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'flex h-[32px] items-center gap-[8px] rounded-pqSm border px-[10px] text-[13px] font-[500] transition-colors',
          active || open
            ? 'border-pqBrand bg-pqBrandSoft text-pqFocused'
            : 'border-pqBorder bg-transparent text-pqMuted hover:border-pqBrand'
        )}
      >
        {active ? (
          <span className="flex items-center">
            {stack.map((integration: any, index) => (
              <span
                key={integration.id}
                className="relative size-[18px] overflow-hidden rounded-[5px] border border-pqInner"
                style={{ marginInlineStart: index ? -6 : 0, zIndex: 3 - index }}
              >
                <ImageWithFallback
                  fallbackSrc={`/icons/platforms/${integration.identifier}.png`}
                  src={integration.picture || '/no-picture.jpg'}
                  alt=""
                  width={18}
                  height={18}
                />
              </span>
            ))}
          </span>
        ) : (
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none">
            <path
              d="M4 5h16M7 12h10M10 19h4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        )}
        <span>
          {active
            ? t('n_channels', '{count} channels').replace(
                '{count}',
                String(channelFilter.length)
              )
            : t('all_channels', 'All channels')}
        </span>
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" className="text-pqSoft">
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div
          ref={floatingRef}
          data-pq="channel-filter-menu"
          className="z-[45] flex w-[290px] flex-col overflow-hidden rounded-pqMd border border-pqBorder bg-pqInner shadow-menu"
        >
          {/* searchThreshold 0 — the toolbar filter always offers search, however
              few channels the workspace has. */}
          <ChannelPickList
            integrations={integrations as any[]}
            selectedIds={channelFilter}
            onToggle={toggle}
            onSelectAll={selectAll}
            onClear={clear}
            searchThreshold={0}
          />
        </div>
      )}
    </div>
  );
};
