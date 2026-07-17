'use client';

import { useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { TurnstileWidget } from '@gitroom/frontend/components/auth/turnstile.widget';

/**
 * Passwordless email-code step. Rendered as the AuthShell `emailStep` when
 * PASSWORDLESS_LOGIN is on. Sign-in and sign-up collapse into one action:
 * enter email -> receive a 6-digit code -> verify. The backend creates the
 * account on first verify, so both the login and register pages reuse this.
 *
 * On a successful verify the shared fetch interceptor (layout.context) reads
 * the auth/onboarding/reload headers and redirects, so there is nothing to do
 * here on 200 beyond letting the navigation happen.
 */
export function OtpEmailStep({ submitLabel }: { submitLabel: string }) {
  const t = useT();
  const fetchData = useFetch();
  const { turnstileSiteKey } = useVariables();
  const [phase, setPhase] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const requestCode = async (e?: { preventDefault?: () => void }) => {
    e?.preventDefault?.();
    if (!email || loading) return;
    setError('');
    setLoading(true);
    const res = await fetchData('/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ email, captchaToken }),
    });
    setLoading(false);
    if (res.status === 200) {
      setPhase('code');
      // Turnstile tokens are single-use; drop it so a resend re-solves.
      setCaptchaToken('');
    } else {
      setError(
        (await res.text()) || t('something_went_wrong', 'Something went wrong')
      );
    }
  };

  const verifyCode = async (e?: { preventDefault?: () => void }) => {
    e?.preventDefault?.();
    if (code.length !== 6 || loading) return;
    setError('');
    setLoading(true);
    const res = await fetchData('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    });
    // Success navigates via the fetch interceptor; only errors surface here.
    if (res.status !== 200) {
      setLoading(false);
      setError(
        (await res.text()) || t('invalid_or_expired_code', 'Invalid or expired code')
      );
    }
  };

  if (phase === 'email') {
    return (
      <form onSubmit={requestCode} className="flex flex-col gap-[12px]">
        <div className="text-textColor">
          <Input
            label="Email"
            translationKey="label_email"
            name="email"
            disableForm
            removeError
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoFocus
            placeholder={t('email_address', 'Email Address')}
          />
        </div>
        {turnstileSiteKey && (
          <TurnstileWidget
            siteKey={turnstileSiteKey}
            onToken={setCaptchaToken}
          />
        )}
        {error && <p className="text-red-400 text-[13px]">{error}</p>}
        <div className="w-full flex mt-[12px]">
          <Button
            type="submit"
            className="flex-1 rounded-[10px] !h-[52px]"
            loading={loading}
            disabled={!!turnstileSiteKey && !captchaToken}
          >
            {t('send_code', 'Send code')}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={verifyCode} className="flex flex-col gap-[12px]">
      <p className="text-[13px] text-textItemBlur">
        {t('code_sent_to', 'We sent a 6-digit code to')}{' '}
        <span className="text-newTextColor font-[500]">{email}</span>
      </p>
      <div className="text-textColor">
        <Input
          label="Code"
          translationKey="label_code"
          name="code"
          disableForm
          removeError
          value={code}
          onChange={(e) =>
            setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
          }
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder={t('six_digit_code', '6-digit code')}
        />
      </div>
      {error && <p className="text-red-400 text-[13px]">{error}</p>}
      <div className="w-full flex mt-[12px]">
        <Button
          type="submit"
          className="flex-1 rounded-[10px] !h-[52px]"
          loading={loading}
        >
          {submitLabel}
        </Button>
      </div>
      <div className="flex items-center justify-between text-[13px] mt-[4px]">
        <button
          type="button"
          className="underline text-textItemBlur hover:font-bold"
          onClick={() => {
            setPhase('email');
            setCode('');
            setError('');
          }}
        >
          {t('use_a_different_email', 'Use a different email')}
        </button>
        <button
          type="button"
          className="underline text-textItemBlur hover:font-bold disabled:opacity-50"
          onClick={() => {
            // With a captcha, a fresh token is required, so return to the email
            // step to re-solve rather than replaying a spent token.
            if (turnstileSiteKey) {
              setPhase('email');
              setCode('');
              setError('');
            } else {
              requestCode();
            }
          }}
          disabled={loading}
        >
          {t('resend_code', 'Resend code')}
        </button>
      </div>
    </form>
  );
}
