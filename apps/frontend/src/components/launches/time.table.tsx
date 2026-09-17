'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import dayjs from 'dayjs';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { Select } from '@gitroom/react/form/select';
import { Button } from '@gitroom/react/form/button';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
// @ts-ignore
import useKeypress from 'react-use-keypress';
import {
  ModalFormActions,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';
import { sortBy } from 'lodash';
import { usePreventWindowUnload } from '@gitroom/react/helpers/use.prevent.window.unload';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { useDateFormat } from '@gitroom/frontend/components/launches/helpers/date.format';
import clsx from 'clsx';
import {
  TrashIcon,
  PlusIcon,
  DelayIcon,
} from '@gitroom/frontend/components/ui/icons';

dayjs.extend(utc);
dayjs.extend(timezone);

const hours = [...Array(24).keys()].map((i) => ({
  value: i,
}));

const minutes = [...Array(60).keys()].map((i) => ({
  value: i,
}));

export const TimeTable: FC<{
  integration: Integrations;
  mutate: () => void;
}> = (props) => {
  const t = useT();
  const {
    integration: { time },
    mutate,
  } = props;
  const [currentTimes, setCurrentTimes] = useState([...time]);
  const [hour, setHour] = useState(0);
  const [minute, setMinute] = useState(0);
  const fetch = useFetch();
  const modal = useModals();
  const toast = useToaster();
  const { timePattern } = useDateFormat();
  usePreventWindowUnload(true);

  // Scheduled Times is low-stakes — Escape/X discard unsaved slot edits by
  // unmounting (state lives only in this component). Keep confirm on Create Post.
  const closeWithoutConfirm = useCallback(() => {
    modal.closeAll();
  }, [modal]);

  useKeypress('Escape', closeWithoutConfirm);

  const removeSlot = useCallback(
    (index: number) => async () => {
      if (
        !(await deleteDialog(
          t(
            'are_you_sure_you_want_to_delete_this_slot',
            'Are you sure you want to delete this slot?'
          )
        ))
      ) {
        return;
      }
      setCurrentTimes((prev) => prev.filter((_, i) => i !== index));
    },
    []
  );

  const addHour = useCallback(() => {
    const calculateMinutes =
      newDayjs()
        .utc()
        .startOf('day')
        .add(hour, 'hours')
        .add(minute, 'minutes')
        .diff(newDayjs().utc().startOf('day'), 'minutes') -
      dayjs.tz().utcOffset();
    setCurrentTimes((prev) => [
      ...prev,
      {
        time: calculateMinutes,
      },
    ]);
  }, [hour, minute]);

  const times = useMemo(() => {
    return sortBy(
      currentTimes.map(({ time }) => ({
        value: time,
        formatted: dayjs
          .utc()
          .startOf('day')
          .add(time, 'minutes')
          .local()
          .format(timePattern()),
      })),
      (p) => p.value
    );
  }, [currentTimes, timePattern]);

  const save = useCallback(async () => {
    const response = await fetch(`/integrations/${props.integration.id}/time`, {
      method: 'POST',
      body: JSON.stringify({
        time: currentTimes,
      }),
    });

    // The response was never checked, so a rejected payload still closed the
    // modal under a green "Settings updated" and the list snapped back on the
    // next fetch.
    if (!response.ok) {
      toast.show(
        t('settings_update_failed', 'Could not save the posting times'),
        'warning'
      );
      return;
    }

    mutate();
    toast.show(t('settings_updated', 'Settings updated'), 'success');
    modal.closeAll();
  }, [currentTimes]);

  return (
    <div data-pq="time-table" className="flex flex-col gap-[14px]">
      <div className="rounded-[12px] bg-pqPop p-[14px] shadow-[inset_0_0_0_1px_var(--border)]">
        <div className="mb-[12px] flex items-center gap-[8px] text-[14px] font-[600] text-pqText">
          <DelayIcon size={16} className="text-pqBrand" />
          {t('add_time_slot', 'Add Time Slot')}
        </div>

        <div className="flex items-end gap-[10px]">
          <div className="min-w-0 flex-1">
            <Select
              label={t('hour', 'Hour')}
              name="hour"
              disableForm={true}
              hideErrors={true}
              value={hour}
              onChange={(e) => setHour(Number(e.target.value))}
            >
              {hours.map((h) => (
                <option key={h.value} value={h.value}>
                  {h.value.toString().padStart(2, '0')}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-0 flex-1">
            <Select
              label={t('minutes', 'Minutes')}
              name="minutes"
              disableForm={true}
              hideErrors={true}
              value={minute}
              onChange={(e) => setMinute(Number(e.target.value))}
            >
              {minutes.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.value.toString().padStart(2, '0')}
                </option>
              ))}
            </Select>
          </div>
          <button
            type="button"
            onClick={addHour}
            className="flex h-[40px] shrink-0 items-center gap-[6px] rounded-[10px] bg-pqBrand px-[14px] text-[13.5px] font-[600] text-pqOnBrand transition-colors hover:bg-pqBrandHover"
          >
            <PlusIcon size={14} />
            {t('add', 'Add')}
          </button>
        </div>
      </div>

      <div>
        <div className="mb-[8px] text-[12.5px] font-[500] text-pqMuted">
          {t('scheduled_times', 'Scheduled Times')} ({times.length})
        </div>

        {times.length === 0 ? (
          <div className="rounded-[12px] px-[14px] py-[22px] text-center text-[13px] text-pqSoft shadow-[inset_0_0_0_1px_var(--border)]">
            {t('no_time_slots', 'No time slots added yet')}
          </div>
        ) : (
          <div className="flex flex-col gap-[8px]">
            {times.map((timeSlot, index) => (
              <div
                key={`${timeSlot.value}-${index}`}
                className={clsx(
                  'group flex h-[44px] items-center justify-between rounded-[10px] bg-pqPop px-[14px]',
                  'shadow-[inset_0_0_0_1px_var(--border)] transition-[box-shadow] hover:shadow-[inset_0_0_0_1px_var(--brand)]'
                )}
              >
                <div className="flex items-center gap-[10px]">
                  <div className="h-[8px] w-[8px] rounded-full bg-pqBrand" />
                  <span className="text-[14px] font-[600] tabular-nums text-pqText">
                    {timeSlot.formatted}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={removeSlot(index)}
                  className="rounded-[8px] p-[8px] text-pqMuted opacity-0 transition-opacity hover:bg-pqDangerSoft hover:text-pqDanger group-hover:opacity-100"
                >
                  <TrashIcon size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* A channel with no slots contributes nothing to slot-based
          scheduling, so the API rejects an empty list — say that here
          instead of letting the request fail. */}
      <div>
        <ModalFormActions onCancel={closeWithoutConfirm}>
          <Button
            type="button"
            className="h-[40px] shrink-0 rounded-[10px] px-[18px] text-[13.5px] font-[600]"
            onClick={save}
            disabled={!currentTimes.length}
          >
            {t('save_changes', 'Save Changes')}
          </Button>
        </ModalFormActions>
        {!currentTimes.length && (
          <p className="mt-[8px] text-[12.5px] text-pqMuted">
            {t('time_slots_required', 'Add at least one time slot to save.')}
          </p>
        )}
      </div>
    </div>
  );
};
