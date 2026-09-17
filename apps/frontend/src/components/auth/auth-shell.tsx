'use client';

import { ReactNode } from 'react';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { GithubProvider } from '@gitroom/frontend/components/auth/providers/github.provider';
import { OauthProvider } from '@gitroom/frontend/components/auth/providers/oauth.provider';
import { GoogleProvider } from '@gitroom/frontend/components/auth/providers/google.provider';
import { AppleProvider } from '@gitroom/frontend/components/auth/providers/apple.provider';
import { FarcasterProvider } from '@gitroom/frontend/components/auth/providers/farcaster.provider';
import { shouldShowAppleSignIn } from '@gitroom/frontend/components/auth/apple-sign-in';
import { AuthModeFooter, authSubtitleClass, authTitleClass } from '@gitroom/frontend/components/auth/auth-chrome';

/**
 * The provider buttons (Google / Apple / OIDC / GitHub / Farcaster), stacked
 * full width so Apple sits under Google instead of squeezing a row of icons.
 * Wallet is opt-in via WALLET_LOGIN and stays a per-form concern because
 * register lazy-loads it; callers pass it via `extraProviders`.
 */
function Providers({ extraProviders }: { extraProviders?: ReactNode }) {
  const { isGeneral, neynarClientId, appleClientId, genericOauth } =
    useVariables();
  if (isGeneral && genericOauth) return <OauthProvider />;
  if (!isGeneral) return <GithubProvider />;
  return (
    <div className="flex flex-col gap-[8px]">
      <GoogleProvider />
      {shouldShowAppleSignIn(appleClientId) && <AppleProvider />}
      {!!neynarClientId && <FarcasterProvider />}
      {extraProviders}
    </div>
  );
}

/**
 * Shared chrome for login and register: one screen, every viewport.
 * Providers, then or, then email. OTP still swaps only the email block.
 */
export function AuthShell({
  title,
  subtitle,
  extraProviders,
  emailStep,
}: {
  title: string;
  /** One line under the title, in the manner of the marketing site. */
  subtitle?: string;
  extraProviders?: ReactNode;
  /** The email + password (+ organization) fields and submit button. */
  emailStep: ReactNode;
}) {
  const t = useT();

  return (
    <div className="flex flex-col flex-1">
      <div className="flex flex-col gap-[4px]">
        <h1 className={authTitleClass}>{title}</h1>
        {!!subtitle && <p className={authSubtitleClass}>{subtitle}</p>}
      </div>

      <div className="mt-[24px] flex flex-col">
        <Providers extraProviders={extraProviders} />
        <div className="relative mb-[16px] mt-[16px] h-[20px]">
          <div className="absolute w-full h-[1px] bg-pqBorder top-[50%] -translate-y-[50%]" />
          <div className="absolute z-[1] justify-center items-center w-full start-0 -top-[4px] flex">
            <div className="px-[16px] bg-pqInner text-pqMuted text-[13px]">
              {t('or', 'or')}
            </div>
          </div>
        </div>
        {emailStep}
        <AuthModeFooter />
      </div>
    </div>
  );
}
