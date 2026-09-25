'use client';

import Link from 'next/link';
import { FC, useCallback, useState } from 'react';
import { Button } from '@gitroom/react/form/button';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export const EmailUnsubscribeClient: FC<{ token: string }> = ({ token }) => {
  const fetch = useFetch();
  const toast = useToaster();
  const t = useT();
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');

  const turnOff = useCallback(async () => {
    setState('sending');
    const response = await fetch(
      `/public/emails/unsubscribe?token=${encodeURIComponent(token)}`,
      { method: 'POST' }
    );
    if (!response.ok) {
      setState('idle');
      toast.show(t('something_went_wrong', 'Something went wrong'), 'warning');
      return;
    }
    setState('done');
  }, [fetch, toast, t, token]);

  if (state === 'done') {
    return (
      <div className="flex flex-col gap-[10px]">
        <p className="text-[14px] font-[600] leading-[1.5] text-pqOk">
          {t(
            'email_off_done',
            'Done. You will not get these emails any more.'
          )}
        </p>
        <Link
          href="/settings?tab=notifications"
          className="text-[14px] font-[600] text-pqFocused"
        >
          {t('email_off_settings', 'Open notification settings')}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Button onClick={turnOff} loading={state === 'sending'}>
        {t('email_off_button', 'Turn them off')}
      </Button>
    </div>
  );
};
