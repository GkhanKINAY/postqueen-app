'use client';

import {
  DetailedHTMLProps,
  FC,
  InputHTMLAttributes,
  ReactNode,
  useEffect,
  useMemo,
} from 'react';
import { clsx } from 'clsx';
import { useFormContext } from 'react-hook-form';
import { TranslatedLabel } from '../translation/translated-label';

export const Input: FC<
  DetailedHTMLProps<InputHTMLAttributes<HTMLInputElement>, HTMLInputElement> & {
    removeError?: boolean;
    error?: any;
    disableForm?: boolean;
    customUpdate?: () => void;
    label: string;
    name: string;
    icon?: ReactNode;
    translationKey?: string;
    translationParams?: Record<string, string | number>;
  }
> = (props) => {
  const {
    label,
    icon,
    removeError,
    customUpdate,
    className,
    disableForm,
    error,
    translationKey,
    translationParams,
    placeholder,
    ...rest
  } = props;
  const form = useFormContext();
  const err = useMemo(() => {
    if (error) return error;
    if (!form || !form.formState.errors[props?.name!]) return;
    return form?.formState?.errors?.[props?.name!]?.message! as string;
  }, [form?.formState?.errors?.[props?.name!]?.message, error]);
  const watch = customUpdate ? form?.watch(props.name) : null;
  useEffect(() => {
    if (customUpdate) {
      customUpdate();
    }
  }, [watch]);
  return (
    <div className="flex flex-col gap-[5px]">
      {!!label && (
        <div className="text-[13px] font-[500] text-pqMuted">
          <TranslatedLabel
            label={label}
            translationKey={translationKey}
            translationParams={translationParams}
          />
        </div>
      )}
      {/* Well on both --inner and --settings: fill is inner, ring is 20% text. */}
      <div
        className={clsx(
          'flex h-[40px] items-center justify-center rounded-[10px] bg-pqInner text-pqText shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_20%,transparent)] transition-shadow',
          'focus-within:shadow-[inset_0_0_0_1px_var(--brand)]',
          className
        )}
      >
        {icon && <div className="ps-[12px]">{icon}</div>}
        <input
          className={clsx(
            'h-full flex-1 bg-transparent text-[14px] text-pqText outline-none placeholder:text-pqMuted',
            icon ? 'ps-[8px] pe-[12px]' : 'px-[12px]'
          )}
          placeholder={
            placeholder ??
            (label &&
            label.length > 0 &&
            label.length <= 32 &&
            !label.includes('http')
              ? label
              : undefined)
          }
          {...(disableForm ? {} : form.register(props.name))}
          {...rest}
        />
      </div>
      {!removeError && err ? (
        <div className="text-[12px] text-pqDanger">{err}</div>
      ) : null}
    </div>
  );
};
