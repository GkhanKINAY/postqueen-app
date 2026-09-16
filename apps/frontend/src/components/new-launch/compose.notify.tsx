'use client';

import { FC, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useClickOutside } from '@mantine/hooks';
import clsx from 'clsx';
import { DropdownArrowIcon } from '@gitroom/frontend/components/ui/icons';
import { useAnchoredPopover } from '@gitroom/frontend/components/layout/use.anchored.popover';
import { useViewport } from '@gitroom/frontend/components/layout/use.viewport';

export const ComposeNotify: FC<{
  notify: boolean;
  onChange: (notify: boolean) => void;
  menuPlacement?: 'top-start' | 'bottom-end';
}> = ({ notify, onChange, menuPlacement = 'top-start' }) => {
  const t = useT();
  const { touch } = useViewport();
  const [isOpen, setIsOpen] = useState(false);
  const { referenceRef, floatingRef } = useAnchoredPopover<
    HTMLDivElement,
    HTMLDivElement
  >(isOpen, 'start', { offsetPx: 10, placement: menuPlacement });
  const ref = useClickOutside(() => {
    if (isOpen) {
      setIsOpen(false);
    }
  });

  const options = [
    {
      value: true,
      label: t('notify_me', 'Notify me'),
      hint: t(
        'notify_me_hint',
        "We'll tell you in PostQueen when this goes live"
      ),
    },
    {
      value: false,
      label: t('notify_quiet', 'Quiet'),
      hint: t(
        'notify_quiet_hint',
        "No success notice for this post. We'll still tell you if it fails."
      ),
    },
  ] as const;

  const triggerLabel = notify
    ? t('notify_me', 'Notify me')
    : t('notify_quiet', 'Quiet');

  return (
    <div
      ref={ref}
      data-pq="composer-notify"
      className={clsx(
        'relative flex h-[44px] items-center justify-center rounded-[8px] border text-[15px] font-[600] select-none transition-colors hover:bg-pqHover',
        touch ? 'min-w-0 overflow-hidden' : 'shrink-0',
        isOpen ? 'border-pqBrand' : 'border-newTextColor/10'
      )}
    >
      <div
        ref={referenceRef}
        role="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={triggerLabel}
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'flex h-full min-w-0 flex-1 cursor-pointer select-none items-center justify-center gap-[8px]',
          touch ? 'px-[8px]' : 'px-[16px]'
        )}
      >
        <svg
          viewBox="0 0 16 16"
          width="15"
          height="15"
          fill="none"
          aria-hidden="true"
          className="shrink-0"
        >
          <path
            d="M8 1.7a2.4 2.4 0 0 0-2.4 2.4v1.1c0 .7-.2 1.4-.6 2L4.2 8.6A1.6 1.6 0 0 0 5.6 11h4.8a1.6 1.6 0 0 0 1.4-2.4L10.99 7.2a3.4 3.4 0 0 1-.59-2V4.1A2.4 2.4 0 0 0 8 1.7Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path
            d="M6.4 11.1c.3.8 1 1.4 1.6 1.4s1.3-.6 1.6-1.4"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
        <span className={clsx(touch ? 'min-w-0 truncate' : 'whitespace-nowrap')}>
          {triggerLabel}
        </span>
        <DropdownArrowIcon rotated={isOpen} />
      </div>
      {isOpen && (
        <div
          ref={floatingRef}
          role="listbox"
          className="z-[300] w-[280px] rounded-[10px] border border-pqBorder bg-pqInner p-[6px] shadow-pq"
        >
          {options.map((option) => {
            const selected = option.value === notify;
            return (
              <button
                key={option.label}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={clsx(
                  'flex w-full cursor-pointer items-start gap-[10px] rounded-[8px] px-[10px] py-[10px] text-start',
                  selected ? 'bg-pqHover' : 'hover:bg-pqHover'
                )}
              >
                <span className="mt-[2px] grid size-[16px] shrink-0 place-items-center text-pqText">
                  {option.value ? (
                    <svg
                      viewBox="0 0 16 16"
                      width="15"
                      height="15"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M8 1.7a2.4 2.4 0 0 0-2.4 2.4v1.1c0 .7-.2 1.4-.6 2L4.2 8.6A1.6 1.6 0 0 0 5.6 11h4.8a1.6 1.6 0 0 0 1.4-2.4L10.99 7.2a3.4 3.4 0 0 1-.59-2V4.1A2.4 2.4 0 0 0 8 1.7Z"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 16 16"
                      width="15"
                      height="15"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M4 8h8"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                </span>
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
