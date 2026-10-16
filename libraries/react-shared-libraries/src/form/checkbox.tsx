'use client';

import { forwardRef, useCallback, useLayoutEffect } from 'react';
import clsx from 'clsx';
import { useFormContext } from 'react-hook-form';
import { FormIcon, isEmptyFormValue, type FormIconName } from './form.icon';

/**
 * Checkbox face is always light (`--onBrand` / white) with a brand tick when
 * on. A filled brand square (old `bg-forth`) reads as “mystery block”, not a
 * control — owner feedback 2026-08-06.
 */
export const Checkbox = forwardRef<
  null,
  {
    checked?: boolean;
    disableForm?: boolean;
    name?: string;
    className?: string;
    label?: string;
    icon?: FormIconName;
    /** Form default when the field has never been set — matches the payload. */
    defaultValue?: boolean;
    onChange?: (event: {
      target: {
        name?: string;
        value: boolean;
      };
    }) => void;
    /** Kept for callers; both variants share the same face treatment. */
    variant?: 'default' | 'hollow';
    /** Greyed out and not clickable; the value it holds is left as it is. */
    disabled?: boolean;
  }
>((props, ref: any) => {
  const { checked, className, label, disableForm, icon, defaultValue, disabled } =
    props;
  const form = useFormContext();
  if (!disableForm && props.name && defaultValue !== undefined) {
    const existing = form.getValues(props.name);
    if (isEmptyFormValue(existing)) {
      form.register(props.name, { value: defaultValue });
    }
  }
  const watch = disableForm ? undefined : form.watch(props.name!);
  // `watch || checked` treated `false` as missing and flipped state wrongly.
  const val = !!(disableForm
    ? checked
    : isEmptyFormValue(watch)
      ? checked ?? defaultValue
      : watch);

  useLayoutEffect(() => {
    if (disableForm || !props.name || defaultValue === undefined) {
      return;
    }
    if (isEmptyFormValue(form.getValues(props.name))) {
      form.setValue(props.name, defaultValue, {
        shouldDirty: false,
        shouldTouch: false,
      });
    }
  }, [disableForm, props.name, defaultValue, form]);

  const changeStatus = useCallback(() => {
    if (disabled) {
      return;
    }
    const next = !val;
    props?.onChange?.({
      target: {
        name: props.name!,
        value: next,
      },
    });
    if (!disableForm && props.name) {
      form.setValue(props.name, next, { shouldDirty: true, shouldTouch: true });
    }
  }, [val, disabled, disableForm, props, form]);

  return (
    <div className="flex items-center gap-[10px]">
      <div
        ref={ref}
        role="checkbox"
        aria-checked={val}
        aria-disabled={disabled || undefined}
        onClick={changeStatus}
        className={clsx(
          'flex h-[18px] w-[18px] shrink-0 select-none items-center justify-center rounded-[5px] bg-pqOnBrand text-pqBrand shadow-[inset_0_0_0_1px_var(--border)] transition-colors',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
          className
        )}
      >
        {val && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
      {!!label && (
        <div
          className={clsx(
            'flex items-center gap-[6px] text-[14px] text-pqText',
            disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
          )}
          onClick={changeStatus}
        >
          {icon && <FormIcon name={icon} size={14} className="text-pqSoft" />}
          {label}
        </div>
      )}
    </div>
  );
});
Checkbox.displayName = 'Checkbox';
