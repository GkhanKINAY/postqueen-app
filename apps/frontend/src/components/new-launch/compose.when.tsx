'use client';

import { FC } from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { DatePicker } from '@gitroom/frontend/components/launches/helpers/date.picker';
import { useViewport } from '@gitroom/frontend/components/layout/use.viewport';
import { useDateFormat } from '@gitroom/frontend/components/launches/helpers/date.format';
import { CalendarIcon } from '@gitroom/frontend/components/ui/icons';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export const ComposeWhen: FC<{
  date: dayjs.Dayjs;
  onChange: (date: dayjs.Dayjs) => void;
}> = ({ date, onChange }) => {
  const { touch } = useViewport();
  return (
    <div
      data-pq="composer-when"
      className={clsx('flex min-w-0 items-center', touch && 'w-full')}
    >
      <DatePicker
        date={date}
        onChange={onChange}
        className={clsx(
          '!ml-0 text-[15px] font-[600] text-pqText',
          touch && 'w-full'
        )}
      />
    </div>
  );
};

/**
 * A published post already went out, so its time is a fact rather than a
 * choice. Same chip as the picker above, without the picker.
 */
export const ComposePublishedAt: FC<{ date: dayjs.Dayjs }> = ({ date }) => {
  const { touch } = useViewport();
  const t = useT();
  const { dateTimePattern } = useDateFormat();
  return (
    <div
      data-pq="composer-published-at"
      className={clsx(
        'flex h-[44px] min-w-0 select-none items-center justify-center gap-[8px] rounded-[8px] border border-newTextColor/10 px-[16px] text-[15px] font-[600] text-pqText',
        touch && 'w-full'
      )}
    >
      <CalendarIcon className="shrink-0" />
      <span className="min-w-0 truncate whitespace-nowrap">
        {t('published', 'Published')}{' '}
        <span className="tabular-nums">{date.format(dateTimePattern())}</span>
      </span>
    </div>
  );
};
