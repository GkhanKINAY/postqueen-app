'use client';

import { FC, useCallback, useState } from 'react';
import clsx from 'clsx';
import useSWR from 'swr';
import { Skeleton } from '@gitroom/react/ui/skeleton';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { tierLabel } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';

/** One row of `GET /billing/invoices` (`PaymentInvoice` on the server). */
interface Invoice {
  id: string;
  number: string | null;
  kind: 'plan' | 'credits' | 'lifetime' | 'other';
  tier: string | null;
  period: 'MONTHLY' | 'YEARLY' | null;
  credits: number | null;
  description: string | null;
  amount: number;
  currency: string;
  created: number;
  periodEnd: number | null;
  status: 'paid' | 'pending' | 'failed' | 'void';
  downloadUrl: string | null;
  viewUrl: string | null;
}

const PAGE_SIZE = 6;

const STATUS_LOOK: Record<Invoice['status'], string> = {
  paid: 'bg-pqOkSoft text-pqOk',
  pending: 'bg-pqWarnSoft text-pqWarn',
  failed: 'bg-pqDangerSoft text-pqDanger',
  void: 'bg-pqHover text-pqMuted',
};

const useInvoices = () => {
  const fetch = useFetch();
  const load = useCallback(async (): Promise<Invoice[]> => {
    // customFetch resolves a 4xx/5xx; a failed read must not show as an
    // account that was never billed.
    const response = await fetch('/billing/invoices');
    if (!response.ok) {
      throw new Error('Could not load the invoices');
    }
    return response.json();
  }, [fetch]);
  return useSWR('billing-invoices', load, { revalidateOnFocus: false });
};

/** Minor units to a price, in the invoice's own currency. */
const formatAmount = (amount: number, currency: string) => {
  const format = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
  });
  return format.format(
    amount / 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2),
  );
};

const formatDate = (unix: number) =>
  newDayjs(unix * 1000)
    .local()
    .format('D MMM, YYYY');

const InvoiceLink: FC<{ href: string; label: string; download?: boolean }> = ({
  href,
  label,
  download,
}) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    aria-label={label}
    title={label}
    className="grid size-[32px] place-items-center rounded-[9px] text-pqMuted transition-colors hover:bg-pqHover hover:text-pqText"
  >
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={download ? undefined : 'rtl:-scale-x-100'}
    >
      {download ? (
        <>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="M7 10l5 5 5-5" />
          <path d="M12 15V3" />
        </>
      ) : (
        <>
          <path d="M15 3h6v6" />
          <path d="M10 14L21 3" />
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        </>
      )}
    </svg>
  </a>
);

const HistoryGhost: FC = () => (
  <div className="flex flex-col">
    {[0, 1, 2].map((i) => (
      <div
        key={i}
        className="flex items-center gap-[12px] border-t border-pqLine py-[12px] first:border-t-0"
      >
        <div className="flex flex-1 flex-col gap-[6px]">
          <Skeleton className="h-[14px] w-[140px]" />
          <Skeleton className="h-[12px] w-[90px]" />
        </div>
        <Skeleton className="h-[14px] w-[60px]" />
        <Skeleton className="h-[22px] w-[58px] !rounded-full" />
      </div>
    ))}
  </div>
);

/**
 * Billing history: every invoice of the organization, with the hosted invoice
 * and its PDF. The billing portal row above stays the place to change the
 * card; this only lists what was billed.
 */
export const BillingHistory: FC = () => {
  const t = useT();
  const { data, error, isLoading } = useInvoices();
  const [visible, setVisible] = useState(PAGE_SIZE);

  const label = (invoice: Invoice) => {
    switch (invoice.kind) {
      case 'plan':
        return [
          invoice.tier
            ? tierLabel(invoice.tier)
            : t('billing_subscription', 'Subscription'),
          invoice.period === 'YEARLY'
            ? t('billing_yearly', 'Yearly')
            : invoice.period === 'MONTHLY'
              ? t('billing_monthly', 'Monthly')
              : '',
        ]
          .filter(Boolean)
          .join(' · ');
      case 'credits':
        return t('billing_invoice_credits', '{{count}} credits', {
          count: invoice.credits ?? 0,
        });
      case 'lifetime':
        return t('founding_member', 'Founding member');
      default:
        return invoice.description || t('billing_invoice', 'Invoice');
    }
  };

  const statusLabel: Record<Invoice['status'], string> = {
    paid: t('billing_status_paid', 'Paid'),
    pending: t('billing_status_open', 'Pending'),
    failed: t('billing_status_failed', 'Failed'),
    void: t('billing_status_void', 'Void'),
  };

  return (
    <div
      data-pq="billing-history"
      className="flex flex-col gap-[14px] rounded-[16px] bg-pqInner p-[20px_22px] outline outline-1 -outline-offset-1 outline-pqBorder"
    >
      <div className="text-[18px] font-[600] -tracking-[0.01em] text-pqText">
        {t('billing_history', 'Billing history')}
      </div>

      {isLoading && !data ? (
        <HistoryGhost />
      ) : error ? (
        <div className="text-[13px] text-pqMuted">
          {t('billing_invoices_failed', 'Could not load your invoices')}
        </div>
      ) : !data?.length ? (
        <div className="text-[13px] text-pqMuted">
          {t(
            'billing_no_invoices',
            'No invoices yet. They show up here after your first payment.',
          )}
        </div>
      ) : (
        <div className="flex flex-col">
          {data.slice(0, visible).map((invoice) => (
            <div
              key={invoice.id}
              data-pq="billing-history-row"
              className="flex flex-wrap items-center gap-x-[12px] gap-y-[6px] border-t border-pqLine py-[12px] first:border-t-0"
            >
              <div className="flex min-w-[160px] flex-1 flex-col gap-[2px]">
                <div className="truncate text-[14px] font-[600] text-pqText">
                  {label(invoice)}
                </div>
                <div className="truncate text-[12.5px] text-pqMuted">
                  <bdi>{formatDate(invoice.created)}</bdi>
                  {!!invoice.number && (
                    <>
                      {' · '}
                      <bdi>{invoice.number}</bdi>
                    </>
                  )}
                </div>
              </div>
              <div className="text-[14px] font-[600] tabular-nums text-pqText">
                <bdi>{formatAmount(invoice.amount, invoice.currency)}</bdi>
              </div>
              <span
                className={clsx(
                  'flex h-[22px] items-center rounded-full px-[9px] text-[11.5px] font-[600]',
                  STATUS_LOOK[invoice.status],
                )}
              >
                {statusLabel[invoice.status]}
              </span>
              <div className="flex w-[68px] justify-end gap-[4px]">
                {!!invoice.viewUrl && (
                  <InvoiceLink
                    href={invoice.viewUrl}
                    label={t('billing_view_invoice', 'View invoice')}
                  />
                )}
                {!!invoice.downloadUrl && (
                  <InvoiceLink
                    href={invoice.downloadUrl}
                    label={t('billing_download_invoice', 'Download invoice')}
                    download
                  />
                )}
              </div>
            </div>
          ))}
          {data.length > visible && (
            <button
              type="button"
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
              className="mt-[6px] h-[36px] self-start rounded-[10px] px-[12px] text-[13px] font-[600] text-pqMuted transition-colors hover:bg-pqHover hover:text-pqText"
            >
              {t('billing_show_older', 'Show older invoices')}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
