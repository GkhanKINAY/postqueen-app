'use client';

import { FC, useMemo, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useClickOutside } from '@mantine/hooks';
import clsx from 'clsx';
import { RepeatIcon, DropdownArrowIcon } from '@gitroom/frontend/components/ui/icons';
import { useAnchoredPopover } from '@gitroom/frontend/components/layout/use.anchored.popover';
import { useViewport } from '@gitroom/frontend/components/layout/use.viewport';

const getList = (
  t: (key: string, fallback: string) => string
): { value: number | null; label: string; clear?: boolean }[] => {
  const every = t('every', 'Every');
  return [
    {
      value: 1,
      label: `${every} ${t('day', 'Day')}`,
    },
    {
      value: 2,
      label: `${every} ${t('two_days', 'Two Days')}`,
    },
    {
      value: 3,
      label: `${every} ${t('three_days', 'Three Days')}`,
    },
    {
      value: 4,
      label: `${every} ${t('four_days', 'Four Days')}`,
    },
    {
      value: 5,
      label: `${every} ${t('five_days', 'Five Days')}`,
    },
    {
      value: 6,
      label: `${every} ${t('six_days', 'Six Days')}`,
    },
    {
      value: 7,
      label: `${every} ${t('week', 'Week')}`,
    },
    {
      value: 14,
      label: `${every} ${t('two_weeks', 'Two Weeks')}`,
    },
    {
      value: 30,
      label: `${every} ${t('month', 'Month')}`,
    },
    {
      value: null,
      label: t('clear', 'Clear'),
      clear: true,
    },
  ];
};
export const RepeatComponent: FC<{
  repeat: number | null;
  onChange: (newVal: number) => void;
  menuPlacement?: 'top-start' | 'bottom-end';
}> = (props) => {
  const { repeat, menuPlacement = 'top-start' } = props;
  const t = useT();
  const { touch } = useViewport();
  const list = getList(t);
  const [isOpen, setIsOpen] = useState(false);
  // Same overflow escape as DatePicker / Delay — footer clips absolute menus.
  const { referenceRef, floatingRef } = useAnchoredPopover<
    HTMLDivElement,
    HTMLDivElement
  >(isOpen, 'start', { offsetPx: 10, placement: menuPlacement });

  const ref = useClickOutside(() => {
    if (!isOpen) {
      return;
    }
    setIsOpen(false);
  });

  const everyLabel = useMemo(() => {
    if (!repeat) {
      return '';
    }
    return list.find((p) => p.value === repeat)?.label;
  }, [repeat, list]);

  const emptyLabel = t('repeat_post_every', 'Repeat Post Every...');
  // Selected trigger is just "Every Day" — prefixing repeat_post_every_label
  // would read "Repeat Post Every Every Day".
  const triggerLabel = repeat ? everyLabel : emptyLabel;

  return (
    <div
      ref={ref}
      className={clsx(
        'relative flex h-[44px] min-w-0 items-center justify-center overflow-hidden rounded-[8px] border text-[15px] font-[600] select-none',
        isOpen ? 'border-pqBrand' : 'border-newTextColor/10'
      )}
    >
      <div
        ref={referenceRef}
        role="button"
        aria-label={triggerLabel}
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'flex h-full min-w-0 flex-1 select-none items-center justify-center gap-[8px]',
          touch ? 'px-[8px]' : 'px-[16px]'
        )}
      >
        <div className="cursor-pointer">
          <RepeatIcon />
        </div>
        {touch ? (
          repeat ? (
            <div className="min-w-0 cursor-pointer truncate">{everyLabel}</div>
          ) : null
        ) : (
          <div className="min-w-0 cursor-pointer truncate">{triggerLabel}</div>
        )}
        <div className="cursor-pointer">
          <DropdownArrowIcon rotated={isOpen} />
        </div>
      </div>
      {isOpen && (
        <div
          ref={floatingRef}
          className="z-[300] flex w-[240px] flex-col bg-newBgColorInner p-[12px] menu-shadow"
        >
          {list.map((p) => {
            if (p.clear && !repeat) {
              return null;
            }
            return (
              <div key={p.label}>
                {p.clear && (
                  <div
                    className="mx-[8px] my-[6px] h-px bg-pqLine"
                    aria-hidden="true"
                  />
                )}
                <div
                  role="button"
                  onClick={() => {
                    props.onChange(Number(p.value));
                    setIsOpen(false);
                  }}
                  className={clsx(
                    'h-[40px] cursor-pointer px-[20px] py-[8px] -mx-[12px] hover:bg-newBgColor',
                    p.clear && 'text-[14px] font-[600] text-pqMuted'
                  )}
                >
                  {p.label}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
