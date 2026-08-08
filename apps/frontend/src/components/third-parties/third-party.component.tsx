'use client';

import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { ApiModal } from '@gitroom/frontend/components/third-parties/third-party.list.component';
import { useCallback, useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { SettingsPaneEditor } from '@gitroom/frontend/components/settings/settings-pane-editor';

type ThirdPartyConnection = {
  id: string;
  name: string;
  identifier: string;
  title?: string;
  description?: string;
};

type ThirdPartyCatalogItem = {
  identifier: string;
  title: string;
  description: string;
};

/**
 * Settings → Integrations. One card per catalog provider (`GET /third-party/list`),
 * matched to connected rows (`GET /third-party`) by identifier.
 */
export const ThirdPartyComponent = () => {
  const fetch = useFetch();
  const t = useT();
  const toaster = useToaster();
  const { mutate: globalMutate } = useSWRConfig();
  const [editing, setEditing] = useState<{
    title: string;
    identifier: string;
  } | null>(null);

  const loadConnected = useCallback(async () => {
    return (await fetch('/third-party')).json();
  }, [fetch]);

  const loadCatalog = useCallback(async () => {
    return (await fetch('/third-party/list')).json();
  }, [fetch]);

  const { data: connected, mutate } = useSWR<ThirdPartyConnection[]>(
    'third-party',
    loadConnected,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      revalidateOnMount: true,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
    }
  );

  const { data: catalog } = useSWR<ThirdPartyCatalogItem[]>(
    'third-party-list',
    loadCatalog,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      revalidateOnMount: true,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
    }
  );

  // The two composer pickers read the same endpoint under their own keys, each
  // filtered to its `position` (`third-party.media.tsx`, `third-party.media-library.tsx`).
  // They revalidate on mount, but SWR paints the cached list first — so without
  // this, a provider deleted here stayed clickable in the picker until the
  // refetch landed, and one added here flashed the empty state.
  //
  // The third argument is what makes it work. `mutate(key)` alone only asks the
  // hooks *currently mounted* under that key to revalidate and leaves the cache
  // untouched otherwise — and these pickers only mount inside their modals,
  // never while Settings is on screen. Passing data (undefined) takes SWR's
  // populate-cache path instead, clearing the entry so the next open starts
  // from a loading state rather than a stale list.
  const reload = useCallback(() => {
    void mutate();
    void globalMutate('third-party-media', undefined, { revalidate: true });
    void globalMutate('third-party-media-library', undefined, {
      revalidate: true,
    });
  }, [mutate, globalMutate]);

  const connectedByIdentifier = useMemo(() => {
    const map = new Map<string, ThirdPartyConnection>();
    connected?.forEach((row) => map.set(row.identifier, row));
    return map;
  }, [connected]);

  const disconnect = useCallback(
    (id: string) => async () => {
      if (
        !(await deleteDialog(
          t(
            'are_you_sure_you_want_to_delete_integration',
            'Are you sure you want to delete this integration?'
          )
        ))
      ) {
        return;
      }

      const res = await fetch(`/third-party/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        toaster.show(
          t(
            'integration_deleted_successfully',
            'Integration deleted successfully'
          ),
          'success'
        );
        reload();
      } else {
        const error = await res.json();
        console.error('Error deleting integration:', error);
      }
    },
    [fetch, reload, t, toaster]
  );

  const openEditor = useCallback((provider: ThirdPartyCatalogItem) => {
    setEditing({ title: provider.title, identifier: provider.identifier });
  }, []);

  if (editing) {
    return (
      <SettingsPaneEditor
        title={t('top_title_add_api_key_for', 'Add API key for {{name}}', {
          name: editing.title,
        })}
        description={t(
          'add_api_key_description',
          'Connect {{name}} so you can use it from Media and the composer.',
          { name: editing.title }
        )}
        onBack={() => setEditing(null)}
      >
        <ApiModal
          identifier={editing.identifier}
          title={editing.title}
          update={reload}
          onCancel={() => setEditing(null)}
        />
      </SettingsPaneEditor>
    );
  }

  return (
    <div className="mt-[18px]">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-[12px]">
        {catalog?.map((provider) => {
          const connection = connectedByIdentifier.get(provider.identifier);
          const isConnected = !!connection;

          return (
            <div
              key={provider.identifier}
              data-pq="third-party-card"
              data-connected={isConnected ? '1' : '0'}
              className="flex min-h-[184px] flex-col gap-[12px] rounded-[16px] bg-pqInner p-[17px] outline outline-1 -outline-offset-1 outline-pqBorder transition-[outline-color] hover:outline-pqBrand"
            >
              <div className="flex items-start gap-[12px]">
                <div className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[12px] bg-pqSettings">
                  <img
                    className="h-[24px] w-[24px]"
                    src={`/icons/third-party/${provider.identifier}.png`}
                    alt=""
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-[3px] pt-[2px]">
                  <div className="text-start text-[14.5px] font-[600] tracking-[-0.01em] text-pqText">
                    {provider.title}
                  </div>
                  <div
                    className={`flex items-center gap-[5px] text-[11.5px] font-[600] ${
                      isConnected ? 'text-pqOk' : 'text-pqSoft'
                    }`}
                  >
                    {isConnected ? (
                      <span className="size-[5px] shrink-0 rounded-full bg-pqOk" />
                    ) : null}
                    {/* Not `connected` — that key is a *label* and carries its
                        own punctuation in every locale (`Connected:`,
                        `Connecté :`, `接続済み：`), which is right for
                        github.component's "Connected: {login}" and leaves a
                        dangling colon here. */}
                    {isConnected
                      ? t('third_party_status_connected', 'Connected')
                      : t('not_connected', 'Not connected')}
                  </div>
                </div>
              </div>
              <div className="line-clamp-2 whitespace-pre-wrap text-start text-[13px] leading-[1.6] text-pqMuted text-balance">
                {provider.description}
              </div>
              <div className="mt-auto flex items-center gap-[8px] border-t border-pqLine pt-[13px]">
                <button
                  type="button"
                  onClick={() => openEditor(provider)}
                  className={
                    isConnected
                      ? 'flex h-[31px] items-center rounded-[9px] bg-pqSettings px-[13px] text-[12.5px] font-[600] text-pqText transition-colors hover:bg-pqBrandSoft'
                      : 'flex h-[31px] items-center rounded-[9px] bg-pqBrand px-[13px] text-[12.5px] font-[600] text-white transition-[filter] hover:bg-pqBrandHover'
                  }
                >
                  {isConnected
                    ? t('update_key', 'Update key')
                    : t('add_api_key', 'Add API key')}
                </button>
                {isConnected && connection ? (
                  <button
                    type="button"
                    onClick={disconnect(connection.id)}
                    className="flex h-[31px] items-center rounded-[9px] bg-transparent px-[12px] text-[12.5px] font-[500] text-pqMuted transition-colors hover:text-pqWarn"
                  >
                    {t('disconnect', 'Disconnect')}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
