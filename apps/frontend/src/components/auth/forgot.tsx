'use client';

import { useForm, SubmitHandler, FormProvider } from 'react-hook-form';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import Link from 'next/link';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { useMemo, useState } from 'react';
import { classValidatorResolver } from '@hookform/resolvers/class-validator';
import { ForgotPasswordDto } from '@gitroom/nestjs-libraries/dtos/auth/forgot.password.dto';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { authSubtitleClass, authTitleClass } from '@gitroom/frontend/components/auth/auth-chrome';
type Inputs = {
  email: string;
};
export function Forgot() {
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState(false);
  const resolver = useMemo(() => {
    return classValidatorResolver(ForgotPasswordDto);
  }, []);
  const form = useForm<Inputs>({
    resolver,
  });
  const fetchData = useFetch();
  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    setLoading(true);
    await fetchData('/auth/forgot', {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        provider: 'LOCAL',
      }),
    });
    setState(true);
    setLoading(false);
  };
  return (
    <div className="flex flex-1 flex-col">
      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className="flex flex-col gap-[4px]">
          <h1 className={authTitleClass}>
            {t('forgot_password_1', 'Forgot password')}
          </h1>
          <p className={authSubtitleClass}>
            {t(
              'forgot_password_subtitle',
              'Enter the email on your account and we will send a reset link.',
            )}
          </p>
          </div>
          {!state ? (
            <>
              <div className="mt-[24px] text-textColor">
                <Input
                  label="Email"
                  translationKey="label_email"
                  {...form.register('email')}
                  type="email"
                  autoFocus
                  placeholder={t('email_placeholder', 'name@example.com')}
                />
              </div>
              <div className="w-full flex mt-[24px]">
                <Button
                  type="submit"
                  className="flex-1 rounded-[10px] !h-[52px]"
                  loading={loading}
                >
                  {t('send_password_reset_email', 'Send reset link')}
                </Button>
              </div>
              <p className="mt-[20px] text-center text-[14px] text-textItemBlur">
                <Link
                  href="/auth/login"
                  className="font-[500] text-newTextColor underline hover:font-bold"
                >
                  {t('go_back_to_login', 'Back to sign in')}
                </Link>
              </p>
            </>
          ) : (
            <>
              <p className="mt-[28px] text-[15px] text-textItemBlur">
                {t(
                  'we_have_send_you_an_email_with_a_link_to_reset_your_password',
                  'We have sent you an email with a link to reset your password.',
                )}
              </p>
              <p className="mt-[20px] text-center text-[14px] text-textItemBlur">
                <Link
                  href="/auth/login"
                  className="font-[500] text-newTextColor underline hover:font-bold"
                >
                  {t('go_back_to_login', 'Back to sign in')}
                </Link>
              </p>
            </>
          )}
        </form>
      </FormProvider>
    </div>
  );
}
