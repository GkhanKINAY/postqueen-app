'use client';

import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { Button } from '@gitroom/react/form/button';
import { ModalFormActions } from '@gitroom/frontend/components/layout/new-modal';
import { Input } from '@gitroom/react/form/input';
import { FormProvider, useForm } from 'react-hook-form';
import { array, object, string } from 'yup';
import { yupResolver } from '@hookform/resolvers/yup';
import { Select } from '@gitroom/react/form/select';
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
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useRouter } from 'next/navigation';
import { SettingsPaneEditor } from '@gitroom/frontend/components/settings/settings-pane-editor';
import { useSettingsTabChrome } from '@gitroom/frontend/components/settings/settings-tab-chrome.context';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { Skeleton } from '@gitroom/react/ui/skeleton';

// Must match what a real delivery looks like, because people wire their
// receiver against whatever Send Test shows them. Delivery is one request PER
// CHANNEL (post.activity sendWebhooks runs once per post row, and there is one
// post row per channel), so the array carries exactly one post. It used to show
// two posts on two providers, which taught consumers to expect a batch that
// never arrives.
const WEBHOOK_TEST_PAYLOAD = [
  {
    id: 'cm6tcts4f0005qcwit25cis26',
    content: 'This is a test post from PostQueen',
    publishDate: '2025-02-06T13:09:00.000Z',
    releaseURL: 'https://instagram.com/p/release',
    state: 'PUBLISHED',
    integration: {
      id: 'cm6s4uyou0001i2r47pxix6z1',
      name: 'test',
      providerIdentifier: 'instagram',
      picture: 'https://example.com/sample-avatar.jpg',
      type: 'social',
    },
  },
];

