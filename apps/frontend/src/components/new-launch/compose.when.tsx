'use client';

import { FC, useState } from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useClickOutside } from '@mantine/hooks';
import { DropdownArrowIcon } from '@gitroom/frontend/components/ui/icons';
import { useAnchoredPopover } from '@gitroom/frontend/components/layout/use.anchored.popover';
import { useViewport } from '@gitroom/frontend/components/layout/use.viewport';
import { DatePicker } from '@gitroom/frontend/components/launches/helpers/date.picker';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';

dayjs.extend(utc);

export type ComposeWhenMode = 'next' | 'now' | 'date';

/**
 * Buffer's When to Post is Next Available / Prioritize / Now / Set Date.
 * PostQueen already has the three honest ones: find-slot (next empty posting
 * time), Post Now, and the date picker. Prioritize would bump other queued
 * posts — we do not have that, so it is not in this menu.
 */
export const ComposeWhen: FC<{
  mode: ComposeWhenMode;
  date: dayjs.Dayjs;
  onMode: (mode: ComposeWhenMode) => void;
  onChange: (date: dayjs.Dayjs) => void;
}> = ({ mode, date, onMode, onChange }) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { touch } = useViewport();
  const [isOpen, setIsOpen] = useState(false);
  const [slotLoading, setSlotLoading] = useState(false);
  const { referenceRef, floatingRef } = useAnchoredPopover<
    HTMLButtonElement,
    HTMLDivElement
  >(isOpen, 'start', { offsetPx: 10, placement: 'top-start' });
  const ref = useClickOutside(() => {
    if (isOpen) {
      setIsOpen(false);
    }
  });

  const options = [
    {
      value: 'next' as const,
      label: t('next_available', 'Next available'),
      hint: t(
        'next_available_hint',
        'Your post will go out in the next free slot, after other queued posts.'
      ),
    },
    {
      value: 'now' as const,
      label: t('post_now', 'Post Now'),
      hint: t(
        'post_now_hint',
        'Your post will be sent out right away.'
      ),
    },
    {
      value: 'date' as const,
      label: t('set_date_and_time', 'Set date and time'),
      hint: t(
        'set_date_and_time_hint',
        'Pick the exact time this should go out.'
      ),
    },
  ];

  const pickNextSlot = async () => {
    setSlotLoading(true);
    try {
      const response = await fetch('/posts/find-slot');
      if (!response.ok) {
        throw new Error('find-slot failed');
      }
      const slot = (await response.json())?.date;
      if (!slot) {
        throw new Error('no slot');
      }
      onChange(dayjs.utc(slot).local());
      onMode('next');
      setIsOpen(false);
    } catch {
      toaster.show(
        t('create_post_failed', 'Could not start a new post, please try again'),
        'warning'
      );
    } finally {
      setSlotLoading(false);
    }
  };

  const triggerLabel =
    mode === 'next'
      ? t('next_available', 'Next available')
      : mode === 'now'
      ? t('post_now', 'Post Now')
      : null;

  return (
    <div
      ref={ref}
      data-pq="composer-when"
      className={clsx(
        'relative flex min-w-0 items-center',
        touch && 'w-full',
        mode === 'date' && 'gap-[4px]'
      )}
    >
      {mode === 'date' ? (
        <DatePicker
          date={date}
          onChange={(next) => {
            onMode('date');
            onChange(next);
          }}
          className="max-[1179px]:!ml-0 max-[1179px]:w-full max-[1179px]:!flex-none"
        />
      ) : (
        <button
          type="button"
          ref={referenceRef}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={triggerLabel || t('when_to_post', 'When to post')}
          disabled={slotLoading}
          onClick={() => setIsOpen(!isOpen)}
          className={clsx(
            'flex h-[42px] min-w-0 cursor-pointer items-center justify-center gap-[8px] rounded-[10px] border text-[13px] font-[600] text-pqMuted select-none transition-colors hover:bg-pqHover disabled:cursor-wait',
            isOpen ? 'border-pqBrand' : 'border-newTextColor/10',
            touch ? 'w-full px-[8px]' : 'px-[16px]'
          )}
        >
          <QueueIcon />
          <span className="min-w-0 truncate">{triggerLabel}</span>
          <DropdownArrowIcon rotated={isOpen} />
        </button>
      )}
      {mode === 'date' && (
        <button
          type="button"
          ref={referenceRef}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={t('when_to_post', 'When to post')}
          onClick={() => setIsOpen(!isOpen)}
          className={clsx(
            'grid h-[42px] w-[38px] shrink-0 cursor-pointer place-items-center rounded-[10px] border text-pqMuted transition-colors hover:bg-pqHover',
            isOpen ? 'border-pqBrand' : 'border-newTextColor/10'
          )}
        >
          <DropdownArrowIcon rotated={isOpen} />
        </button>
      )}
      {isOpen && (
        <div
          ref={floatingRef}
          role="listbox"
          className="z-[300] w-[300px] rounded-[10px] border border-pqBorder bg-pqInner p-[6px] shadow-pq"
        >
          {options.map((option) => {
            const selected = option.value === mode;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={slotLoading}
                onClick={() => {
                  if (option.value === 'next') {
                    void pickNextSlot();
                    return;
                  }
                  onMode(option.value);
                  setIsOpen(false);
                }}
                className={clsx(
                  'flex w-full cursor-pointer items-start gap-[10px] rounded-[8px] px-[10px] py-[10px] text-start disabled:cursor-wait',
                  selected ? 'bg-pqHover' : 'hover:bg-pqHover'
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-[600] text-pqText">
                    {option.label}
                  </span>
                  <span className="mt-[2px] block text-[12px] font-[500] leading-[1.35] text-pqMuted">
                    {option.hint}
                  </span>
                </span>
                {selected && (
                  <svg
                    viewBox="0 0 16 16"
                    width="14"
                    height="14"
                    fill="none"
                    aria-hidden="true"
                    className="mt-[3px] shrink-0 text-pqBrand"
                  >
                    <path
                      d="M3.5 8.2 6.4 11l6.1-7"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const QueueIcon = () => (
  <svg
    viewBox="0 0 16 16"
    width="15"
    height="15"
    fill="none"
    aria-hidden="true"
    className="shrink-0"
  >
    <path
      d="M2.5 4h11M2.5 8h11M2.5 12h7"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);
