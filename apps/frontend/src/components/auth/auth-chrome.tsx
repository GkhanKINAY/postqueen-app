'use client';

// The frame around every auth form: logo on top, copyright and legal links at
// the bottom. The Sign In / Create account segmented control under the title
// read as a second form. The opposite action sits next to the logo (login →
// create a new account, register → sign in). AuthModeFooter still offers it
// under the submit button.

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';
import { ChevronLeftIcon } from '@gitroom/frontend/components/ui/icons';

const headerCtaClass =
  'flex h-8 shrink-0 items-center rounded-[8px] border border-pqBorder px-3 text-[14px] font-[500] text-newTextColor transition-colors hover:bg-boxHover';

/** 28px semibold display title, 16px muted subtitle. */
export const authTitleClass =
  'font-display text-pretty text-[28px] font-semibold leading-[130%] tracking-[-1.12px] text-pqText';
export const authSubtitleClass =
  'text-[16px] font-normal leading-[150%] text-pqMuted';

export const AuthNav = () => {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const { disableRegistration } = useVariables();
  const innerAuth =
    pathname.startsWith('/auth/forgot') ||
    pathname.startsWith('/auth/activate');
  const onLogin = pathname === '/auth/login';

  return (
    <header className="flex w-full items-center justify-between gap-[12px]">
      <div className="flex min-w-0 items-center gap-[4px]">
        {innerAuth && (
          <button
            type="button"
            onClick={() => router.push('/auth/login')}
            aria-label={t('back', 'Back')}
            className="-ms-[8px] flex size-[40px] shrink-0 items-center justify-center rounded-[8px] text-newTextColor hover:bg-boxHover"
          >
            <ChevronLeftIcon size={22} />
          </button>
        )}
        <LogoTextComponent />
      </div>
      {!innerAuth && !(disableRegistration && onLogin) && (
        <Link
          href={onLogin ? '/auth' : '/auth/login'}
          data-pq="auth-header-cta"
          className={headerCtaClass}
        >
          {onLogin
            ? t('create_a_new_account', 'Create a new account')
            : t('sign_in', 'Sign In')}
        </Link>
      )}
    </header>
  );
};

export const AuthModeFooter = () => {
  const t = useT();
  const pathname = usePathname();
  const { disableRegistration } = useVariables();
  const onLogin = pathname === '/auth/login';

  if (disableRegistration && onLogin) {
    return null;
  }

  return (
    <p className="mt-[16px] text-center text-[14px] text-textItemBlur">
      {onLogin ? (
        <>
          {t('dont_have_an_account', "Don't have an account?")}{' '}
          <Link
            href="/auth"
            className="font-[500] text-newTextColor underline hover:font-bold"
          >
            {t('create_one', 'Create one')}
          </Link>
        </>
      ) : (
        <>
          {t('already_have_an_account', 'Already have an account?')}{' '}
          <Link
            href="/auth/login"
            className="font-[500] text-newTextColor underline hover:font-bold"
          >
            {t('sign_in', 'Sign In')}
          </Link>
        </>
      )}
    </p>
  );
};

/** `year` comes from the server so the copyright never hydrates twice. */
export const AuthFooter = ({ year }: { year: number }) => {
  const t = useT();
  const { legalUrl } = useVariables();

  return (
    <footer className="flex items-center justify-between gap-[16px] text-[12px] text-textItemBlur">
      <span>© {year} PostQueen</span>
      {/* Only link legal pages this deployment actually serves — a self-hosted
          install without LEGAL_URL would otherwise footer-link two 404s. */}
      {!!legalUrl && (
        <div className="flex items-center gap-[10px]">
          <a
            href={`${legalUrl}/terms-of-service`}
            rel="nofollow"
            className="transition-colors hover:text-newTextColor"
          >
            {t('terms', 'Terms')}
          </a>
          <span aria-hidden="true" className="text-newBorder">
            |
          </span>
          <a
            href={`${legalUrl}/privacy-policy`}
            rel="nofollow"
            className="transition-colors hover:text-newTextColor"
          >
            {t('privacy', 'Privacy')}
          </a>
        </div>
      )}
    </footer>
  );
};
