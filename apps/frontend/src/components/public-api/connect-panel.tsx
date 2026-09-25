'use client';

import {
  FC,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import clsx from 'clsx';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '../layout/user.context';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  useTourRunning,
  useTourStepKey,
} from '@gitroom/frontend/components/onboarding/tour';
import {
  PublicApiKeysSection,
  PublicAppsSection,
} from '@gitroom/frontend/components/public-api/public.component';
import {
  ApprovedAppsComponent,
  useApprovedApps,
} from '@gitroom/frontend/components/approved-apps/approved-apps.component';
import { useViewport } from '@gitroom/frontend/components/layout/use.viewport';
import {
  buildConnectionsCatalog,
  CONNECT_NAV_ACCOUNT,
  CONNECT_NAV_BROWSE,
  LEGACY_NAV_CONNECTOR,
  connectionsForNav,
  defaultNavForConnection,
  findConnection,
  resolveConnectNavId,
  resolveConnectorId,
  type ConnectNavId,
  absoluteApiUrl,
  needsApiUrl,
} from '@gitroom/frontend/components/public-api/connections.catalog';
import { ConnectHub } from '@gitroom/frontend/components/public-api/connect-hub';
import { ConnectDetail } from '@gitroom/frontend/components/public-api/connect-detail';
import {
  Card,
  ICONS,
  KEY_PLACEHOLDER,
  StrokeIcon,
  maskIn,
  useCopy,
} from '@gitroom/frontend/components/public-api/connect-ui';
import {
  RouteOverlayScrim,
  useRouteOverlayActive,
  type RouteOverlayMode,
} from '@gitroom/frontend/components/layout/leave-settings';

const NAV_ICONS: Record<ConnectNavId, string[]> = {
  all: [
    'M4 5.5h6.5A1.5 1.5 0 0 1 12 7v4.5A1.5 1.5 0 0 1 10.5 13H4A1.5 1.5 0 0 1 2.5 11.5V7A1.5 1.5 0 0 1 4 5.5ZM13.5 5.5H20A1.5 1.5 0 0 1 21.5 7v2A1.5 1.5 0 0 1 20 10.5h-6.5A1.5 1.5 0 0 1 12 9V7A1.5 1.5 0 0 1 13.5 5.5ZM4 16h6.5A1.5 1.5 0 0 1 12 17.5V20A1.5 1.5 0 0 1 10.5 21.5H4A1.5 1.5 0 0 1 2.5 20v-2.5A1.5 1.5 0 0 1 4 16ZM13.5 13.5H20A1.5 1.5 0 0 1 21.5 15v5A1.5 1.5 0 0 1 20 21.5h-6.5A1.5 1.5 0 0 1 12 20v-5a1.5 1.5 0 0 1 1.5-1.5Z',
  ],
  bots: ICONS.chat,
  agents: ICONS.terminal,
  editors: [
    'M14 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H17A1.5 1.5 0 0 0 18.5 18v-8',
    'm13.5 12.5 6-6M16 6.5h3.5V10',
  ],
  automation: [
    'M4 14a1 1 0 0 1-.8-1.6l9.9-10.2a.5.5 0 0 1 .9.5l-1.9 6A1 1 0 0 0 13 10h7a1 1 0 0 1 .8 1.6l-9.9 10.2a.5.5 0 0 1-.9-.5l1.9-6A1 1 0 0 0 11 14z',
  ],
  developer: ['m16 18 6-6-6-6M8 6l-6 6 6 6'],
  'oauth-apps': [
    'M5 7.5h6.5A1.5 1.5 0 0 1 13 9v9.5A1.5 1.5 0 0 1 11.5 20H5A1.5 1.5 0 0 1 3.5 18.5V9A1.5 1.5 0 0 1 5 7.5Z',
    'M14.5 4.5H19A1.5 1.5 0 0 1 20.5 6v9A1.5 1.5 0 0 1 19 16.5h-4.5',
  ],
  'api-keys': ICONS.key,
  'approved-apps': ['M9 12.5l2.5 2.5 5-5M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z'],
};

