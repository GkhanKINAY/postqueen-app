'use client';

import { useForm, SubmitHandler, FormProvider } from 'react-hook-form';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import Link from 'next/link';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { useMemo, useState } from 'react';
import { classValidatorResolver } from '@hookform/resolvers/class-validator';
import { LoginUserDto } from '@gitroom/nestjs-libraries/dtos/auth/login.user.dto';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import dynamic from 'next/dynamic';
import { WalletUiProvider } from '@gitroom/frontend/components/auth/providers/placeholder/wallet.ui.provider';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { AuthShell } from '@gitroom/frontend/components/auth/auth-shell';
import { OtpEmailStep } from '@gitroom/frontend/components/auth/otp-email-step';
const WalletProvider = dynamic(
  () => import('@gitroom/frontend/components/auth/providers/wallet.provider'),
  {
    ssr: false,
    loading: () => <WalletUiProvider />,
  },
);
// The DTO the resolver validates against is the form's shape. Declaring a
// second, near-identical type let the two drift — this one was missing
// `datafast_visitor_id` — and @hookform/resolvers 5 checks that they agree.
type Inputs = LoginUserDto;
export function Login() {
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [notActivated, setNotActivated] = useState(false);
  const [withCode, setWithCode] = useState(false);
  const { walletLogin, passwordlessLogin, emailEnabled } = useVariables();
  const resolver = useMemo(() => {
    return classValidatorResolver(LoginUserDto);
  }, []);
  const form = useForm<Inputs>({
    resolver,
    defaultValues: {
      providerToken: '',
      provider: 'LOCAL',
    },
  });
  const fetchData = useFetch();
  const email = form.watch('email');
  const password = form.watch('password');
  const canSubmit = Boolean(String(email ?? '').trim() && String(password ?? ''));
  const subtitle = t(
    'sign_in_subtitle',
    'Log in to access your account.',
  );
  // The code step replaces the password step rather than sitting inside it:
  // OtpEmailStep brings its own <form>, and nesting one form in another is
  // invalid markup whose inner submit never fires. Hence the early return.
  if (withCode) {
    return (
      <div className="flex-1 flex">
        <AuthShell
          title={t('welcome_back', 'Welcome back')}
          subtitle={subtitle}
          extraProviders={walletLogin ? <WalletProvider /> : undefined}
          emailStep={
            <div className="flex flex-col gap-[12px]">
              <OtpEmailStep submitLabel={t('sign_in_1', 'Sign in')} />
              <button
                type="button"
                onClick={() => setWithCode(false)}
                className="underline hover:font-bold cursor-pointer text-textItemBlur text-[13px]"
              >
                {t(
                  'sign_in_with_password_instead',
                  'Sign in with a password instead',
                )}
              </button>
            </div>
          }
        />
      </div>
    );
  }
  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    setLoading(true);
    setNotActivated(false);
    const login = await fetchData('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        provider: 'LOCAL',
      }),
    });
    if (login.status === 400) {
      const errorMessage = await login.text();
      if (errorMessage === 'User is not activated') {
        setNotActivated(true);
      } else {
        form.setError('email', {
          message: errorMessage,
        });
      }
      setLoading(false);
      return;
    }

    // Only 400 was handled, so the abuse guard's 429 — and any 500 — left the
    // button spinning forever with no message and no way back. Register already
    // does this; the two forms disagreed.
    if (!login.ok) {
      const raw = await login.text().catch(() => '');
      // 429/500 bodies are Nest JSON; showing `{"statusCode":429,…}` to someone
      // who has just been rate-limited is worse than a generic sentence.
      let message = '';
      try {
        const parsed = JSON.parse(raw);
        message = Array.isArray(parsed?.message)
          ? parsed.message[0]
          : parsed?.message || '';
      } catch {
        message = raw;
      }

      form.setError('email', {
        message:
          message ||
          t(
            'login_failed_try_again',
            'We could not sign you in, please try again',
          ),
      });
      setLoading(false);
      return;
    }
  };
  return (
    <FormProvider {...form}>
      <form className="flex-1 flex" onSubmit={form.handleSubmit(onSubmit)}>
        <AuthShell
          title={t('welcome_back', 'Welcome back')}
          subtitle={subtitle}
          extraProviders={walletLogin ? <WalletProvider /> : undefined}
          emailStep={
            <div className="flex flex-col gap-[12px]">
              <div className="flex flex-col gap-[8px] text-textColor">
                <Input
                  label="Email"
                  translationKey="label_email"
                  {...form.register('email')}
                  type="email"
                  autoFocus
                  placeholder={t('email_placeholder', 'name@example.com')}
                />
                <Input
                  label="Password"
                  translationKey="label_password"
                  {...form.register('password')}
                  autoComplete="off"
                  type="password"
                  placeholder={t('password_placeholder', '••••••••')}
                  labelAction={
                    <Link
                      href="/auth/forgot"
                      data-pq="forgot-password"
                      className="text-[14px] font-[500] text-pqText"
                    >
                      {t('forgot_password', 'Forgot password?')}
                    </Link>
                  }
                />
              </div>
              {notActivated && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-[10px] p-4 mb-4">
                  <p className="text-amber-500 text-sm mb-2">
                    {t(
                      'account_not_activated',
                      'Your account is not activated yet. Please check your email for the activation link.',
                    )}
                  </p>
                  <Link
                    href="/auth/activate"
                    className="text-amber-500 underline hover:font-bold text-sm"
                  >
                    {t('resend_activation_email', 'Resend Activation Email')}
                  </Link>
                </div>
              )}
              <div className="w-full flex">
                <Button
                  type="submit"
                  disabled={!canSubmit}
                  className={
                    canSubmit
                      ? 'flex-1 rounded-[10px] !h-[52px]'
                      : 'flex-1 rounded-[10px] !h-[52px] !bg-pqText'
                  }
                  loading={loading}
                >
                  {t('sign_in_1', 'Sign in')}
                </Button>
              </div>
              {emailEnabled && passwordlessLogin ? (
                <p className="text-center text-sm mt-[8px]">
                  <button
                    type="button"
                    onClick={() => setWithCode(true)}
                    className="underline hover:font-bold cursor-pointer text-textItemBlur"
                  >
                    {t('email_me_a_code', 'Email me a sign-in code')}
                  </button>
                </p>
              ) : null}
            </div>
          }
        />
      </form>
    </FormProvider>
  );
}
