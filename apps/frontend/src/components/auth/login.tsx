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
import WalletProvider from '@gitroom/frontend/components/auth/providers/wallet.provider';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  AuthShell,
  AuthStep,
} from '@gitroom/frontend/components/auth/auth-shell';
import { OtpEmailStep } from '@gitroom/frontend/components/auth/otp-email-step';
type Inputs = {
  email: string;
  password: string;
  providerToken: '';
  provider: 'LOCAL';
};
export function Login() {
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [notActivated, setNotActivated] = useState(false);
  const [step, setStep] = useState<AuthStep>('method');
  // Chosen from the password step, so it only ever matters once `step` is
  // 'email'. Going back to the method step clears it.
  const [withCode, setWithCode] = useState(false);
  const { billingEnabled, passwordlessLogin, emailCodeLogin } = useVariables();
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
  // The sign-up cross-link lives in the auth chrome (top right), so the form
  // itself carries no footer.
  const subtitle = t(
    'sign_in_subtitle',
    'Welcome back. Sign in to get to your calendar.'
  );
  if (passwordlessLogin) {
    return (
      <div className="flex-1 flex">
        <AuthShell
          title={t('sign_in', 'Sign In')}
          subtitle={subtitle}
          step={step}
          onContinueEmail={() => setStep('email')}
          onBack={() => setStep('method')}
          extraProviders={billingEnabled ? <WalletProvider /> : undefined}
          emailStep={<OtpEmailStep submitLabel={t('sign_in_1', 'Sign in')} />}
        />
      </div>
    );
  }
  // OtpEmailStep brings its own <form>, so this cannot render inside the
  // password form further down: nested forms are invalid markup and the inner
  // submit never fires. Hence the early return, the same shape the passwordless
  // branch above uses.
  if (withCode) {
    return (
      <div className="flex-1 flex">
        <AuthShell
          title={t('sign_in', 'Sign In')}
          subtitle={subtitle}
          step={step}
          onContinueEmail={() => setStep('email')}
          onBack={() => {
            setWithCode(false);
            setStep('method');
          }}
          extraProviders={billingEnabled ? <WalletProvider /> : undefined}
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
                  'Sign in with a password instead'
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
    }
  };
  return (
    <FormProvider {...form}>
      <form className="flex-1 flex" onSubmit={form.handleSubmit(onSubmit)}>
        <AuthShell
          title={t('sign_in', 'Sign In')}
          subtitle={subtitle}
          step={step}
          onContinueEmail={() => setStep('email')}
          onBack={() => setStep('method')}
          extraProviders={billingEnabled ? <WalletProvider /> : undefined}
          emailStep={
            <div className="flex flex-col gap-[12px]">
              <div className="text-textColor">
                <Input
                  label="Email"
                  translationKey="label_email"
                  {...form.register('email')}
                  type="email"
                  autoFocus
                  placeholder={t('email_address', 'Email Address')}
                />
                <Input
                  label="Password"
                  translationKey="label_password"
                  {...form.register('password')}
                  autoComplete="off"
                  type="password"
                  placeholder={t('label_password', 'Password')}
                />
              </div>
              {notActivated && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-[10px] p-4 mb-4">
                  <p className="text-amber-500 text-sm mb-2">
                    {t(
                      'account_not_activated',
                      'Your account is not activated yet. Please check your email for the activation link.'
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
              <div className="w-full flex mt-[12px]">
                <Button
                  type="submit"
                  className="flex-1 rounded-[10px] !h-[52px]"
                  loading={loading}
                >
                  {t('sign_in_1', 'Sign in')}
                </Button>
              </div>
              {/* Two links share the row only when there are two. Without the
                  code option the single link stays centred, exactly as before,
                  so an install that does not opt in sees no change at all. */}
              {emailCodeLogin ? (
                <div className="flex items-center justify-between text-[13px] mt-[8px]">
                  <Link
                    href="/auth/forgot"
                    className="underline hover:font-bold cursor-pointer text-textItemBlur"
                  >
                    {t('forgot_password', 'Forgot password')}
                  </Link>
                  <button
                    type="button"
                    onClick={() => setWithCode(true)}
                    className="underline hover:font-bold cursor-pointer text-textItemBlur"
                  >
                    {t('email_me_a_code', 'Email me a sign-in code')}
                  </button>
                </div>
              ) : (
                <p className="text-center text-sm mt-[8px]">
                  <Link
                    href="/auth/forgot"
                    className="underline hover:font-bold cursor-pointer text-textItemBlur"
                  >
                    {t('forgot_password', 'Forgot password')}
                  </Link>
                </p>
              )}
            </div>
          }
        />
      </form>
    </FormProvider>
  );
}