// Its own hook, as the repo requires of every SWR call. Same key and options as
// `organization.selector` so the two share one cache entry rather than each
// fetching the list.
const useOrganizations = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    return await (await fetch('/user/organizations')).json();
  }, [fetch]);

  return useSWR('organizations', load, {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    refreshWhenOffline: false,
    refreshWhenHidden: false,
    revalidateOnReconnect: false,
  });
};

/**
 * The three things most agents and tools ask for, next to the key they carry.
 * Masked on screen; Copy puts the real value on the clipboard.
 */
const AddressesCard: FC<{ apiKey: string; apiUrl: string }> = ({
  apiKey,
  apiUrl,
}) => {
  const t = useT();
  const copyValue = useCopy();
  const member = apiKey === KEY_PLACEHOLDER;
  const rows = [
    {
      label: t('conn_address_mcp', 'MCP address'),
      value: `${apiUrl}/mcp/${apiKey}`,
    },
    {
      label: t('conn_address_sign_in', 'Sign-in address'),
      value: `${apiUrl}/mcp-oauth-dynamic`,
    },
    {
      label: t('conn_address_header', 'Public API header'),
      value: `Authorization: ${apiKey}`,
    },
  ];
  return (
    <Card className="mt-[16px] gap-[12px] p-[18px_20px]">
      <div>
        <h4 className="m-0 font-display text-[16px] font-[700] text-pqText">
          {t('conn_addresses', 'Addresses')}
        </h4>
        <p className="m-0 mt-[3px] text-[13px] text-pqMuted">
          {member
            ? t(
                'conn_addresses_sub_member',
                'What most agents and tools ask for. Put the workspace key in place of YOUR_API_KEY; only an admin can see it.'
              )
            : t(
                'conn_addresses_sub',
                'What most agents and tools ask for. Copy puts your real key in.'
              )}
        </p>
      </div>
      <div className="overflow-hidden rounded-[10px] shadow-[inset_0_0_0_1px_var(--border)]">
        {rows.map((row, i) => (
          <div
            key={row.label}
            className={clsx(
              'grid grid-cols-[minmax(0,150px)_minmax(0,1fr)_auto] items-center gap-[14px] py-[9px] pe-[10px] ps-[14px]',
              i > 0 && 'border-t border-pqLine'
            )}
          >
            <span className="text-[13px] font-[600] text-pqText">
              {row.label}
            </span>
            <span
              dir="ltr"
              className="truncate font-mono text-[12.5px] text-pqMuted"
            >
              {maskIn(row.value, apiKey)}
            </span>
            <button
              type="button"
              onClick={() => copyValue(row.value)}
              className="inline-flex h-[30px] cursor-pointer items-center gap-[6px] rounded-[8px] bg-pqPop px-[10px] text-[12.5px] font-[600] text-pqText shadow-[inset_0_0_0_1px_var(--border)] transition-colors hover:bg-pqHover"
            >
              <StrokeIcon paths={ICONS.copy} size={14} />
              {t('copy', 'Copy')}
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
};

/**
 * Connect PostQueen. A left menu of categories and your account, a catalog
 * that scrolls inside the panel, and one page per agent or tool that fits the
 * window. The panel is the size of the window less the scrim's margin, up to
 * 1376x836.
 */
export const ConnectPanel: FC<{
  onClose?: () => void;
}> = ({ onClose }) => {
  const t = useT();
  const user = useUser();
  const { data: organizations } = useOrganizations();
  const { data: approvedApps } = useApprovedApps();
  const currentOrgName = useMemo(
    () =>
      organizations?.find((org: { id: string }) => org.id === user?.orgId)
        ?.name,
    [organizations, user?.orgId]
  );
  const { backendUrl, supportEmail } = useVariables();
  const { mobile, tablet, desktop, touch } = useViewport();
  const layout = useMemo(
    () => ({ mobile, tablet, desktop }),
    [mobile, tablet, desktop]
  );
  const router = useRouter();
  const searchParams = useSearchParams();
  const tourKey = useTourStepKey();
  const tourHub =
    tourKey === 'connect-pq' ||
    tourKey === 'connect-featured' ||
    tourKey === 'connect-creds';
  const tourConn = tourKey === 'connect-featured';

  const [nav, setNav] = useState<ConnectNavId>('all');
  const [picked, setPicked] = useState('');
  const [mobilePane, setMobilePane] = useState(false);
  const [query, setQuery] = useState('');
  const paneRef = useRef<HTMLDivElement>(null);

  // The catalog and a page share one overflow pane. Without a reset, opening a
  // card after scrolling the list keeps the same scrollTop and the page opens
  // half way down.
  useLayoutEffect(() => {
    const el = paneRef.current;
    if (el) el.scrollTop = 0;
  }, [nav, picked]);

  // A member gets no key from the server; the snippets read YOUR_API_KEY
  // instead of an address that stops at the slash.
  const apiKey = user?.publicApi || KEY_PLACEHOLDER;
  const apiUrl = useMemo(() => absoluteApiUrl(backendUrl), [backendUrl]);
  const customApiUrl = needsApiUrl(apiUrl) ? apiUrl : undefined;
  const mcpUrl = `${apiUrl}/mcp`;

  const groups = useMemo(
    () =>
      buildConnectionsCatalog({
        t,
        backendUrl: apiUrl,
        mcpUrl,
        apiKey,
        apiUrl: customApiUrl,
      }),
    [t, apiUrl, mcpUrl, apiKey, customApiUrl]
  );

  useEffect(() => {
    if (!tourHub) return;
    setNav('all');
    setPicked('');
    setQuery('');
    setMobilePane(true);
  }, [tourHub]);

  useEffect(() => {
    if (tourHub) return;
    const rawNav = searchParams.get('nav');
    const resolvedNav = resolveConnectNavId(rawNav);
    const connectorId = resolveConnectorId(searchParams.get('connector'));

    // `?connector=oauth` has always opened the OAuth app console.
    if (connectorId === 'oauth') {
      setNav('oauth-apps');
      setPicked('');
      setMobilePane(true);
      return;
    }

    const found = connectorId ? findConnection(groups, connectorId) : undefined;
    // Older developer links (`?nav=cli`) opened one card; they still do.
    const legacy = rawNav
      ? LEGACY_NAV_CONNECTOR[rawNav.trim().toLowerCase()]
      : '';
    const item = found || (legacy ? findConnection(groups, legacy) : undefined);

    if (item) {
      setNav(
        resolvedNav && resolvedNav !== 'all'
          ? resolvedNav
          : defaultNavForConnection(item)
      );
      setPicked(item.id);
      setMobilePane(true);
      return;
    }
    if (resolvedNav) {
      setNav(resolvedNav);
      setMobilePane(true);
    }
  }, [searchParams, groups, tourHub]);

  const syncUrl = useCallback(
    (nextNav: ConnectNavId, nextPicked: string) => {
      const params = new URLSearchParams();
      params.set('nav', nextNav);
      if (nextPicked) params.set('connector', nextPicked);
      router.replace(`/connections?${params.toString()}`, { scroll: false });
    },
    [router]
  );

  const selectNav = useCallback(
    (id: ConnectNavId) => {
      setNav(id);
      setPicked('');
      setQuery('');
      setMobilePane(true);
      syncUrl(id, '');
    },
    [syncUrl]
  );

  const selectItem = useCallback(
    (id: string) => {
      const found = findConnection(groups, id);
      if (!found) return;
      const nextNav = defaultNavForConnection(found);
      setNav(nextNav);
      setPicked(found.id);
      setQuery('');
      setMobilePane(true);
      syncUrl(nextNav, found.id);
    },
    [groups, syncUrl]
  );

  const clearPicked = useCallback(() => {
    setPicked('');
    syncUrl(nav, '');
  }, [nav, syncUrl]);

  const active = picked ? findConnection(groups, picked) : undefined;

  const close = useCallback(() => {
    if (onClose) {
      onClose();
      return;
    }
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/launches');
    }
  }, [onClose, router]);

  const navLabels = useMemo(
    (): Record<ConnectNavId, string> => ({
      all: t('connect_nav_all_view', 'All'),
      bots: t('connect_nav_assistants', 'Assistants and bots'),
      agents: t('connect_nav_coding', 'Coding agents'),
      editors: t('connect_nav_editors_apps', 'Editors and other apps'),
      automation: t('connect_nav_automations', 'Automations'),
      developer: t('connect_nav_developer_tools', 'Developer tools'),
      'api-keys': t('connect_nav_api_key', 'API key'),
      'oauth-apps': t('connect_nav_oauth_apps', 'OAuth apps'),
      'approved-apps': t('connect_nav_approved_apps', 'Approved Apps'),
    }),
    [t]
  );

  const counts = useMemo(() => {
    const out: Partial<Record<ConnectNavId, number>> = {};
    for (const id of CONNECT_NAV_BROWSE) {
      if (id !== 'all') out[id] = connectionsForNav(groups, id).length;
    }
    // Shown once it has loaded, never a zero that is merely not back yet.
    if (Array.isArray(approvedApps)) out['approved-apps'] = approvedApps.length;
    return out;
  }, [groups, approvedApps]);

  const openKey = useCallback(() => selectNav('api-keys'), [selectNav]);

  const searchBox = (
    <div className="relative min-w-0 flex-1">
      <StrokeIcon
        paths={ICONS.search}
        size={16}
        className="pointer-events-none absolute start-[11px] top-1/2 -translate-y-1/2 text-pqSoft"
      />
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (picked) {
            setPicked('');
            syncUrl(nav, '');
          }
        }}
        placeholder={t('conn_search_agents', 'Search agents and tools')}
        aria-label={t('conn_search_agents', 'Search agents and tools')}
        className={clsx(
          'w-full rounded-pqSm bg-pqInner pe-[34px] ps-[34px] text-[13.5px] text-pqText shadow-[inset_0_0_0_1px_var(--border)] outline-none placeholder:text-pqSoft focus-visible:shadow-[inset_0_0_0_1px_var(--brand)]',
          mobile ? 'h-[44px]' : 'h-[36px]'
        )}
      />
      {!!query && (
        <button
          type="button"
          onClick={() => setQuery('')}
          aria-label={t('conn_clear_search', 'Clear search')}
          className="absolute end-[6px] top-1/2 grid size-[26px] -translate-y-1/2 cursor-pointer place-items-center rounded-[6px] text-pqSoft hover:bg-pqHover hover:text-pqText"
        >
          <StrokeIcon paths={ICONS.close} size={14} />
        </button>
      )}
    </div>
  );

  const closeButton = (size: 36 | 44) => (
    <button
      type="button"
      onClick={close}
      aria-label={t('close', 'Close')}
      className={clsx(
        'grid shrink-0 cursor-pointer place-items-center rounded-[8px] text-pqMuted transition-colors hover:bg-pqHover hover:text-pqText',
        size === 44 ? 'size-[44px]' : 'size-[36px]'
      )}
    >
      <StrokeIcon paths={ICONS.close} size={19} />
    </button>
  );

  const keyIconButton = (
    <button
      type="button"
      data-tour="connect-creds"
      onClick={openKey}
      aria-label={t('conn_your_api_key', 'Your API key')}
      className="grid size-[44px] shrink-0 cursor-pointer place-items-center rounded-[8px] text-pqMuted transition-colors hover:bg-pqHover hover:text-pqText"
    >
      <StrokeIcon paths={ICONS.key} size={18} />
    </button>
  );

  const navRow = (id: ConnectNavId) => {
    const on = id === nav && !mobile && !query.trim();
    const count = counts[id];
    return (
      <button
        key={id}
        type="button"
        onClick={() => selectNav(id)}
        aria-current={on ? 'page' : undefined}
        className={clsx(
          'flex cursor-pointer items-center gap-[9px] rounded-pqSm px-[9px] text-start transition-[box-shadow,color,background-color] hover:shadow-[inset_0_0_0_999px_var(--navRowHover)]',
          mobile ? 'h-[44px] text-[14px]' : 'h-[34px] text-[13px]',
          on
            ? 'bg-pqNavActive font-[600] text-pqFocused'
            : 'font-[500] text-pqText'
        )}
      >
        <StrokeIcon
          paths={NAV_ICONS[id]}
          className={on ? 'text-pqFocused' : 'text-pqSoft'}
        />
        <span className="min-w-0 flex-1 truncate">{navLabels[id]}</span>
        {count !== undefined && (
          <span className="text-[11.5px] font-[600] tabular-nums text-pqSoft">
            {count}
          </span>
        )}
        {mobile && (
          <StrokeIcon
            paths={ICONS.chevron}
            className="text-pqSoft rtl:rotate-180"
          />
        )}
      </button>
    );
  };

  const navGroups = (
    <nav
      aria-label={t('connect_postqueen', 'Connect PostQueen')}
      className="flex flex-col gap-[12px]"
    >
      {(
        [
          [t('connect_nav_browse', 'Browse'), CONNECT_NAV_BROWSE],
          [t('connect_nav_account', 'Account'), CONNECT_NAV_ACCOUNT],
        ] as const
      ).map(([label, ids], i) => (
        <div
          key={label}
          className={clsx(
            'flex flex-col gap-[1px]',
            i > 0 && 'border-t border-pqLine pt-[12px]'
          )}
        >
          <div className="px-[9px] pb-[5px] text-[10.5px] font-[600] uppercase tracking-[0.07em] text-pqMuted">
            {label}
          </div>
          {ids.map(navRow)}
        </div>
      ))}
    </nav>
  );

  const accountView = () => {
    // Each Account view answers for its own rights: API key masks a key it may
    // not show, OAuth apps refuses to fetch for members, Approved Apps is per
    // user and ungated to begin with.
    if (nav === 'api-keys') {
      return (
        <div className="max-w-[880px]">
          <h3 className="m-0 font-display text-[19px] font-[700] tracking-[-0.015em] text-pqText">
            {t('connect_nav_api_key', 'API key')}
          </h3>
          <div className="mt-[4px] text-[13.5px] text-pqMuted">
            {t(
              'api_keys_description',
              "Reveal or rotate this workspace's API key. The public API, the CLI and MCP use it."
            )}
          </div>
          <PublicApiKeysSection embeddedInConnect />
          <AddressesCard apiKey={apiKey} apiUrl={apiUrl} />
        </div>
      );
    }
    if (nav === 'oauth-apps') {
      return (
        <div className="max-w-[880px]">
          <h3 className="m-0 font-display text-[19px] font-[700] tracking-[-0.015em] text-pqText">
            {t('connect_nav_oauth_apps', 'OAuth apps')}
            {/* Upstream 6c1c5dd6: an OAuth app belongs to one organization, and
                someone with the same email in two of them needs to see which
                one they are about to create it in. */}
            {!!currentOrgName && (
              <span className="font-[500] text-pqMuted">
                {' '}
                / {currentOrgName}
              </span>
            )}
          </h3>
          <div className="mt-[4px] text-[13.5px] text-pqMuted">
            {t(
              'developers_oauth_description',
              'Build OAuth apps so other products can post on behalf of your users. After authorization you get a pos_ token that works like an API key.'
            )}
          </div>
          <PublicAppsSection />
        </div>
      );
    }
    if (nav === 'approved-apps') {
      return (
        <div className="max-w-[880px]">
          <h3 className="m-0 font-display text-[19px] font-[700] tracking-[-0.015em] text-pqText">
            {t('connect_nav_approved_apps', 'Approved Apps')}
          </h3>
          <div className="mt-[4px] text-[13.5px] text-pqMuted">
            {t(
              'conn_approved_apps_sub',
              'Apps you connected by signing in, with no key. Revoke one to take its access away.'
            )}
          </div>
          <ApprovedAppsComponent />
        </div>
      );
    }
    return null;
  };

  const content = active ? (
    <ConnectDetail
      key={active.id}
      item={active}
      groups={groups}
      apiKey={apiKey}
      supportEmail={supportEmail}
      layout={layout}
      onBack={clearPicked}
      onPick={selectItem}
      onNav={selectNav}
    />
  ) : (CONNECT_NAV_ACCOUNT as ConnectNavId[]).includes(nav) && !query.trim() ? (
    accountView()
  ) : (
    <ConnectHub
      nav={nav}
      groups={groups}
      query={query}
      onPick={selectItem}
      onClearQuery={() => setQuery('')}
      layout={layout}
      tourConn={tourConn}
    />
  );

  const showConnectIndex = mobile && !mobilePane && !picked;
  const paneTitle = active
    ? active.name
    : query.trim()
      ? t('conn_search_title', 'Search')
      : navLabels[nav];

  return (
    <div
      data-connect-panel="1"
      onClick={(e) => e.stopPropagation()}
      className={clsx(
        'relative flex shrink-0 flex-col overflow-hidden bg-pqPop shadow-[var(--e3),0_0_0_1px_var(--border)] animate-pqPop',
        '[&_a]:cursor-pointer [&_button]:cursor-pointer [&_button:disabled]:cursor-not-allowed',
        mobile
          ? 'h-full w-full pb-[env(safe-area-inset-bottom)]'
          : touch
            ? 'h-full w-full rounded-none'
            : 'h-[min(836px,100%)] w-[min(1376px,100%)] rounded-[16px]'
      )}
    >
      {mobile ? (
        showConnectIndex ? (
          <div className="flex min-h-0 flex-1 flex-col bg-pqInner">
            <div className="flex h-[52px] shrink-0 items-center gap-[6px] border-b border-pqLine bg-pqPop px-[4px]">
              <span className="flex ps-[10px]">
                <SafeImage src="/postqueen.svg" alt="" width={26} height={26} />
              </span>
              <span className="min-w-0 flex-1 truncate font-display text-[16px] font-[700] text-pqText">
                {t('connect_postqueen', 'Connect PostQueen')}
              </span>
              {keyIconButton}
              {closeButton(44)}
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-[16px] overflow-y-auto p-[14px_12px_24px]">
              <div className="flex px-[4px]">{searchBox}</div>
              {query.trim() ? content : navGroups}
            </div>
          </div>
        ) : (
          <>
            <div className="flex h-[52px] shrink-0 items-center gap-[6px] border-b border-pqLine px-[4px]">
              <button
                type="button"
                aria-label={t('back', 'Back')}
                onClick={() => {
                  if (picked) clearPicked();
                  else setMobilePane(false);
                }}
                className="grid size-[44px] place-items-center rounded-[8px] text-pqText transition-colors hover:bg-pqHover"
              >
                <StrokeIcon
                  paths={ICONS.back}
                  size={19}
                  className="rtl:rotate-180"
                />
              </button>
              <span className="min-w-0 flex-1 truncate font-display text-[16px] font-[700] text-pqText">
                {paneTitle}
              </span>
              {keyIconButton}
              {closeButton(44)}
            </div>
            <div
              ref={paneRef}
              className="min-h-0 flex-1 overflow-y-auto bg-pqInner p-[16px_14px_28px]"
            >
              {content}
            </div>
          </>
        )
      ) : (
        <>
          <div className="flex h-[60px] shrink-0 items-center gap-[16px] border-b border-pqLine bg-pqPop pe-[12px] ps-[18px]">
            <span
              className={clsx(
                'flex shrink-0 items-center gap-[10px]',
                desktop && 'w-[218px]'
              )}
            >
              <SafeImage src="/postqueen.svg" alt="" width={28} height={28} />
              <span className="whitespace-nowrap font-display text-[15px] font-[700] tracking-[-0.01em] text-pqText">
                {t('connect_postqueen', 'Connect PostQueen')}
              </span>
            </span>
            <div className="flex min-w-0 max-w-[440px] flex-1">{searchBox}</div>
            <span className="flex-1" />
            <button
              type="button"
              data-tour="connect-creds"
              onClick={openKey}
              className="inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-[7px] rounded-[8px] bg-pqPop px-[12px] text-[12.5px] font-[600] text-pqText shadow-[inset_0_0_0_1px_var(--border)] transition-colors hover:bg-pqHover"
            >
              <StrokeIcon paths={ICONS.key} size={15} />
              {t('conn_your_api_key', 'Your API key')}
            </button>
            {closeButton(36)}
          </div>
          <div className="flex min-h-0 flex-1">
            <div className="w-[236px] shrink-0 overflow-y-auto border-e border-pqLine bg-pqSettings p-[16px_8px_14px]">
              {navGroups}
            </div>
            <div
              ref={paneRef}
              className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-pqInner p-[20px_28px_24px]"
            >
              {content}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

/**
 * /connections route, Settings-style scrim + Connect panel.
 *
 * Open to everyone. The gate this used to carry (`public_api && isGeneral &&
 * org admin`) was inherited from the page this replaced, and two thirds of it
 * were wrong here: `public_api` is false on FREE, which is every unsubscribed
 * account, and `isGeneral` is the hosted-SaaS flag, false on every self-host,
 * which is the audience most likely to want MCP in the first place. Between
 * them they hid the catalog from the people the product tour walks to it, and
 * a connections page nobody can open is not a connections page.
 *
 * What is genuinely admin-only is the credential, and the server already says
 * so: `/user/self` returns an empty `publicApi` to members and
 * `POST /api-key/rotate` is policy-guarded. So members get the catalog and the
 * install steps, and a line telling them where the key comes from, see
 * `ConnectPanel`.
 *
 * `mode=intercept`, soft-open via `@modal/(.)connections`.
 * `mode=page`, hard URL; scrim portals to body (covers header).
 */
export const ConnectPage: FC<{ mode?: RouteOverlayMode }> = ({
  mode = 'page',
}) => {
  const router = useRouter();
  // A `@modal` slot keeps its last active state across soft navigations, so a
  // push to a route with no intercept (the tour: /connections → /channels)
  // strands this overlay over the new page. `default.tsx` only covers hard
  // loads, and nothing else ever unmounts it.
  const active = useRouteOverlayActive('connect');
  const tourRunning = useTourRunning();

  const back = useCallback(() => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/launches');
    }
  }, [router]);

  useEffect(() => {
    // Hooks still run while the overlay is hidden, an unguarded listener would
    // navigate back from whatever page stranded it. During the tour the key
    // belongs to the tour, which has its own Escape and its own way of leaving;
    // both firing ends the tour *and* walks back a page.
    if (!active || tourRunning) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') back();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [back, active, tourRunning]);

  if (!active) {
    return null;
  }

  return (
    <RouteOverlayScrim mode={mode} kind="connect" onClose={back}>
      <ConnectPanel onClose={back} />
    </RouteOverlayScrim>
  );
};
