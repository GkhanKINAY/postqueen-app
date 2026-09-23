import type { Metadata } from 'next';
import Link from 'next/link';
import clsx from 'clsx';
import { internalFetch } from '@gitroom/helpers/utils/internal.fetch';
import { isBillingEnabled } from '@gitroom/helpers/utils/billing.enabled';
import { getT } from '@gitroom/react/translation/get.translation.service.backend';
import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';
import { RenderPreviewDateClient } from '@gitroom/frontend/components/preview/render.preview.date.client';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Data deletion request',
  robots: { index: false, follow: false },
};

// Where a platform's data deletion answer sends the person who asked: the
// status of their request, by the confirmation code the platform showed them.
export default async function DataDeletionStatus(props: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await props.params;
  const t = await getT();

  const request = await (
    await internalFetch(
      `/public/platform-deletion/${encodeURIComponent(code)}`
    )
  ).json();
  const found = !!request?.confirmationCode;

  // Same rule as the app's help menu: our address on the hosted service only.
  const supportEmail =
    process.env.SUPPORT_EMAIL ||
    (isBillingEnabled() ? 'support@postqueen.ai' : '');

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
          <h1 className="text-[18px] font-[600] text-pqText">
            {t('data_deletion_title', 'Data deletion request')}
          </h1>

          {!found ? (
            <p className="text-[14px] text-pqMuted">
              {t(
                'data_deletion_not_found',
                'No data deletion request has this code.'
              )}
            </p>
          ) : (
            <>
              <dl className="grid grid-cols-[auto_1fr] items-center gap-x-[16px] gap-y-[10px] text-[14px]">
                <dt className="text-pqSoft">
                  {t('data_deletion_code', 'Confirmation code')}
                </dt>
                <dd className="break-all font-mono text-pqText">
                  {request.confirmationCode}
                </dd>
                <dt className="text-pqSoft">
                  {t('data_deletion_status', 'Status')}
                </dt>
                <dd className="flex flex-wrap items-center gap-[8px]">
                  <span
                    className={clsx(
                      'grid h-[20px] shrink-0 place-items-center rounded-full px-[8px] text-[11px] font-[600]',
                      request.completedAt
                        ? 'bg-pqOkSoft text-pqOk'
                        : 'bg-pqWarnSoft text-pqWarn'
                    )}
                  >
                    {request.completedAt
                      ? t('data_deletion_completed', 'Completed')
                      : t('data_deletion_in_progress', 'In progress')}
                  </span>
                  <span className="text-[13px] text-pqMuted">
                    <RenderPreviewDateClient
                      date={request.completedAt || request.createdAt}
                    />
                  </span>
                </dd>
              </dl>

              {!!request.completedAt && (
                <p className="text-[14px] leading-[1.5] text-pqText">
                  {request.channels
                    ? t(
                        'data_deletion_done',
                        'PostQueen removed the channels connected with this account, together with their posts, access tokens and profile details.'
                      )
                    : t(
                        'data_deletion_none',
                        'PostQueen found no channels connected with this account. If you still see one in PostQueen, delete it on the Channels page.'
                      )}
                </p>
              )}

              {!!supportEmail && (
                <p className="text-[13px] text-pqMuted">
                  {t(
                    'data_deletion_contact',
                    'Questions about this request? Email {{email}} and include the confirmation code.',
                    { email: supportEmail }
                  )}
                </p>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
