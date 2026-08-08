'use client';
import 'reflect-metadata';

import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { useToaster } from '@gitroom/react/toaster/toaster';
import clsx from 'clsx';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useRouter } from 'next/navigation';
import { AddEditModal } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useSettingsTabChrome } from '@gitroom/frontend/components/settings/settings-tab-chrome.context';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { Skeleton } from '@gitroom/react/ui/skeleton';

const SaveSetModal: FC<{
  postData: any;
  initialValue?: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}> = ({ postData, onSave, onCancel, initialValue }) => {
  const [name, setName] = useState(initialValue);
  const t = useT();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSave(name.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <Input
          label="Set Name"
          translationKey="label_set_name"
          name="setName"
          value={name}
          disableForm={true}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter a name for this set"
          autoFocus
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" secondary onClick={onCancel}>
          {t('cancel', 'Cancel')}
        </Button>
        <Button type="submit" disabled={!name.trim()}>
          {t('save', 'Save')}
        </Button>
      </div>
    </form>
  );
};

export const Sets: FC = () => {
  const fetch = useFetch();
  const modal = useModals();
  const toaster = useToaster();
  const t = useT();
  const router = useRouter();

  const {
    isLoading,
    error: integrationsError,
    data: integrations,
    mutate: mutateIntegrations,
  } = useIntegrationList();

  /**
   * `useIntegrationList` carries `fallbackData: []`, so a cold page looks
   * channel-less and a gate reading the flag is simply skipped while the list
   * is in flight. Resolve at click time instead — same as `new.post.tsx`.
   *
   * Three answers, not two. `null` means "could not tell". A rejected
   * revalidation must neither throw out of the click handler — the bound
   * `mutate()` defaults to `throwOnError`, and an unhandled rejection leaves
   * the button doing nothing at all — nor be reported as an empty account,
   * which would send someone who has channels off to go connect one.
   */
  const resolveIntegrations = useCallback(async (): Promise<any[] | null> => {
    if (!isLoading && !integrationsError) return integrations;
    try {
      return (await mutateIntegrations()) ?? [];
    } catch {
      return null;
    }
  }, [isLoading, integrationsError, integrations, mutateIntegrations]);

  const openAddChannel = useCallback(() => {
    router.push('/channels?add=1');
  }, [router]);

  const list = useCallback(async () => {
    return (await fetch('/sets')).json();
  }, []);

  const { data, isLoading: setsLoading, mutate } = useSWR('sets', list, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });

  const { setChromePatch } = useSettingsTabChrome();

  useEffect(() => {
    // Not while loading: `data?.length ?? 0` would publish "Social Sets (0)"
    // into the pane header and then correct itself.
    if (setsLoading) return;
    setChromePatch({
      title: t('social_sets_count', 'Social Sets ({{count}})', {
        count: data?.length ?? 0,
      }),
    });
    return () => setChromePatch(null);
  }, [data?.length, setsLoading, setChromePatch, t]);

  const addSet = useCallback(
    (params?: { id?: string; name?: string; content?: string }) => async () => {
      // A set is a saved selection of channels — with none connected the
      // composer has nothing to show. Say why, then send them to connect one.
      //
      // Creating only. Editing an existing set must not be blocked on the
      // channel list, the same short-circuit autopost already makes for its
      // edit path — otherwise a failed list load sends you away from the set
      // you were trying to open.
      const list = await resolveIntegrations();
      if (!params?.id) {
        if (list === null) {
          toaster.show(
            t('something_went_wrong', 'Something went wrong'),
            'warning'
          );
          return;
        }
        if (!list.length) {
          toaster.show(
            t(
              'set_needs_channel',
              'Connect a channel first — a social set is a saved selection of channels.'
            ),
            'warning'
          );
          openAddChannel();
          return;
        }
      }
      const channels = list ?? integrations;
      modal.openModal({
        id: 'add-edit-modal',
        closeOnClickOutside: false,
        removeLayout: true,
        closeOnEscape: false,
        withCloseButton: false,
        askClose: true,
        fullScreen: true,
        classNames: {
          modal: 'w-[100%] max-w-[1400px] text-textColor',
        },
        children: (
          <AddEditModal
            allIntegrations={channels.map((p: any) => ({
              ...p,
            }))}
            {...(params?.id ? { set: JSON.parse(params.content) } : {})}
            addEditSets={(data) => {
              modal.openModal({
                title: 'Save as Set',
                children: (
                  <SaveSetModal
                    initialValue={params?.name || ''}
                    postData={data}
                    onSave={async (name: string) => {
                      try {
                        await fetch('/sets', {
                          method: 'POST',
                          body: JSON.stringify({
                            ...(params?.id ? { id: params.id } : {}),
                            name,
                            content: JSON.stringify(data),
                          }),
                        });
                        modal.closeAll();
                        mutate();
                        toaster.show('Set saved successfully', 'success');
                      } catch (error) {
                        toaster.show('Failed to save set', 'warning');
                      }
                    }}
                    onCancel={() => modal.closeAll()}
                  />
                ),
              });
            }}
            reopenModal={() => {}}
            mutate={() => {}}
            integrations={channels}
            date={newDayjs()}
          />
        ),
        title: ``,
      });
    },
    [
      resolveIntegrations,
      integrations,
      openAddChannel,
      toaster,
      t,
      modal,
      fetch,
      mutate,
    ]
  );

  const deleteSet = useCallback(
    (data: any) => async () => {
      if (
        await deleteDialog(
          t(
            'are_you_sure_you_want_to_delete',
            `Are you sure you want to delete ${data.name}?`,
            { name: data.name }
          )
        )
      ) {
        // Same shape as the other delete paths: customFetch resolves on
        // 4xx/5xx and rejects when the backend is down, so an unchecked call
        // claimed success for a set that never went away.
        let ok = false;
        try {
          ok = (await fetch(`/sets/${data.id}`, { method: 'DELETE' })).ok;
        } catch (e) {
          ok = false;
        }

        if (!ok) {
          toaster.show(
            t('set_delete_failed', 'Could not delete this set'),
            'warning'
          );
          return;
        }

        mutate();
        toaster.show(
          t('set_deleted_successfully', 'Set deleted successfully'),
          'success'
        );
      }
    },
    [fetch, mutate, toaster, t]
  );

  return (
    <div className="flex flex-col">
      {/* An empty list and a list in flight look the same from here, so the
          rows wait for the fetch — otherwise the pane reads as empty and then
          fills. The Add button stays live throughout; its channel check
          resolves the list at click time. */}
      {setsLoading && (
        <div className="mt-[18px] overflow-hidden rounded-pqMd bg-pqPop shadow-[inset_0_0_0_1px_var(--border)]">
          <div className="flex items-center bg-pqTableHeader p-[10px_15px] text-[11px] font-[700] uppercase tracking-[0.06em] text-pqText">
            <div className="flex-1">{t('name', 'Name')}</div>
            <div className="w-[150px]">{t('actions', 'Actions')}</div>
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center border-b border-pqLine p-[13px_15px] last:border-b-0"
            >
              <div className="flex-1">
                <Skeleton className="h-[13px] w-[42%]" />
              </div>
              <div className="flex w-[150px] gap-[8px]">
                <Skeleton className="h-[28px] w-[56px] rounded-pqSm" />
                <Skeleton className="h-[28px] w-[56px] rounded-pqSm" />
              </div>
            </div>
          ))}
        </div>
      )}
      {!setsLoading && !!data?.length && (
        <div className="mt-[18px] overflow-hidden rounded-pqMd bg-pqPop shadow-[inset_0_0_0_1px_var(--border)]">
          <div className="flex items-center bg-pqTableHeader p-[10px_15px] text-[11px] font-[700] uppercase tracking-[0.06em] text-pqText">
            <div className="flex-1">{t('name', 'Name')}</div>
            <div className="w-[150px]">{t('actions', 'Actions')}</div>
          </div>
          {data?.map((p: any) => (
            <div
              key={p.id}
              className="flex items-center border-t border-pqLine p-[11px_15px]"
            >
              <div className="min-w-0 flex-1 truncate text-[13.5px] font-[500] text-pqText">
                {p.name}
              </div>
              <div className="flex w-[150px] gap-[8px]">
                <button
                  type="button"
                  onClick={addSet(p)}
                  className="flex h-[30px] items-center rounded-[8px] bg-pqSettings px-[14px] text-[12.5px] font-[600] text-pqText transition-shadow hover:shadow-[inset_0_0_0_999px_var(--hover)]"
                >
                  {t('edit', 'Edit')}
                </button>
                <button
                  type="button"
                  onClick={deleteSet(p)}
                  className="flex h-[30px] items-center rounded-[8px] bg-pqSettings px-[14px] text-[12.5px] font-[600] text-pqText transition-colors hover:text-pqWarn"
                >
                  {t('delete', 'Delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={addSet()}
        className={clsx(
          'flex h-[34px] items-center gap-[6px] self-start rounded-pqSm bg-pqBrand ps-[11px] pe-[13px] text-[13px] font-[600] text-pqOnBrand transition-colors hover:bg-pqBrandHover',
          (data?.length || 0) > 0 ? 'mt-[13px]' : 'mt-[18px]'
        )}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M12 5.5v13M5.5 12h13" />
        </svg>
        {t('add_a_social_set', 'Add a social set')}
      </button>
    </div>
  );
};
