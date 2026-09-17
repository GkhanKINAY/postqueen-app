'use client';

import {
  DetailedHTMLProps,
  FC,
  InputHTMLAttributes,
  ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { clsx } from 'clsx';
import { useFormContext } from 'react-hook-form';
import { TranslatedLabel } from '../translation/translated-label';
import { useT } from '../translation/get.transation.service.client';

const PasswordEye: FC<{ open: boolean }> = ({ open }) => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    aria-hidden="true"
  >
    {open ? (
      <>
        <path
          d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.7" />
      </>
    ) : (
      <>
        <path
          d="M3 3l18 18"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <path
          d="M9.5 9.7A3.4 3.4 0 0 0 12 15.4M14.6 14.2A3.4 3.4 0 0 0 9.9 9.6M4.2 7.4C2.7 9 2 12 2 12s3.5 6.5 10 6.5c1.6 0 3-.3 4.3-.8M7.1 7.1C8.6 6.4 10.2 5.5 12 5.5 18 5.5 22 12 22 12c-.4.8-1 1.8-1.8 2.7"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    )}
  </svg>
);

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
    /** Keep the idle well ring on focus — no brand outline. */
    brandFocus?: boolean;
    /** Sits on the label row, opposite the label (forgot-password, etc). */
    labelAction?: ReactNode;
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
    brandFocus = true,
    type,
    labelAction,
    ...rest
  } = props;
  const t = useT();
  const form = useFormContext();
  const [showPassword, setShowPassword] = useState(false);
  const passwordField = type === 'password';
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
        <div className="flex items-center justify-between gap-[8px]">
          <div className="text-[14px] font-[500] text-pqMuted">
            <TranslatedLabel
              label={label}
              translationKey={translationKey}
              translationParams={translationParams}
            />
          </div>
          {labelAction}
        </div>
      )}
      {/* Well on both --inner and --settings: fill is inner, ring is 20% text. */}
      <div
        className={clsx(
          'flex h-[40px] items-center justify-center rounded-[10px] bg-pqInner text-pqText shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_20%,transparent)] transition-shadow',
          brandFocus && 'focus-within:shadow-[inset_0_0_0_1px_var(--brand)]',
          className
        )}
      >
        {icon && <div className="ps-[12px]">{icon}</div>}
        <input
          className={clsx(
            'h-full flex-1 bg-transparent text-[14px] text-pqText outline-none placeholder:text-pqMuted focus-visible:outline-none',
            icon
              ? 'ps-[8px] pe-[12px]'
              : passwordField
                ? 'ps-[12px] pe-[4px]'
                : 'px-[12px]'
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
          type={passwordField && showPassword ? 'text' : type}
        />
        {passwordField && (
          <button
            type="button"
            data-pq="password-reveal"
            className="grid size-[36px] shrink-0 cursor-pointer place-items-center text-pqMuted transition-colors hover:text-pqText"
            aria-label={
              showPassword
                ? t('hide_password', 'Hide password')
                : t('show_password', 'Show password')
            }
            onClick={() => setShowPassword((v) => !v)}
          >
            <PasswordEye open={showPassword} />
          </button>
        )}
      </div>
      {!removeError && err ? (
        <div className="text-[12px] text-pqDanger">{err}</div>
      ) : null}
    </div>
  );
};
