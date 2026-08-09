import { FC, ReactNode, useCallback, useEffect, useState } from 'react';
import Loading from '@gitroom/frontend/components/layout/loading';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { timer } from '@gitroom/helpers/utils/timer';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useDecisionModal } from '@gitroom/frontend/components/layout/new-modal';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

/** ~60 seconds at the 1s poll interval, matching FinishTrial's cap. */
const MAX_POLL_ATTEMPTS = 60;

export const CheckPayment: FC<{
  check: string;
  mutate: () => void;
  children: ReactNode;
}> = (props) => {
  if (!props.check) {
    return <>{props.children}</>;
  }
  return <CheckPaymentInner {...props} />;
};

export const CheckPaymentInner: FC<{
  check: string;
  mutate: () => void;
  children: ReactNode;
}> = (props) => {
  const [showLoader, setShowLoader] = useState(true);
  const fetch = useFetch();
  const toaster = useToaster();
  const modal = useDecisionModal();
  const t = useT();

  useEffect(() => {
    if (showLoader) {
      document.querySelector('body')?.classList.add('overflow-hidden');
      Array.from(document.querySelectorAll('.blurMe') || []).map((p) =>
        p.classList.add('blur-xs', 'pointer-events-none')
      );
    } else {
      document.querySelector('body')?.classList.remove('overflow-hidden');
      Array.from(document.querySelectorAll('.blurMe') || []).map((p) =>
        p.classList.remove('blur-xs', 'pointer-events-none')
      );
    }
  }, [showLoader]);

  const checkSubscription = useCallback(async (attempt = 0) => {
    let status: number | undefined;
    try {
      const response = await fetch('/billing/check/' + props.check);
      if (!response.ok) {
        throw new Error(`check responded ${response.status}`);
      }
      ({ status } = await response.json());
    } catch {
      // A failed poll used to break the recursion with an unhandled rejection,
      // which left the overlay up with nothing driving it. Treat it as "not
      // resolved yet" and let the attempt cap decide when to stop.
      status = 0;
    }
    if (status === 0) {
      // ~60s at 1s intervals, then hand the screen back. Without a cap this
      // polled forever behind a blurred, pointer-events-none overlay, and
      // `/billing/check` answers 0 for "no row was written and never will be"
      // as well as for "still processing" — so a webhook that failed to grant
      // trapped the customer with no way out but editing the URL.
      if (attempt >= MAX_POLL_ATTEMPTS) {
        setShowLoader(false);
        modal.open({
          title: t('billing_still_processing_title', 'Payment still processing'),
          onlyApprove: true,
          approveLabel: t('close', 'Close'),
          description: t(
            'billing_still_processing',
            'Your payment is taking longer than usual to confirm. Your card has not been charged twice — if your plan does not appear in a few minutes, contact support and we will sort it out.'
          ),
        });
        props.mutate();
        return;
      }
      await timer(1000);
      return checkSubscription(attempt + 1);
    }
    if (status === 1) {
      modal.open({
        title: 'Invalid Payment',
        onlyApprove: true,
        approveLabel: 'OK',
        description:
          'We could not validate your payment method, please try again',
      });
      setShowLoader(false);
    }
    if (status === 2) {
      setShowLoader(false);
      props.mutate();
    }
  }, []);
  useEffect(() => {
    checkSubscription();
  }, []);
  if (showLoader) {
    return (
      <div className="fixed bg-black/40 w-full h-full flex justify-center items-center z-[400]">
        <div className="text-pqBrand">
          <Loading height={250} width={250} />
        </div>
      </div>
    );
  }
  return props.children;
};
