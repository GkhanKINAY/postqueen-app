'use client';

import { FC, ReactNode, useLayoutEffect } from 'react';
import { clsx } from 'clsx';
import { useFormContext, useWatch } from 'react-hook-form';
import { TranslatedLabel } from '../translation/translated-label';
import { FormIcon, isEmptyFormValue, type FormIconName } from './form.icon';

/**
 * Compact Yes/No (or any 2–4 option) control for settings forms — avoids
 * full-width native selects for short labels.
 * Pills match metric.component.tsx date-metric buttons; `segment` is the
 * equal-width track used for Post / Story (and similar) type switches.
 *
 * `defaultValue` is the value that will actually be posted when the user
 * never touches the control. It is registered during render (Instagram
 * `@IsDefined` first-paint) and painted as selected even when `useWatch`
 * has not yet seen the register write.
 */
export const FormChoice: FC<{
  name: string;
  label: string;
  translationKey?: string;
  options: { label: string; value: string | boolean; icon?: FormIconName }[];
  layout?: 'pills' | 'segment';
  defaultValue?: string | boolean;
  disabled?: boolean;
  icon?: FormIconName;
  hint?: ReactNode;
}> = ({
  name,
  label,
  translationKey,
  options,
  layout = 'pills',
  defaultValue,
  disabled,
  icon,
  hint,
}) => {
  const form = useFormContext();
  // Register during render, same as Select's `{...register(name, { value })}`,
  // so Instagram's @IsDefined post_type is present before the first paint.
  const existing = form.getValues(name);
  const initial = isEmptyFormValue(existing) ? defaultValue : existing;
  form.register(name, initial === undefined ? undefined : { value: initial });
  const raw = useWatch({ control: form.control, name });
  const painted = isEmptyFormValue(raw) ? initial : raw;
  const current =
    painted === true || painted === 'true'
      ? 'true'
      : painted === false || painted === 'false'
        ? 'false'
        : String(painted ?? '');

  useLayoutEffect(() => {
    if (defaultValue === undefined) {
      return;
    }
    const now = form.getValues(name);
    if (isEmptyFormValue(now)) {
      form.setValue(name, defaultValue, {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: true,
      });
    }
  }, [name, defaultValue, form]);

  const err = form.formState.errors[name]?.message as string | undefined;

  return (
    <div className="flex flex-col gap-[5px]">
      <div className="flex items-center gap-[8px] text-[13px] font-[500] text-pqMuted">
        {icon && <FormIcon name={icon} size={15} className="text-pqSoft" />}
        <TranslatedLabel label={label} translationKey={translationKey} />
      </div>
      <div
        role="radiogroup"
        aria-label={label}
        className={
          layout === 'segment'
            ? 'flex h-[40px] w-full gap-[2px] rounded-[10px] bg-pqInner p-[3px] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_20%,transparent)]'
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
                'inline-flex items-center justify-center gap-[6px] transition-colors',
                layout === 'segment'
                  ? 'min-w-0 flex-1 rounded-[8px] px-[8px] text-[12.5px] font-[500]'
                  : 'h-[32px] rounded-pqSm px-[13px] text-[12.5px]',
                selected
                  ? layout === 'segment'
                    ? 'bg-pqPop font-[600] text-pqText shadow-[inset_0_0_0_1px_var(--brand)]'
                    : 'bg-pqBrandSoft font-[600] text-pqText shadow-[inset_0_0_0_1px_var(--brand)]'
                  : 'text-pqMuted hover:bg-pqHover hover:text-pqText',
                layout === 'pills' &&
                  !selected &&
                  'shadow-[inset_0_0_0_1px_var(--border)]',
                disabled && 'pointer-events-none opacity-50'
              )}
            >
              {opt.icon && (
                <FormIcon
                  name={opt.icon}
                  size={13}
                  className={selected ? 'text-pqBrand' : 'text-pqSoft'}
                />
              )}
              <span className="truncate">{opt.label}</span>
            </button>
          );
        })}
      </div>
      {hint ? (
        <div className="text-[12px] leading-[1.45] text-pqMuted text-balance">
          {hint}
        </div>
      ) : null}
      {err ? <div className="text-[12px] text-pqDanger">{err}</div> : null}
    </div>
  );
};
