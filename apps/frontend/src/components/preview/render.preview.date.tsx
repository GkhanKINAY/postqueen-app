'use client';

import { FC } from 'react';
import { useDateFormat } from '@gitroom/frontend/components/launches/helpers/date.format';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { fromUtc } from '@gitroom/frontend/components/layout/set.timezone';

export const RenderPreviewDate: FC<{ date: string }> = ({ date }) => {
  const { longDateTimePattern } = useDateFormat();
  const t = useT();
  const parsed = fromUtc(date);
  if (!date || !parsed.isValid()) {
    return <>{t('not_scheduled', 'Not scheduled')}</>;
  }
  return <>{parsed.format(longDateTimePattern())}</>;
};
