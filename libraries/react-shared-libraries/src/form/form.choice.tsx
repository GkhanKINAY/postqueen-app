'use client';

import { FC } from 'react';
import { clsx } from 'clsx';
import { useFormContext, useWatch } from 'react-hook-form';
import { TranslatedLabel } from '../translation/translated-label';

/**
 * Compact Yes/No (or any 2–4 option) control for settings forms — avoids
 * full-width native selects for short labels.
 * Pills match metric.component.tsx date-metric buttons; `segment` is the
 * equal-width track used for Post / Story (and similar) type switches.
 */
export const FormChoice: FC<{
  name: string;
  label: string;
  translationKey?: string;
  options: { label: string; value: string | boolean }[];
  layout?: 'pills' | 'segment';
  defaultValue?: string | boolean;
  disabled?: boolean;
}> = ({
  name,
  label,
  translationKey,
  options,
  layout = 'pills',
  defaultValue,
  disabled,
}) => {
  const form = useFormContext();
  // Register during render, same as Select's `{...register(name, { value })}`,
  // so Instagram's @IsDefined post_type is present before the first paint.
  const existing = form.getValues(name);
  const initial =
    existing === undefined || existing === null || existing === ''
      ? defaultValue
      : existing;
  form.register(name, initial === undefined ? undefined : { value: initial });
  const raw = useWatch({ control: form.control, name });
  const current =
    raw === true || raw === 'true'
      ? 'true'
      : raw === false || raw === 'false'
        ? 'false'
        : String(raw ?? '');

  return (
    <div className="flex flex-col gap-[5px]">
      <div className="text-[13px] font-[500] text-pqMuted">
        <TranslatedLabel label={label} translationKey={translationKey} />
      </div>
      <div
        role="radiogroup"
        aria-label={label}
        className={
          layout === 'segment'
            ? 'flex h-[40px] w-full gap-[2px] rounded-[10px] bg-pqSettings p-[3px]'
            : 'flex flex-wrap gap-[6px]'
        }
      >
        {options.map((opt) => {
          const value = String(opt.value);
          const selected = current === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => {
                form.setValue(name, opt.value, {
                  shouldDirty: true,
                  shouldTouch: true,
                  shouldValidate: true,
                });
              }}
              className={clsx(
                'transition-colors',
                layout === 'segment'
                  ? 'flex min-w-0 flex-1 items-center justify-center rounded-[8px] px-[8px] text-[12.5px] font-[500]'
                  : 'h-[32px] rounded-pqSm px-[13px] text-[12.5px]',
                selected
                  ? layout === 'segment'
                    ? 'bg-pqInner font-[600] text-pqText'
                    : 'bg-pqBrandSoft font-[600] text-pqText shadow-[inset_0_0_0_1px_var(--brand)]'
                  : 'text-pqMuted hover:bg-pqHover hover:text-pqText',
                layout === 'pills' &&
                  !selected &&
                  'shadow-[inset_0_0_0_1px_var(--border)]',
                disabled && 'pointer-events-none opacity-50'
              )}
            >
              <span className="truncate">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
