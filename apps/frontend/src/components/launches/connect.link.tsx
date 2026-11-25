'use client';

import { FC, ReactNode, useCallback, useState } from 'react';
import useSWR from 'swr';
import { HttpStatusCode } from 'axios';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Spinner } from '@gitroom/react/ui/spinner';
import { PostQueenLogo } from '@gitroom/frontend/components/ui/logo.component';

interface ConnectLinkDetails {
  identifier: string;
  name: string;
  redirectTo?: string;
}

// The backend's own token shape. Anything else is never fetched: the token
// goes into the request path.
const isConnectToken = (token: string) => /^[a-f0-9]{64}$/.test(token);

const useConnectLink = (token: string) => {
  const fetch = useFetch();
  const load = useCallback(async (): Promise<ConnectLinkDetails> => {
    // `customFetch` resolves 4xx/5xx: an expired link has to read as an error,
    // not as a link to nothing
    const response = await fetch(`/integrations/public/connect/${token}`);
    if (!response.ok) {
      throw new Error('Connection link not found');
    }
    return response.json();
  }, [fetch, token]);

  // The link is the entity: no keepPreviousData
  return useSWR(isConnectToken(token) ? `connect-link-${token}` : null, load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    shouldRetryOnError: false,
  });
};

const Wrapper: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="relative flex flex-1 items-center justify-center overflow-hidden text-pqText">
    <div className="absolute inset-0 opacity-30" aria-hidden="true">
      <div className="absolute start-[10%] top-[20%] h-[300px] w-[300px] rounded-full bg-pqBrand blur-[120px]" />
      <div className="absolute bottom-[20%] end-[10%] h-[250px] w-[250px] rounded-full bg-pqPink blur-[120px]" />
    </div>
    {children}
  </div>
);

const Row: FC<{ icon: ReactNode; children: ReactNode }> = ({
  icon,
  children,
}) => (
  <div className="flex items-start gap-[12px]">
    <svg
      className="mt-[1px] h-[20px] w-[20px] shrink-0 text-pqBrand"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icon}
    </svg>
    <div className="flex-1">{children}</div>
  </div>
);