export const Webhooks: FC = () => {
  const fetch = useFetch();
  const toaster = useToaster();
  const t = useT();
  const user = useUser();
  const router = useRouter();
  const { setChromePatch } = useSettingsTabChrome();
  const [editing, setEditing] = useState<any | null | undefined>(undefined);
  // Which row is mid-test. One at a time is enough — the button is the only
  // thing that starts one, and it disables itself while it runs.
  const [testingId, setTestingId] = useState<string | null>(null);
  // Throw on a bad response instead of parsing the error body as the list —
  // `{statusCode, message}` has no `.length`, so a 500 used to render as
  // "this org has no webhooks". SWR surfaces the throw as `error`.
  const list = useCallback(async () => {
    const response = await fetch('/webhooks');
    if (!response.ok) {
      throw new Error('Could not load webhooks');
    }
    return response.json();
  }, []);
  const { data, isLoading, error, mutate } = useSWR('webhooks', list);
  // `webhooks` on the tier object is a number, and 0 (FREE) must count as
  // at-limit rather than "no limit configured".
  const webhookLimit = user?.tier?.webhooks;
  const atLimit =
    typeof webhookLimit === 'number' &&
    !isLoading &&
    !error &&
    (data?.length ?? 0) >= webhookLimit;
  // Same shared `/integrations/list` cache the editor already reads — no extra request.
  const {
    isLoading: integrationsLoading,
    error: integrationsError,
    data: integrations,
    mutate: mutateIntegrations,
  } = useIntegrationList();

  // A webhook only ever fires when a post publishes, so with no channels
  // connected there is nothing to configure yet. Editing existing rows stays
  // available — only the add path redirects.
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

  const addWebhook = useCallback(async () => {
    const list = await resolveIntegrations();
    if (list === null) {
      toaster.show(t('something_went_wrong', 'Something went wrong'), 'warning');
      return;
    }
    if (!list.length) {
      toaster.show(
        t(
          'webhook_needs_channel',
          'Connect a channel first — webhooks fire when a post publishes.'
        ),
        'warning'
      );
      router.push('/channels?add=1');
      return;
    }
    setEditing(null);
  }, [resolveIntegrations, router, toaster, t]);

  useEffect(() => {
    const limit = user?.tier?.webhooks;
    if (!limit) return;
    // Not while loading: `data?.length ?? 0` would publish "Webhooks (0/N)"
    // into the pane header and then correct itself.
    if (isLoading) return;
    setChromePatch({
      title: t('webhooks_quota_title', 'Webhooks ({{count}}/{{limit}})', {
        count: data?.length ?? 0,
        limit,
      }),
    });
    return () => setChromePatch(null);
  }, [data?.length, isLoading, setChromePatch, t, user?.tier?.webhooks]);

  // A webhook scoped only to channels that have since gone is permanently
  // silent, and the row gave no hint of it. Note the join shape here is
  // `[{ integration: {...} }]`, not autopost's JSON string; zero rows means
  // "every channel" in both.
  const channelHealth = useCallback(
    (row: any) =>
      computeChannelHealth(
        (row?.integrations || [])
          .map((i: any) => i?.integration?.id)
          .filter(Boolean),
        integrations || []
      ),
    [integrations]
  );
  const closeEditor = useCallback(() => setEditing(undefined), []);
  // Fires a real sample delivery at the saved URL — same endpoint and payload
  // the editor's Send Test uses, so it proves the same thing without opening
  // the form.
  const testWebhook = useCallback(
    (row: any) => async () => {
      setTestingId(row.id);
      try {
        const response = await fetch(
          `/webhooks/send?url=${encodeURIComponent(row.url)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(WEBHOOK_TEST_PAYLOAD),
          }
        );
        const result = await response.json().catch(() => ({} as any));
        if (result?.send) {
          toaster.show(t('webhook_sent', 'Webhook delivered'), 'success');
          return;
        }
        const reason = Array.isArray(result?.message)
          ? result.message[0]
          : result?.message ||
            result?.error ||
            (result?.status ? `HTTP ${result.status}` : '');
        toaster.show(
          reason ||
            t('webhook_failed', 'The endpoint did not accept the test webhook'),
          'warning'
        );
      } finally {
        setTestingId(null);
      }
    },
    [fetch, toaster, t]
  );
  const deleteHook = useCallback(
    (row: any) => async () => {
      if (
        await deleteDialog(
          t(
            'are_you_sure_you_want_to_delete',
            `Are you sure you want to delete ${row.name}?`,
            { name: row.name }
          )
        )
      ) {
        const response = await fetch(`/webhooks/${row.id}`, {
          method: 'DELETE',
        });
        // customFetch resolves on 4xx/5xx, so an unchecked response showed a
        // green "deleted" and then mutate() quietly put the row back.
        if (!response.ok) {
          toaster.show(
            t('webhook_delete_failed', 'Could not delete this webhook'),
            'warning'
          );
          return;
        }
        mutate();
        toaster.show(
          t('webhook_deleted_successfully', 'Webhook deleted successfully'),
          'success'
        );
      }
    },
    [fetch, mutate, toaster, t]
  );

  if (editing !== undefined) {
    return (
      <SettingsPaneEditor
        title={
          editing
            ? t('update_webhook', 'Update webhook')
            : t('add_webhook', 'Add webhook')
        }
        description={t(
          'webhook_editor_description',
          'Send a ping when posts publish so your other tools can react.'
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
      {isLoading && (
        <div className="mt-[18px] overflow-hidden rounded-pqMd bg-pqPop shadow-[inset_0_0_0_1px_var(--border)]">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-[11px] border-b border-pqLine p-[13px_15px] last:border-b-0"
            >
              <Skeleton className="size-[30px] shrink-0 rounded-[9px]" />
              <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
                <Skeleton className="h-[13px] w-[38%]" />
                <Skeleton className="h-[11px] w-[62%]" />
              </div>
              <Skeleton className="h-[28px] w-[64px] shrink-0 rounded-pqSm" />
            </div>
          ))}
        </div>
      )}
      {!isLoading && !!data?.length && (
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
                  <path d="M10.2 13.8a4.2 4.2 0 0 0 6.3.45l2.4-2.4a4.2 4.2 0 0 0-5.95-5.95l-1.4 1.4M13.8 10.2a4.2 4.2 0 0 0-6.3-.45l-2.4 2.4a4.2 4.2 0 0 0 5.95 5.95l1.4-1.4" />
                </svg>
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-[7px]">
                  <span className="truncate text-[13.5px] font-[600] text-pqText">
                    {p.name}
                  </span>
                  <ChannelHealthBadge health={channelHealth(p)} />
                </div>
                <div className="mt-[2px] truncate font-mono text-[11.5px] text-pqMuted">
                  {p.url}
                </div>
              </div>
              {/* Labelled pill, same shape as the Autopost row action. */}
              <button
                type="button"
                onClick={testWebhook(p)}
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
                  <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />
                </svg>
                {testingId === p.id
                  ? t('autopost_testing', 'Testing…')
                  : t('send_test', 'Send Test')}
              </button>
              <button
                type="button"
                onClick={() => setEditing(p)}
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
      {!isLoading && !!error && (
        <div className="mt-[18px] text-[13px] leading-[1.45] text-pqWarn">
          {t('webhooks_load_failed', 'Could not load your webhooks.')}
        </div>
      )}
      {!isLoading && !error && !data?.length && (
        <div className="mt-[18px] text-[13px] leading-[1.45] text-pqMuted">
          {t(
            'webhooks_empty',
            'No webhooks yet. Add one to get an HTTP call whenever a post publishes.'
          )}
        </div>
      )}
      <button
        type="button"
        onClick={addWebhook}
        // The header already says "Webhooks (2/2)"; leaving the button live
        // meant filling in the whole form only to be refused with a 402.
        disabled={atLimit}
        className={clsx(
          'flex h-[34px] items-center gap-[6px] self-start rounded-pqSm bg-pqBrand ps-[11px] pe-[13px] text-[13px] font-[600] text-pqOnBrand transition-colors hover:bg-pqBrandHover',
          (data?.length || 0) > 0 ? 'mt-[13px]' : 'mt-[18px]',
          atLimit && 'pointer-events-none opacity-50'
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
        {t('add_a_webhook', 'Add a webhook')}
      </button>
      {atLimit && (
        <div className="mt-[8px] text-[13px] leading-[1.45] text-pqMuted">
          {t(
            'webhooks_limit_reached',
            'Your plan is at its webhook limit. Remove one or upgrade to add another.'
          )}
        </div>
      )}
    </div>
  );
};
const details = object().shape({
  name: string().required(),
  url: string().url().required(),
  integrations: array(),
});
const getWebhookOptions = (t: (key: string, fallback: string) => string) => [
  {
    // "Channels", not "Integrations" — see the note in autopost.tsx.
    label: t('all_channels', 'All channels'),
    value: 'all',
  },
  {
    label: t('specific_channels', 'Specific channels'),
    value: 'specific',
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
  const options = getWebhookOptions(t);
  const [allIntegrations, setAllIntegrations] = useState(
    (data?.integrations?.length || 0) > 0 ? options[1] : options[0]
  );
  const toast = useToaster();
  const form = useForm({
    resolver: yupResolver(details),
    // onChange, not the RHF default onSubmit: both Save and Send Test are
    // disabled while the form is invalid, so onSubmit would never run and
    // `errors` would never populate — the fields could never explain themselves.
    mode: 'onChange',
    values: {
      name: data?.name || '',
      url: data?.url || '',
      integrations: data?.integrations?.map((p: any) => p.integration) || [],
    },
  });
  const integrations = form.watch('integrations');
  const url = form.watch('url');
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
  // useIntegrationList falls back to `[]`, which is indistinguishable from an
  // org with no channels — so everything derived from the list has to know
  // whether the list is real, or a failed request prunes every selection and
  // leaves Save disabled on an existing webhook.
  const listLoaded = !isLoading && !listError && !!(dataList || []).length;
  // Same filter as the autopost picker — a half-connected or disabled channel
  // never publishes, so a webhook scoped to it would never fire either.
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
  // Reconciled against everything that still EXISTS, not against what is
  // currently pickable — a channel that merely needs reconnecting is still a
  // legitimate part of the webhook and must not be dropped on the next save.
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
  // The webhook's channels as they were when the editor opened. Their rows stay
  // in the list after being un-ticked, so a mis-click on a reconnect-needed
  // channel can be undone instead of removing it for the rest of the session.
  const openedWithIds = useMemo(
    () =>
      new Set(
        ((data?.integrations || []) as any[]).map(
          (i: any) => i?.integration?.id
        )
      ),
    [data?.integrations]
  );
  // Selectable channels plus anything already picked that is not, so those rows
  // stay visible and removable instead of vanishing from the list.
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
      // dataList, not pickableList: a row that is drawn must be clickable, and
      // the extras above are drawn precisely because they are not pickable.
      const found = ((dataList || []) as any[]).find((i) => i.id === id);
      if (found) {
        form.setValue('integrations', [...current, found]);
      }
    },
    [form, dataList]
  );
  const selectAllChannels = useCallback(
    (visible: any[]) => {
      // Adds, never replaces — with a search active, replacing silently dropped
      // every pick that was off screen.
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
  const channelsOk =
    allIntegrations.value !== 'specific' || !!selectedChannelIds.length;
  const callBack = useCallback(
    async (values: any) => {
      const response = await fetch('/webhooks', {
        method: data?.id ? 'PUT' : 'POST',
        body: JSON.stringify({
          ...(data?.id
            ? {
                id: data.id,
              }
            : {}),
          ...values,
        }),
      });
      // customFetch resolves on 4xx/5xx too, so an unchecked response meant a
      // green "added successfully" for a webhook that was never written.
      if (!response.ok) {
        const body = await response.json().catch(() => ({} as any));
        const reason = Array.isArray(body?.message)
          ? body.message[0]
          : body?.message;
        toast.show(
          reason || t('webhook_save_failed', 'Could not save this webhook'),
          'warning'
        );
        return;
      }
      toast.show(
        data?.id
          ? t('webhook_updated_successfully', 'Webhook updated successfully')
          : t('webhook_added_successfully', 'Webhook added successfully'),
        'success'
      );
      reload();
    },
    [data, integrations]
  );
  const sendTest = useCallback(async () => {
    const url = form.getValues('url');
    try {
      const response = await fetch(
        `/webhooks/send?url=${encodeURIComponent(url)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(WEBHOOK_TEST_PAYLOAD),
        }
      );

      const result = await response.json().catch(() => ({ send: false }));

      if (result?.send) {
        toast.show(t('webhook_sent', 'Webhook delivered'), 'success');
        return;
      }
      // customFetch does not throw on 4xx, so a rejected URL arrives as a
      // normal body: { message: [...], statusCode: 400 }. The endpoint also
      // reports its own `status` / `error` — say which it was.
      const reason = Array.isArray(result?.message)
        ? result.message[0]
        : result?.message || result?.error;
      toast.show(
        reason ||
          t('webhook_failed', 'The endpoint did not accept the test webhook'),
        'warning'
      );
    } catch (e: any) {
      toast.show(
        t('webhook_failed', 'The endpoint did not accept the test webhook'),
        'warning'
      );
    }
  }, []);

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(callBack)}>
        <div className="relative flex flex-1 flex-col gap-[12px] pt-0">
          <Input
            label="Name"
            translationKey="label_name"
            {...form.register('name')}
          />
          <Input
            label="URL"
            translationKey="label_url"
            {...form.register('url')}
          />
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
                  'webhooks_channels_tip_specific',
                  'The webhook fires only for posts on the channels you tick below.'
                )
              : t(
                  'webhooks_channels_tip_all',
                  'The webhook fires for posts on every connected channel.'
                )}
          </p>
          {allIntegrations.value === 'specific' && dataList && !isLoading && (
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
          {/* The only thing Save still waits on that no field can explain. */}
          {form.formState.isValid && !channelsOk && (
            <p className="text-[13px] leading-[1.45] text-pqMuted">
              {t('pick_at_least_one_channel', 'Pick at least one channel.')}
            </p>
          )}
          <ModalFormActions onCancel={() => onCancel?.()}>
            <Button
              type="submit"
              className="h-[40px] shrink-0 rounded-[10px] px-[18px] text-[13.5px] font-[600]"
              disabled={
                !form.formState.isValid ||
                !channelsOk ||
                form.formState.isSubmitting
              }
            >
              {t('save', 'Save')}
            </Button>
            <Button
              type="button"
              secondary={true}
              className="h-[40px] shrink-0 rounded-[10px] px-[16px] text-[13.5px] font-[600]"
              onClick={sendTest}
              // The test only ever pings the URL — a name and a channel pick
              // are not its business.
              disabled={!url || !!form.formState.errors.url}
            >
              {t('send_test', 'Send Test')}
            </Button>
          </ModalFormActions>
        </div>
      </form>
    </FormProvider>
  );
};
