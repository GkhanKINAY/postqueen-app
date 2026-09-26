'use client';

import {
  createContext,
  FC,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { useSWRConfig } from 'swr';
import { useCopilotContext } from '@copilotkit/react-core';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  formatCredits,
  useCreditsBalance,
} from '@gitroom/frontend/components/billing/use.credits.balance';
import {
  CreditsIcon,
  useCanOpenBilling,
} from '@gitroom/frontend/components/billing/credits.amount';

/**
 * The balance where people talk to Copilot: the Copilot page's chat bar and
 * the Create Post rail. Only the balance, never a price per message: a turn
 * costs what its tokens cost. Nothing with billing off or when unlimited,
 * and a link to Billing only for whoever the rail shows Billing to.
 */
export const CopilotCreditsChip: FC<{ className?: string }> = ({
  className,
}) => {
  const t = useT();
  const { data } = useCreditsBalance();
  const canOpenBilling = useCanOpenBilling();
  if (!data || data.unlimited) {
    return null;
  }
  const value = formatCredits(data.balance ?? 0);
  const content = (
    <>
      <CreditsIcon />
      <span aria-hidden="true" className="tabular-nums">
        {value}
      </span>
      <span className="sr-only">
        {t('credits_balance_left', '{{amount}} credits left', {
          amount: value,
        })}
      </span>
    </>
  );
  const chip = clsx(
    'flex h-[30px] shrink-0 items-center gap-[6px] rounded-full bg-pqSettings px-[10px] text-[12.5px] font-[600] text-pqText mobile:h-[44px]',
    className
  );
  return canOpenBilling ? (
    <Link
      href="/billing"
      data-pq="copilot-credits"
      title={t('get_more_credits', 'Get more credits')}
      className={clsx(chip, 'transition-colors hover:bg-pqHover')}
    >
      {content}
    </Link>
  ) : (
    <span data-pq="copilot-credits" className={chip}>
      {content}
    </span>
  );
};

/**
 * A run `/copilot/chat` or `/copilot/agent` refused for credits: a 402 with
 * `code: 'insufficient_credits'`. CopilotKit hands the HTTP error on with its
 * status and parsed body.
 */
const isInsufficientCredits = (error: any) =>
  error?.status === 402 && error?.payload?.code === 'insufficient_credits';

export const CopilotCreditsContext = createContext<{ refused: boolean }>({
  refused: false,
});

/**
 * For a surface's live bridge, inside its CopilotKit provider, fed the
 * chat's `isLoading`. Every finished run reads the balance again, so the
 * chip and the notice follow what the turn spent (a history replay on
 * connect reads it once more, which is harmless). A run refused for credits
 * holds the notice until the next run starts or the balance goes up.
 *
 * The error comes in through an internal handler: `onError` on the v1
 * `<CopilotKit>` is only called with a Copilot Cloud key.
 */
export const useCopilotCreditsWatch = (isLoading: boolean) => {
  const { setInternalErrorHandler, removeInternalErrorHandler } =
    useCopilotContext();
  const { mutate } = useSWRConfig();
  const { data } = useCreditsBalance();
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    setInternalErrorHandler({
      credits: (event: { error?: unknown }) => {
        if (isInsufficientCredits(event.error)) {
          setRefused(true);
        }
      },
    });
    return () => removeInternalErrorHandler('credits');
  }, [setInternalErrorHandler, removeInternalErrorHandler]);

  const wasLoading = useRef(false);
  useEffect(() => {
    if (!wasLoading.current && isLoading) {
      setRefused(false);
    }
    if (wasLoading.current && !isLoading) {
      mutate('credits-balance');
    }
    wasLoading.current = isLoading;
  }, [isLoading, mutate]);

  const balance = data?.balance ?? null;
  const lastBalance = useRef(balance);
  useEffect(() => {
    if (
      balance !== null &&
      lastBalance.current !== null &&
      balance > lastBalance.current
    ) {
      setRefused(false);
    }
    lastBalance.current = balance;
  }, [balance]);

  return useMemo(() => ({ refused }), [refused]);
};

/**
 * Whether this organization is out of credits: sending is off, and the
 * message box says why. A refused run shows the same notice but leaves
 * sending on while the balance reads positive.
 */
export const useCopilotCreditsOut = () => {
  const { data } = useCreditsBalance();
  const { refused } = useContext(CopilotCreditsContext);
  const empty = !!data && !data.unlimited && (data.balance ?? 0) <= 0;
  return { empty, notice: empty || refused };
};

/**
 * In the message box when Copilot has no credits to answer with. The live
 * region stays mounted so the message is announced when it comes in.
 */
export const CopilotCreditsNotice: FC<{ className?: string }> = ({
  className,
}) => {
  const t = useT();
  const { notice } = useCopilotCreditsOut();
  const canOpenBilling = useCanOpenBilling();
  return (
    <div role="status" className={clsx('empty:hidden', className)}>
      {notice && (
        <div
          data-pq="copilot-credits-out"
          className="flex flex-wrap items-center gap-x-[6px] gap-y-[2px] rounded-[10px] bg-pqWarnSoft px-[12px] py-[8px] text-[12.5px] text-pqWarn"
        >
          <CreditsIcon />
          <span>
            {t(
              'copilot_out_of_credits',
              'You are out of credits, so Copilot cannot answer.'
            )}
          </span>
          {canOpenBilling && (
            <Link href="/billing" className="font-[600] underline">
              {t('get_more_credits', 'Get more credits')}
            </Link>
          )}
        </div>
      )}
    </div>
  );
};
