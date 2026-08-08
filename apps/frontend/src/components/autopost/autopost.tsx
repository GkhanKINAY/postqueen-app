'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { Button } from '@gitroom/react/form/button';
import { ModalFormActions } from '@gitroom/frontend/components/layout/new-modal';
import { Input } from '@gitroom/react/form/input';
import { FormProvider, useForm } from 'react-hook-form';
import { array, boolean, object, string } from 'yup';
import { yupResolver } from '@hookform/resolvers/yup';
import { Select } from '@gitroom/react/form/select';
import { FormChoice } from '@gitroom/react/form/form.choice';
import { ChannelPickList } from '@gitroom/frontend/components/launches/channel.pick.list';
import {
  ChannelHealthBadge,
  computeChannelHealth,
} from '@gitroom/frontend/components/launches/channel.health.badge';
import { sortIntegrationsByProviderImportance } from '@gitroom/frontend/components/launches/helpers/sort.integrations';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { useToaster } from '@gitroom/react/toaster/toaster';
import clsx from 'clsx';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { CopilotTextarea } from '@copilotkit/react-textarea';
import { Slider } from '@gitroom/react/form/slider';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useRouter } from 'next/navigation';
import { SettingsPaneEditor } from '@gitroom/frontend/components/settings/settings-pane-editor';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { Skeleton } from '@gitroom/react/ui/skeleton';
export const Autopost: FC = () => {
  const fetch = useFetch();
  const t = useT();
  const toaster = useToaster();
  const router = useRouter();
  const [editing, setEditing] = useState<any | null | undefined>(undefined);
  // Which row is mid-test. One at a time is enough — the button is the only
  // thing that starts one, and it disables itself while it runs.
  const [testingId, setTestingId] = useState<string | null>(null);
  const list = useCallback(async () => {
    return (await fetch('/autopost')).json();
  }, []);
  const { data, isLoading: autopostLoading, mutate } = useSWR('autopost', list);
  // Same shared `/integrations/list` cache the editor already reads — no extra request.
  const {
    isLoading: integrationsLoading,
    error: integrationsError,
    data: integrations,
    mutate: mutateIntegrations,
  } = useIntegrationList();
  // The row can only say "this rule is not actually running" by reproducing the
  // server's channel filter — the toggle and Test connection both look healthy
  // regardless, because Test connection only checks the feed.
  const channelHealth = useCallback(
    (row: any) => {
      let savedIds: string[] = [];
      try {
        savedIds = (JSON.parse(row.integrations || '[]') || []).map(
          (i: any) => i.id
        );
      } catch {
        savedIds = [];
      }
      return computeChannelHealth(savedIds, integrations || []);
    },
    [integrations]
  );
  const closeEditor = useCallback(() => setEditing(undefined), []);
  // An autopost turns feed items into posts on channels, so with none
  // connected there is nothing to target. Only the add path redirects —
  // editing an existing rule stays available.
  /**
   * `fallbackData: []` means a cold page looks channel-less, so a gate reading
   * the flag is skipped outright while the list is in flight. Resolve at click
   * time instead — same as `new.post.tsx`.
   *
   * Three answers, not two. `null` means "could not tell". A rejected
   * revalidation must neither throw out of the click handler — the bound
   * `mutate()` defaults to `throwOnError`, and an unhandled rejection leaves
   * the button doing nothing at all — nor be reported as an empty account,
   * which would send someone who has channels off to go connect one.
   */
  const resolveIntegrations = useCallback(async (): Promise<any[] | null> => {
    if (!integrationsLoading && !integrationsError) return integrations;
    try {
      return (await mutateIntegrations()) ?? [];
    } catch {
      return null;
    }
  }, [
    integrationsLoading,
    integrationsError,
    integrations,
    mutateIntegrations,
  ]);

  const addWebhook = useCallback(
    (row?: any) => async () => {
      // Creating only. Editing an existing rule must not be blocked on the
      // channel list — a failed load would send you away from the rule you
      // were trying to open.
      if (!row) {
        const list = await resolveIntegrations();
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
              'autopost_needs_channel',
              'Connect a channel first — an autopost needs somewhere to publish.'
            ),
            'warning'
          );
          router.push('/channels?add=1');
          return;
        }
      }
      setEditing(row ?? null);
    },
    [resolveIntegrations, router, toaster, t]
  );
  const deleteHook = useCallback(
    (data: any) => async () => {
      const label = data.title || data.name || '';
      if (
        await deleteDialog(
          t(
            'are_you_sure_you_want_to_delete',
            `Are you sure you want to delete ${label}?`,
            { name: label }
          )
        )
      ) {
        const response = await fetch(`/autopost/${data.id}`, {
          method: 'DELETE',
        });
        // customFetch resolves on 4xx/5xx, so an unchecked response showed a
        // green "deleted" and then mutate() quietly put the row back.
        if (!response.ok) {
          toaster.show(
            t('autopost_delete_failed', 'Could not delete this autopost'),
            'warning'
          );
          return;
        }
        mutate();
        toaster.show(
          t('autopost_deleted_successfully', 'Autopost deleted successfully'),
          'success'
        );
      }
    },
    [fetch, mutate, toaster, t]
  );
  // Re-checks the saved feed without touching the rule — same endpoint the
  // editor's Send Test uses, so it creates nothing and changes nothing.
  const testConnection = useCallback(
    (row: any) => async () => {
      setTestingId(row.id);
      try {
        const response = await fetch(
          `/autopost/send?url=${encodeURIComponent(row.url)}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
        const body = await response.json().catch(() => ({} as any));
        if (!body?.success) {
          const reason = Array.isArray(body?.message)
            ? body.message[0]
            : body?.message;
          toaster.show(
            reason ||
              t('could_not_use_rss_feed', 'Could not use this RSS feed'),
            'warning'
          );
          return;
        }
        toaster.show(t('rss_valid', 'RSS valid!'), 'success');
      } finally {
        setTestingId(null);
      }
    },
    [fetch, toaster, t]
  );
  const changeActive = useCallback(
    (data: any) => async (ac: 'on' | 'off') => {
      const response = await fetch(`/autopost/${data.id}/active`, {
        body: JSON.stringify({
          active: ac === 'on',
        }),
        method: 'POST',
      });
      // The Slider is fully controlled, so on failure it just snaps back with
      // no explanation unless we say something.
      if (!response.ok) {
        toaster.show(
          t('autopost_toggle_failed', 'Could not change this autopost'),
          'warning'
        );
      }
      mutate();
    },
    [fetch, mutate, toaster, t]
  );
  if (editing !== undefined) {
    return (
      <SettingsPaneEditor
        title={
          editing
            ? t('edit_autopost', 'Edit Autopost')
            : t('add_autopost_title', 'Add Autopost')
        }
        description={t(
          'autopost_editor_description',
          'Watch an RSS or Atom feed and turn new items into scheduled posts.'
        )}
        onBack={closeEditor}
      >
        <AddOrEditWebhook
          data={editing || undefined}
          reload={() => {
            mutate();
            closeEditor();
          }}
          onCancel={closeEditor}
        />
      </SettingsPaneEditor>
    );
  }

  return (
    <div className="flex flex-col">
      {/* An empty list and a list in flight look the same from here, so the
          rows wait for the fetch — otherwise the pane reads as empty and then
          fills. The Add button stays live throughout; its channel check
          resolves the list at click time. */}
      {autopostLoading && (
        <div className="mt-[18px] overflow-hidden rounded-pqMd bg-pqPop shadow-[inset_0_0_0_1px_var(--border)]">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-[11px] border-b border-pqLine p-[13px_15px] last:border-b-0"
            >
              <Skeleton className="size-[30px] shrink-0 rounded-[9px]" />
              <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
                <Skeleton className="h-[13px] w-[34%]" />
                <Skeleton className="h-[11px] w-[56%]" />
              </div>
              <Skeleton className="h-[20px] w-[38px] shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      )}
      {!autopostLoading && !!data?.length && (
        <div className="mt-[18px] overflow-hidden rounded-pqMd bg-pqPop shadow-[inset_0_0_0_1px_var(--border)]">
          {data?.map((p: any) => (
            <div
              key={p.id}
              className="flex items-center gap-[11px] border-b border-pqLine p-[13px_15px] last:border-b-0"
            >
              <div className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] bg-pqSettings text-pqMuted">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 19.5h.01M5 12a7.5 7.5 0 0 1 7.5 7.5M5 5a14.5 14.5 0 0 1 14.5 14.5" />
                </svg>
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-[7px]">
                  <span className="truncate text-[13.5px] font-[600] text-pqText">
                    {p.title}
                  </span>
                  <ChannelHealthBadge health={channelHealth(p)} />
                </div>
                <div className="mt-[2px] truncate font-mono text-[11.5px] text-pqMuted">
                  {p.url}
                </div>
              </div>
              <Slider
                value={p.active ? 'on' : 'off'}
                onChange={changeActive(p)}
                fill={true}
              />
              {/* Labelled pill, not a bare icon — same shape as the Signatures
                  row action. A refresh glyph on its own reads as "reload". */}
              <button
                type="button"
                onClick={testConnection(p)}
                disabled={testingId === p.id}
                className={clsx(
                  'flex h-[30px] shrink-0 items-center gap-[6px] rounded-pqSm bg-pqSettings px-[11px] text-[12.5px] font-[500] text-pqText transition-colors hover:bg-pqHover',
                  testingId === p.id && 'pointer-events-none opacity-50'
                )}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M21 12a9 9 0 1 1-6.2-8.6M21 3v6h-6" />
                </svg>
                {testingId === p.id
                  ? t('autopost_testing', 'Testing…')
                  : t('autopost_test_connection', 'Test connection')}
              </button>
              <button
                type="button"
                onClick={addWebhook(p)}
                aria-label={t('edit', 'Edit')}
                title={t('edit', 'Edit')}
                className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[7px] text-pqSoft transition-colors hover:bg-pqHover hover:text-pqText"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={deleteHook(p)}
                aria-label={t('delete', 'Delete')}
                title={t('delete', 'Delete')}
                className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[7px] text-pqSoft transition-colors hover:bg-pqHover hover:text-pqWarn"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={addWebhook()}
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
        {t('add_an_autopost', 'Add an autopost')}
      </button>
    </div>
  );
};
const details = object().shape({
  title: string().required(),
  // Required only when autogeneration is off — otherwise the post body would be
  // nothing but the feed link with two blank lines in front of it.
  content: string().when('generateContent', {
    is: false,
    then: (schema) => schema.required(),
    otherwise: (schema) => schema,
  }),
  onSlot: boolean().required(),
  syncLast: boolean().required(),
  url: string().url().required(),
  active: boolean().required(),
  addPicture: boolean().required(),
  generateContent: boolean().required(),
  autoPublish: boolean().required(),
  integrations: array().of(
    object().shape({
      id: string().required(),
    })
  ),
});
const getOptions = (t: (key: string, fallback: string) => string) => [
  {
    // "Channels", not "Integrations": that is what the rest of the app calls
    // these, and Settings already has a separate Integrations tab meaning
    // something else. The stored values stay 'all' / 'specific'.
    label: t('all_channels', 'All channels'),
    value: 'all',
  },
  {
    label: t('specific_channels', 'Specific channels'),
    value: 'specific',
  },
];
const getOptionsChoose = (t: (key: string, fallback: string) => string) => [
  {
    label: t('yes', 'Yes'),
    value: true,
  },
  {
    label: t('no', 'No'),
    value: false,
  },
];
// Draft is the default and the historical behaviour — publishing on someone's
// behalf has to be asked for.
const getDeliveryOptions = (t: (key: string, fallback: string) => string) => [
  {
    label: t('autopost_delivery_draft', 'Create a draft for review'),
    value: false,
  },
  {
    label: t('autopost_delivery_publish', 'Publish automatically'),
    value: true,
  },
];
const getPostImmediately = (t: (key: string, fallback: string) => string) => [
  {
    label: t('post_on_next_available_slot', 'Post on the next available slot'),
    value: true,
  },
  {
    label: t('post_immediately', 'Post Immediately'),
    value: false,
  },
];
export const AddOrEditWebhook: FC<{
  data?: any;
  reload: () => void;
  onCancel?: () => void;
}> = (props) => {
  const { data, reload, onCancel } = props;
  const fetch = useFetch();
  const t = useT();
  const { aiEnabled } = useVariables();
  const options = getOptions(t);
  const optionsChoose = getOptionsChoose(t);
  const postImmediately = getPostImmediately(t);
  const deliveryOptions = getDeliveryOptions(t);
  const [step, setStep] = useState(0);
  const [allIntegrations, setAllIntegrations] = useState(
    (JSON.parse(data?.integrations || '[]')?.length || 0) > 0
      ? options[1]
      : options[0]
  );
  const toast = useToaster();
  const isEdit = !!data?.id;
  // Create: valid stays empty until Send Test. Edit: trust the saved URL until
  // the user changes it.
  const [valid, setValid] = useState('');
  const [lastUrl, setLastUrl] = useState(data?.lastUrl || '');
  const form = useForm({
    resolver: yupResolver(details),
    // onChange, not the RHF default onSubmit: submit is behind a disabled
    // button here, so onSubmit would never populate `errors` and the fields
    // could never explain themselves.
    mode: 'onChange',
    values: {
      title: data?.title || '',
      content: data?.content || '',
      onSlot: data?.onSlot || false,
      syncLast: data?.syncLast || false,
      url: data?.url || '',
      // eslint-disable-next-line no-prototype-builtins
      active: data?.hasOwnProperty?.('active') ? data?.active : true,
      addPicture: data?.addPicture || false,
      // eslint-disable-next-line no-prototype-builtins
      generateContent: data?.hasOwnProperty?.('generateContent')
        ? data?.generateContent
        : true,
      autoPublish: data?.autoPublish || false,
      integrations: JSON.parse(data?.integrations || '[]') || [],
    },
  });
  const generateContent = form.watch('generateContent');
  const content = form.watch('content');
  const url = form.watch('url');
  // Declared up here because callBack reads it to decide whether to keep the
  // de-dupe cursor.
  const urlUnchanged = isEdit && !!url && url === (data?.url || '');
  const syncLast = form.watch('syncLast');
  const integrations = form.watch('integrations');
  const title = form.watch('title');
  const changeIntegration = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const findValue = options.find(
        (option) => option.value === e.target.value
      )!;
      setAllIntegrations(findValue);
      if (findValue.value === 'all') {
        form.setValue('integrations', []);
      }
    },
    []
  );
  // Shared list cache — array shape. Never reuse key `'integrations'` with a
  // full `{ integrations }` response (poisons AgentList / other consumers).
  const {
    data: dataList,
    isLoading,
    error: listError,
  } = useIntegrationList();
  // Anything derived from the channel list has to know whether the list is
  // real. useIntegrationList falls back to `[]`, and that placeholder is
  // indistinguishable from "this org has no channels" — which is how a failed
  // request pruned every selection and left Save disabled on an existing rule.
  const listLoaded = !isLoading && !listError && !!(dataList || []).length;
  // A half-connected or downgraded channel cannot publish, and the recovery
  // sweepers skip it — so it must not be pickable here. Filtered at the call
  // site, not inside ChannelPickList: the calendar filter shows these today and
  // that behaviour should not change.
  const pickableList = useMemo(
    () =>
      sortIntegrationsByProviderImportance(dataList || []).filter(
        (f: any) => !f.disabled && !f.refreshNeeded && !f.inBetweenSteps
      ),
    [dataList]
  );
  // The form field keeps whole integration objects — that is the shape the API
  // has always been sent. The picker speaks ids, so map across the boundary
  // rather than changing the payload.
  //
  // Reconciled against everything that still EXISTS, not against what is
  // currently pickable. A channel that merely needs reconnecting is not
  // selectable, but it is still a legitimate part of the rule — filtering on
  // pickableList here would drop it from the count and silently delete it on
  // the next save. Only channels that are actually gone get pruned.
  const liveIds = useMemo(
    () => new Set(((dataList || []) as any[]).map((i) => i.id)),
    [dataList]
  );
  const selectedChannelIds = useMemo(
    () =>
      ((integrations || []) as any[])
        .map((i) => i.id)
        .filter((id) => !listLoaded || liveIds.has(id)),
    [integrations, liveIds, listLoaded]
  );
  // The rule's channels as they were when the editor opened. Rows for these
  // stay in the list even after they are un-ticked: without that, un-ticking a
  // reconnect-needed channel removed its only row, and re-ticking was
  // impossible — the same silent removal visibleList exists to prevent, just
  // moved from save time to click time.
  const openedWithIds = useMemo(
    () =>
      new Set(
        ((JSON.parse(data?.integrations || '[]') || []) as any[]).map(
          (i) => i.id
        )
      ),
    [data?.integrations]
  );
  // What the picker draws: everything selectable, plus anything already picked
  // that is not — otherwise a channel needing reconnect has no row, so it can
  // neither be seen nor un-ticked, and the counter disagrees with the list.
  // Those rows carry the warn dot ChannelPickList already renders.
  const visibleList = useMemo(() => {
    const pickableIds = new Set(pickableList.map((i: any) => i.id));
    const extras = ((dataList || []) as any[]).filter(
      (i) =>
        !pickableIds.has(i.id) &&
        (selectedChannelIds.includes(i.id) || openedWithIds.has(i.id))
    );
    return [...pickableList, ...extras];
  }, [pickableList, dataList, selectedChannelIds, openedWithIds]);
  const toggleChannel = useCallback(
    (id: string) => {
      const current = (form.getValues('integrations') || []) as any[];
      if (current.some((i) => i.id === id)) {
        form.setValue(
          'integrations',
          current.filter((i) => i.id !== id)
        );
        return;
      }
      // dataList, not pickableList: a row that is visible must be clickable.
      // Looking only at what is pickable swallowed the click for a channel the
      // rule already had, with no feedback.
      const found = ((dataList || []) as any[]).find((i) => i.id === id);
      if (found) {
        form.setValue('integrations', [...current, found]);
      }
    },
    [form, dataList]
  );
  const selectAllChannels = useCallback(
    (visible: any[]) => {
      // Adds, never replaces. With a search active, replacing dropped every
      // pick that happened to be off screen — under a button labelled
      // "Select all".
      const current = (form.getValues('integrations') || []) as any[];
      const have = new Set(current.map((i) => i.id));
      form.setValue('integrations', [
        ...current,
        ...visible.filter((i) => !have.has(i.id)),
      ]);
    },
    [form]
  );
  const clearChannels = useCallback(() => {
    form.setValue('integrations', []);
  }, [form]);
  const callBack = useCallback(
    async (values: any) => {
      const response = await fetch(
        data?.id ? `/autopost/${data?.id}` : '/autopost',
        {
          method: data?.id ? 'PUT' : 'POST',
          body: JSON.stringify({
            ...(data?.id
              ? {
                  id: data.id,
                }
              : {}),
            ...values,
            // Drop channels that no longer exist rather than writing the stale
            // blob back for another round.
            integrations: ((values.integrations || []) as any[]).filter(
              (i) => !i?.id || selectedChannelIds.includes(i.id)
            ),
            // lastUrl is the de-dupe cursor. Clearing it means "post the item
            // that is newest right now", which is what syncLast asks for on a
            // NEW rule — but doing it on every edit re-posts an item that
            // already went out, so an untouched URL keeps its cursor.
            ...(!syncLast || urlUnchanged
              ? {
                  lastUrl,
                }
              : {
                  lastUrl: '',
                }),
          }),
        }
      );
      // customFetch resolves on 4xx/5xx too, so an unchecked response meant a
      // green "added successfully" for a rule that was never written.
      if (!response.ok) {
        const body = await response.json().catch(() => ({} as any));
        const reason = Array.isArray(body?.message)
          ? body.message[0]
          : body?.message;
        toast.show(
          reason || t('autopost_save_failed', 'Could not save this autopost'),
          'warning'
        );
        return;
      }
      toast.show(
        data?.id
          ? t('autopost_updated_successfully', 'Autopost updated successfully')
          : t('autopost_added_successfully', 'Autopost added successfully'),
        'success'
      );
      reload();
    },
    [data, lastUrl, syncLast, urlUnchanged, selectedChannelIds, fetch, reload, toast, t]
  );
  const sendTest = useCallback(async () => {
    const feedUrl = form.getValues('url');
    try {
      const response = await fetch(
        `/autopost/send?url=${encodeURIComponent(feedUrl)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      // customFetch does not throw on 4xx, so a rejected URL arrives here as a
      // normal body: { message: [...], statusCode: 400 }. Say what it said —
      // "Could not use this RSS feed" blames the feed for a typo'd URL, and
      // hides that the validator wants https.
      const body = await response.json().catch(() => ({} as any));
      const { success, url: newUrl } = body;
      if (!success) {
        setValid('');
        const reason = Array.isArray(body?.message)
          ? body.message[0]
          : body?.message;
        toast.show(
          reason || t('could_not_use_rss_feed', 'Could not use this RSS feed'),
          'warning'
        );
        return;
      }
      toast.show(t('rss_valid', 'RSS valid!'), 'success');
      setValid(feedUrl);
      // A feed whose newest item carries no link answers success with an
      // undefined url; the column is NOT NULL, so undefined used to 500 on save.
      setLastUrl(newUrl || '');
    } catch (e: any) {
      /** empty **/
    }
  }, []);

  // Gated on the test itself, never on lastUrl: a valid feed with no items (or
  // whose newest item has no link) still answers success, with an empty link.
  // Gating on it would leave Next locked forever behind an "RSS valid!" toast,
  // with syncLast — the only other way out — stranded on the next step.
  const feedReady = !!url && (urlUnchanged || valid === url);
  // selectedChannelIds, not the raw field: a rule whose every channel was
  // deleted would otherwise still count as "has channels" and save into a
  // permanent no-op.
  const channelsOk =
    allIntegrations.value !== 'specific' || !!selectedChannelIds.length;
  const canSave = feedReady && form.formState.isValid && channelsOk;

  const steps = [
    {
      key: 'feed',
      label: t('autopost_step_feed', 'Feed'),
    },
    {
      key: 'timing',
      label: t('autopost_step_timing', 'Timing'),
    },
    {
      key: 'content',
      label: t('autopost_step_content', 'Content'),
    },
    {
      key: 'channels',
      label: t('autopost_step_channels', 'Channels'),
    },
  ] as const;

  const goNext = useCallback(() => {
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }, [steps.length]);
  const goBack = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(callBack)}>
        <div className="relative flex flex-1 flex-col gap-[16px] pt-0">
          {/* Step chrome — numbered pills (owner stepped LOOK). */}
          <div
            data-autopost-steps="1"
            className="flex flex-wrap items-center gap-[8px]"
          >
            {steps.map((s, i) => (
              <div key={s.key} className="flex items-center gap-[8px]">
                {i > 0 && (
                  <span
                    aria-hidden
                    className="h-px w-[10px] bg-pqLine mobile:hidden"
                  />
                )}
                {/* Every step is reachable. The feed still has to pass Send
                    Test before Save lights up — but that reason belongs next to
                    Save, not behind a pill that does nothing when pressed. */}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => setStep(i)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setStep(i);
                    }
                  }}
                  className={clsx(
                    'flex h-[26px] cursor-pointer items-center gap-[7px] rounded-full pe-[10px] ps-[4px] text-[12px] font-[600]',
                    i === step
                      ? 'bg-pqBrand text-pqOnBrand'
                      : i < step
                        ? 'bg-pqBrandSoft text-pqText'
                        : 'bg-pqSettings text-pqMuted'
                  )}
                >
                  <span
                    className={clsx(
                      'grid size-[18px] place-items-center rounded-full text-[11px] font-[700]',
                      i === step
                        ? 'bg-pqOnBrand text-pqBrand'
                        : i < step
                          ? 'bg-pqBrand text-pqOnBrand'
                          : 'bg-pqInner text-pqMuted'
                    )}
                  >
                    {i + 1}
                  </span>
                  {s.label}
                </span>
              </div>
            ))}
          </div>

          {step === 0 && (
            <div className="flex flex-col gap-[12px]">
              <Input
                label="Title"
                translationKey="label_title"
                {...form.register('title')}
              />
              <Input
                label="URL"
                translationKey="label_url"
                {...form.register('url')}
              />
              <p className="text-[13px] leading-[1.45] text-pqMuted">
                {urlUnchanged
                  ? t(
                      'autopost_feed_tip_edit',
                      'This feed is already saved. Change the URL and Send Test again, or continue with Next.'
                    )
                  : t(
                      'autopost_feed_tip',
                      'Send Test checks the feed once. Save unlocks after a successful check.'
                    )}
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-[12px]">
              <FormChoice
                name="syncLast"
                label="Should we sync the current last post?"
                translationKey="label_should_sync_last_post"
                options={optionsChoose}
              />
              <FormChoice
                name="onSlot"
                label="When should we post it?"
                translationKey="label_when_post"
                options={postImmediately}
              />
              <FormChoice
                name="autoPublish"
                label="What should we do with new items?"
                translationKey="autopost_delivery_label"
                options={deliveryOptions}
              />
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-[12px]">
              <FormChoice
                name="generateContent"
                label="Autogenerate content"
                translationKey="label_autogenerate_content"
                options={optionsChoose}
              />
              {!generateContent && (
                <div className="flex flex-col gap-[5px]">
                  <div className="text-[13px] font-[500] text-pqMuted">
                    {t('post_content', 'Post content')}
                  </div>
                  <div className="overflow-hidden rounded-[10px] bg-pqTableHeader shadow-[inset_0_0_0_1px_var(--border)] focus-within:shadow-[inset_0_0_0_1px_var(--brand)]">
                    {aiEnabled ? (
                      <CopilotTextarea
                        disableBranding={true}
                        className={clsx(
                          '!min-h-28 !max-h-56 !bg-transparent p-[10px_12px] text-[14px] leading-[1.55] text-pqText outline-none overflow-x-hidden scrollbar scrollbar-thumb-pqBorder scrollbar-track-transparent placeholder:text-pqSoft'
                        )}
                        value={content}
                        onChange={(e) => {
                          form.setValue('content', e.target.value);
                        }}
                        placeholder={t(
                          'write_your_post_placeholder',
                          'Write your post...'
                        )}
                        autosuggestionsConfig={{
                          textareaPurpose: `Assist me in writing social media post`,
                          chatApiConfigs: {},
                        }}
                      />
                    ) : (
                      <textarea
                        className={clsx(
                          '!min-h-28 !max-h-56 !bg-transparent p-[10px_12px] text-[14px] leading-[1.55] text-pqText outline-none overflow-x-hidden scrollbar scrollbar-thumb-pqBorder scrollbar-track-transparent placeholder:text-pqSoft w-full resize-none border-0'
                        )}
                        value={content}
                        onChange={(e) => {
                          form.setValue('content', e.target.value);
                        }}
                        placeholder={t(
                          'write_your_post_placeholder',
                          'Write your post...'
                        )}
                      />
                    )}
                  </div>
                </div>
              )}
              <FormChoice
                name="addPicture"
                label="Generate Picture?"
                translationKey="label_generate_picture"
                options={optionsChoose}
              />
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-[12px]">
              <Select
                value={allIntegrations.value}
                name="integrations"
                label="Channels"
                translationKey="channels"
                disableForm={true}
                hideErrors={true}
                onChange={changeIntegration}
              >
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <p className="text-[13px] leading-[1.45] text-pqMuted">
                {allIntegrations.value === 'specific'
                  ? t(
                      'autopost_channels_tip_specific',
                      'New feed items are posted only to the channels you tick below.'
                    )
                  : t(
                      'autopost_channels_tip_all',
                      'New feed items are posted to every connected channel.'
                    )}
              </p>
              {allIntegrations.value === 'specific' &&
                dataList &&
                !isLoading && (
                  <div className="overflow-hidden rounded-pqMd border border-pqBorder bg-pqInner">
                    <ChannelPickList
                      integrations={visibleList}
                      selectedIds={selectedChannelIds}
                      onToggle={toggleChannel}
                      onSelectAll={selectAllChannels}
                      onClear={clearChannels}
                    />
                  </div>
                )}
            </div>
          )}

          {/* Save is the one control still gated — so say what it is waiting
              for. Title/URL errors live on the Feed step, which the reader
              cannot see from here. */}
          {step === steps.length - 1 && !canSave && (
            <p className="text-[13px] leading-[1.45] text-pqMuted">
              {!form.formState.isValid
                ? t(
                    'autopost_save_needs_feed_fields',
                    'Fill in Title and URL on the Feed step.'
                  )
                : !feedReady
                  ? t(
                      'autopost_save_needs_test',
                      'Run Send Test on the Feed step before saving.'
                    )
                  : t('pick_at_least_one_channel', 'Pick at least one channel.')}
            </p>
          )}

          <ModalFormActions onCancel={() => onCancel?.()}>
            {step > 0 && (
              <Button
                type="button"
                secondary={true}
                className="h-[40px] shrink-0 rounded-[10px] px-[16px] text-[13.5px] font-[600]"
                onClick={goBack}
              >
                {t('back', 'Back')}
              </Button>
            )}
            {step === 0 && (
              <Button
                type="button"
                secondary={true}
                className="h-[40px] shrink-0 rounded-[10px] px-[16px] text-[13.5px] font-[600]"
                onClick={sendTest}
                disabled={!url || !title || !!form.formState.errors.url}
              >
                {t('send_test', 'Send Test')}
              </Button>
            )}
            {step < steps.length - 1 ? (
              <Button
                type="button"
                className="h-[40px] shrink-0 rounded-[10px] px-[18px] text-[13.5px] font-[600]"
                onClick={goNext}
              >
                {t('next', 'Next')}
              </Button>
            ) : (
              <Button
                type="submit"
                className="h-[40px] shrink-0 rounded-[10px] px-[18px] text-[13.5px] font-[600]"
                disabled={!canSave || form.formState.isSubmitting}
              >
                {t('save', 'Save')}
              </Button>
            )}
          </ModalFormActions>
        </div>
      </form>
    </FormProvider>
  );
};