// The page a connect link opens (public API, MCP). Whoever opens it may have
// no PostQueen account: it says what connecting the channel means and where
// they end up, and only the button sends them to the platform.
export const ConnectLink: FC<{ token: string }> = ({ token }) => {
  const t = useT();
  const fetch = useFetch();
  const { data, error, isLoading } = useConnectLink(token);
  const [submitting, setSubmitting] = useState(false);
  const [failedMessage, setFailedMessage] = useState('');
  // The link, or the workspace it belongs to, went while the page was open
  const [expired, setExpired] = useState(false);

  const connect = useCallback(async () => {
    setSubmitting(true);
    setFailedMessage('');
    try {
      const response = await fetch(`/integrations/public/connect/${token}`, {
        method: 'POST',
      });
      const { url, message } = await response.json().catch(() => ({}));
      if (response.ok && url) {
        window.location.href = url;
        return;
      }
      if (response.status === HttpStatusCode.NotFound) {
        setExpired(true);
        return;
      }
      // a refused connection says why (the plan has no channels left)
      setFailedMessage(
        response.status === HttpStatusCode.BadRequest && message
          ? message
          : t(
              'could_not_connect_to_platform',
              'Could not connect to the platform'
            )
      );
    } catch {
      setFailedMessage(
        t('could_not_connect_to_platform', 'Could not connect to the platform')
      );
    }
    setSubmitting(false);
  }, [fetch, token, t]);

  if (isLoading) {
    return (
      <Wrapper>
        <div className="relative z-10 flex justify-center text-pqBrand">
          <Spinner
            width={48}
            height={48}
            borderWidth={3}
            label={t('loading', 'Loading')}
          />
        </div>
      </Wrapper>
    );
  }

  if (error || !data || expired) {
    return (
      <Wrapper>
        <div className="relative z-10 flex flex-col items-center px-[16px] text-center">
          <div className="mb-[24px] flex h-[80px] w-[80px] items-center justify-center rounded-full bg-pqDangerSoft">
            <svg
              className="h-[40px] w-[40px] text-pqDanger"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <h1 className="mb-[8px] text-[22px] font-[600] -tracking-[0.015em]">
            {t('connect_link_expired', 'This link is no longer valid')}
          </h1>
          <div className="max-w-[400px] text-[13.5px] text-pqMuted">
            {t(
              'connect_link_expired_description',
              'This link has already been used or has expired. Ask whoever sent it to you for a new one.'
            )}
          </div>
        </div>
      </Wrapper>
    );
  }

  // i18next escapes interpolated values for HTML, React already does
  const values = {
    platform: data.name,
    site: data.redirectTo,
    interpolation: { escapeValue: false },
  };

  return (
    <Wrapper>
      <div className="relative z-10 mx-auto w-full max-w-[500px] px-[16px] py-[40px]">
        <div className="flex flex-col overflow-hidden rounded-[16px] bg-pqPop shadow-[inset_0_0_0_1px_var(--border)]">
          <div className="flex items-center justify-center gap-[14px] bg-pqInner py-[32px]">
            <PostQueenLogo tileClassName="size-[64px]" />
            <div className="flex h-[36px] w-[36px] items-center justify-center rounded-[10px] bg-pqPop text-pqMuted shadow-[inset_0_0_0_1px_var(--border)]">
              <svg
                className="h-[18px] w-[18px]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 17H7a5 5 0 010-10h2" />
                <path d="M15 7h2a5 5 0 010 10h-2" />
                <path d="M8 12h8" />
              </svg>
            </div>
            <img
              src={`/icons/platforms/${data.identifier}.png`}
              alt={data.name}
              className="h-[64px] w-[64px] rounded-[16px]"
            />
          </div>

          <div className="flex flex-col gap-[24px] p-[24px] md:p-[32px]">
            <h1 className="text-center text-[22px] font-[600] leading-[30px] -tracking-[0.015em]">
              {t(
                'connect_link_title',
                'PostQueen wants to connect to your {{platform}}',
                values
              )}
            </h1>

            <div className="flex flex-col gap-[14px] rounded-[12px] p-[16px] text-[14px] shadow-[inset_0_0_0_1px_var(--border)]">
              <Row
                icon={
                  <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" />
                }
              >
                {t(
                  'connect_link_trust',
                  'Only continue if you trust whoever sent you this link'
                )}
              </Row>
              <Row icon={<path d="M13 3L5 13.5h6L10 21l8-10.5h-6L13 3z" />}>
                {t(
                  'connect_link_automate',
                  'PostQueen will be able to schedule and publish posts on your {{platform}} account',
                  values
                )}
              </Row>
              <Row
                icon={
                  <>
                    <rect x="4" y="4" width="16" height="6" rx="1.5" />
                    <rect x="4" y="14" width="16" height="6" rx="1.5" />
                    <path d="M8 7h.01M8 17h.01" />
                  </>
                }
              >
                {t(
                  'connect_link_system',
                  'Your account is added to the PostQueen workspace this link belongs to, and is managed from there'
                )}
              </Row>
              {!!data.redirectTo && (
                <Row
                  icon={
                    <>
                      <path d="M14 5h5v5" />
                      <path d="M19 5l-8 8" />
                      <path d="M11 6H6a1 1 0 00-1 1v11a1 1 0 001 1h11a1 1 0 001-1v-5" />
                    </>
                  }
                >
                  {t(
                    'connect_link_redirect',
                    'When you are done, you can continue to {{site}}, a website outside of PostQueen',
                    values
                  )}
                </Row>
              )}
            </div>

            <div className="text-center text-[12px] uppercase tracking-[0.5px] text-pqMuted">
              {t(
                'connect_link_next',
                'You will be taken to {{platform}} to sign in and approve the access',
                values
              )}
            </div>

            <div className="flex flex-col gap-[12px]">
              <button
                type="button"
                onClick={connect}
                disabled={submitting}
                className="flex min-h-[44px] items-center justify-center gap-[8px] rounded-pqSm bg-pqBrand px-[16px] py-[10px] text-[14px] font-[600] text-pqOnBrand transition-colors hover:bg-pqBrandHover disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Spinner />
                    {t('connect_link_connecting', 'Connecting...')}
                  </>
                ) : (
                  t('connect_link_continue', 'Continue to {{platform}}', values)
                )}
              </button>
              {!!failedMessage && (
                <div
                  role="alert"
                  className="rounded-pqMd bg-pqDangerSoft px-[14px] py-[12px] text-center text-[13.5px] text-pqDanger shadow-[inset_0_0_0_1px_var(--dangerLine)]"
                >
                  {failedMessage}
                </div>
              )}
              <div className="text-center text-[12px] text-pqMuted">
                {t(
                  'connect_link_close',
                  'Not what you expected? Close this page and nothing will be connected.'
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Wrapper>
  );
};
