'use client';

import { FC } from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { DatePicker } from '@gitroom/frontend/components/launches/helpers/date.picker';
import { useViewport } from '@gitroom/frontend/components/layout/use.viewport';

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
