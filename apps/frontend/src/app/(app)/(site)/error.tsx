'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// One page failing must not take the whole app with it. Without a boundary
// here, any render error in a signed-in page went to `global-error.tsx`, which
// replaces the root layout: navigation, sidebar and all, leaving an empty
// window. Caught at this level, the error stays inside the page area, the shell
// around it keeps working, and `reset` retries the page in place.
export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-[56px_24px]">
      <div className="flex max-w-[520px] flex-col items-center gap-[16px] text-center">
        <h1 className="font-display text-[24px] font-[700] -tracking-[0.02em] text-pqText">
          {t('something_went_wrong', 'Something went wrong')}
        </h1>
        <Button
          onClick={() => reset()}
          className="h-[42px] rounded-[10px] px-[18px] text-[13.5px] font-[600]"
        >
          {t('try_again', 'Try again')}
        </Button>
      </div>
    </div>
  );
}
