'use client';

import { FC, useState } from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { DatePicker } from '@gitroom/frontend/components/launches/helpers/date.picker';
import { useViewport } from '@gitroom/frontend/components/layout/use.viewport';
import { useDateFormat } from '@gitroom/frontend/components/launches/helpers/date.format';
import { CalendarIcon } from '@gitroom/frontend/components/ui/icons';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';

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

/**
 * Post a published post again. What is already out stays live on the
 * network; in PostQueen the post moves to the time picked here and goes out
 * again then. The caller owns the request and closes everything once it
 * has worked.
 */
export const PostAgainDialog: FC<{
  date: dayjs.Dayjs;
  onConfirm: (date: dayjs.Dayjs) => Promise<void>;
  onClose: () => void;
}> = ({ date: initial, onConfirm, onClose }) => {
  const t = useT();
  const [date, setDate] = useState(initial);
  const [saving, setSaving] = useState(false);
  // A past time would post at once; dragging refuses past slots too.
  const past = date.isBefore(dayjs());
  return (
    <div className="flex flex-col gap-[16px]">
      <p className="m-0 text-[14px] leading-[1.6] text-pqMuted">
        {t(
          'post_again_body',
          'What is already out stays live on the network. In PostQueen the post moves to the time you pick and goes out again then, so its link and statistics start over.'
        )}
      </p>
      <div className="flex flex-col gap-[6px]">
        <ComposeWhen date={date} onChange={setDate} />
        {past && (
          <span className="text-[12.5px] text-pqWarn">
            {t('post_again_pick_future', 'Pick a time in the future.')}
          </span>
        )}
      </div>
      <div className="flex justify-end gap-[8px]">
        <button
          type="button"
          onClick={onClose}
          className="h-[40px] rounded-[10px] px-[14px] text-[13.5px] font-[600] text-pqMuted transition-colors hover:bg-pqHover hover:text-pqText"
        >
          {t('cancel', 'Cancel')}
        </button>
        <Button
          type="button"
          loading={saving}
          disabled={past}
          onClick={async () => {
            setSaving(true);
            await onConfirm(date);
            setSaving(false);
          }}
        >
          {t('schedule_again', 'Schedule again')}
        </Button>
      </div>
    </div>
  );
};
