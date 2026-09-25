import type { Metadata } from 'next';
import Link from 'next/link';
import { internalFetch } from '@gitroom/helpers/utils/internal.fetch';
import { getT } from '@gitroom/react/translation/get.translation.service.backend';
import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';
import { EmailUnsubscribeClient } from '@gitroom/frontend/components/preview/email.unsubscribe.client';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Email notifications',
  robots: { index: false, follow: false },
};

// Where "Turn off ..." in a notification email's footer lands. The token in
// the link is the only credential, and nothing changes until the button is
// pressed: mail scanners open every link in an email.
export default async function Unsubscribe(props: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = '' } = await props.searchParams;
  const t = await getT();

  const kind: string | null = token
    ? (
        await (
          await internalFetch(
            `/public/emails/unsubscribe?token=${encodeURIComponent(token)}`
          )
        )
          .json()
          .catch((): { kind?: string } | null => null)
      )?.kind ?? null
    : null;

  const titles: Record<string, string> = {
    success: t('email_off_title_success', 'Turn off success emails?'),
    failure: t('email_off_title_failure', 'Turn off failure emails?'),
    streak: t('email_off_title_streak', 'Turn off streak emails?'),
    publishing: t(
      'email_off_title_publishing',
      'Turn off the hourly publishing summary?'
    ),
  };

  return (
    <div className="min-h-dvh bg-pqBg text-pqText pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-[20px] px-[16px] py-[20px] md:px-[24px] md:py-[28px]">
        <header className="border-b border-pqBorder pb-[16px]">
          <Link
            href="/"
            className="flex items-center gap-[10px] text-[20px] text-pqText"
          >
            <LogoTextComponent />
          </Link>
        </header>

        <main className="flex flex-col gap-[14px] rounded-[14px] border border-pqBorder bg-pqInner p-[18px] md:p-[20px]">
          {kind && titles[kind] ? (
            <>
              <h1 className="text-[18px] font-[600] text-pqText">
                {titles[kind]}
              </h1>
              <p className="text-[14px] leading-[1.5] text-pqMuted">
                {t(
                  'email_off_body',
                  'You will stop getting these emails at this address. Sign-in, security and billing emails still come.'
                )}
              </p>
              <EmailUnsubscribeClient token={token} />
            </>
          ) : (
            <>
              <h1 className="text-[18px] font-[600] text-pqText">
                {t('email_off_invalid_title', 'This link no longer works')}
              </h1>
              <p className="text-[14px] leading-[1.5] text-pqMuted">
                {t(
                  'email_off_invalid',
                  'You can choose which emails you get in Settings, under Notifications.'
                )}
              </p>
              <Link
                href="/settings?tab=notifications"
                className="text-[14px] font-[600] text-pqFocused"
              >
                {t('email_off_settings', 'Open notification settings')}
              </Link>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
