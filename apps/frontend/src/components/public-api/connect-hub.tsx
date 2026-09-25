'use client';

import { FC, useMemo, type ReactNode } from 'react';
import clsx from 'clsx';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  ALL_PAGE_NAV_IDS,
  CHAT_APP_IDS,
  CONNECT_DOCS_URL,
  CONNECT_SITE_URL,
  FEATURED_IDS,
  HERO_LOGO_IDS,
  connectionsForNav,
  findConnection,
  searchConnections,
  settingsExitHref,
  type Connection,
  type ConnectNavId,
  type Group,
} from '@gitroom/frontend/components/public-api/connections.catalog';
import {
  Card,
  ConnIcon,
  type ConnectLayout,
  ICONS,
  NewBadge,
  OutLink,
  SoonBadge,
  StrokeIcon,
  WayLine,
} from '@gitroom/frontend/components/public-api/connect-ui';

/**
 * The Connect catalog: the All view (hero, then every category), one category
 * at a time, and search. Cards open an item's page; nothing here leaves the
 * panel except the links marked with the out-arrow.
 */

type Layout = ConnectLayout;

type Pick = (id: string) => void;

const SITE = CONNECT_SITE_URL;
const DOCS = CONNECT_DOCS_URL;

const cols = (layout: Layout, desktop: 3 | 4) =>
  clsx(
    'grid gap-[14px]',
    layout.mobile
      ? 'grid-cols-1'
      : layout.tablet
        ? 'grid-cols-2'
        : desktop === 4
          ? 'grid-cols-4'
          : 'grid-cols-3'
  );

const Arrow: FC = () => (
  <StrokeIcon
    paths={ICONS.arrow}
    size={17}
    className="text-pqSoft rtl:rotate-180"
  />
);

const SectionHead: FC<{ title: string; sub: string; right?: ReactNode }> = ({
  title,
  sub,
  right,
}) => (
  <div className="flex flex-wrap items-end justify-between gap-x-[20px] gap-y-[6px]">
    <div>
      <h3 className="m-0 font-display text-[19px] font-[700] tracking-[-0.015em] text-pqText">
        {title}
      </h3>
      <p className="m-0 mt-[3px] text-[13.5px] text-pqMuted">{sub}</p>
    </div>
    {right}
  </div>
);

/** A card for the featured four: logo, what it does, a prompt to try, Set up. */
const FeaturedCard: FC<{ item: Connection; onPick: Pick; delay?: number }> = ({
  item,
  onPick,
  delay,
}) => {
  const t = useT();
  return (
    <button
      type="button"
      data-connector={item.id}
      data-conn-card="1"
      style={delay !== undefined ? { animationDelay: `${delay}s` } : undefined}
      onClick={() => onPick(item.id)}
      className="flex min-w-0 cursor-pointer flex-col gap-[12px] rounded-pqLg p-[18px] text-start shadow-[var(--e1),0_0_0_1px_var(--border)] transition-shadow [background:linear-gradient(180deg,var(--brandFaint),var(--pop)_55%),var(--pop)] hover:shadow-[var(--e1),0_0_0_1px_var(--brand)]"
    >
      <span className="flex items-start justify-between">
        <ConnIcon item={item} size="xl" decorative />
        {item.isNew && <NewBadge />}
      </span>
      <span>
        <span className="block font-display text-[17px] font-[700] tracking-[-0.015em] text-pqText">
          {item.name}
        </span>
        <span className="mt-[3px] block text-[13px] leading-[1.45] text-pqMuted">
          {item.short}
        </span>
      </span>
      {!!item.ask && (
        <span className="flex-1">
          <span className="block rounded-[12px] rounded-es-[4px] bg-pqBoxFocused p-[9px_11px] text-[12.5px] leading-[1.45] text-pqText">
            <span className="mb-[3px] block text-[10px] font-[700] uppercase tracking-[0.08em] text-pqFocused">
              {t('conn_try', 'Try')}
            </span>
            “{item.ask}”
          </span>
        </span>
      )}
      <span className="flex items-center justify-between gap-[8px] border-t border-pqLine pt-[11px]">
        {item.way ? <WayLine way={item.way} /> : <span />}
        <span className="inline-flex h-[32px] items-center gap-[7px] rounded-[8px] bg-pqBrand px-[12px] text-[12.5px] font-[600] text-pqOnBrand">
          {t('conn_set_up', 'Set up')}
          <StrokeIcon
            paths={ICONS.arrow}
            size={15}
            className="rtl:rotate-180"
          />
        </span>
      </span>
    </button>
  );
};

/** Name, one line, and how you connect. */
const AgentCard: FC<{ item: Connection; onPick: Pick }> = ({
  item,
  onPick,
}) => (
  <button
    type="button"
    data-connector={item.id}
    data-conn-card="1"
    onClick={() => onPick(item.id)}
    className="flex min-w-0 cursor-pointer flex-col gap-[12px] rounded-pqLg bg-pqPop p-[16px] text-start shadow-[var(--e1),0_0_0_1px_var(--border)] transition-shadow hover:shadow-[var(--e1),0_0_0_1px_var(--brand)]"
  >
    <span className="flex items-center gap-[12px]">
      <ConnIcon item={item} size="md" decorative />
      <span className="flex min-w-0 flex-1 items-center gap-[8px] font-display text-[15px] font-[700] tracking-[-0.01em] text-pqText">
        <span className="truncate">{item.name}</span>
        {item.isNew && <NewBadge />}
      </span>
      <Arrow />
    </span>
    <span className="flex-1 text-[13px] leading-[1.45] text-pqMuted">
      {item.short}
    </span>
    {!!item.way && (
      <span className="border-t border-pqLine pt-[11px]">
        <WayLine way={item.way} />
      </span>
    )}
  </button>
);

/** Automations and developer tools: one row each. */
const CompactCard: FC<{ item: Connection; onPick: Pick }> = ({
  item,
  onPick,
}) => {
  const t = useT();
  return (
    <button
      type="button"
      data-connector={item.id}
      data-conn-card="1"
      onClick={() => onPick(item.id)}
      className="flex min-w-0 cursor-pointer items-center gap-[14px] rounded-pqLg bg-pqPop p-[14px_16px] text-start shadow-[var(--e1),0_0_0_1px_var(--border)] transition-shadow hover:shadow-[var(--e1),0_0_0_1px_var(--brand)]"
    >
      <ConnIcon item={item} size="sm" decorative />
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="flex items-center gap-[8px] font-display text-[14px] font-[700] text-pqText">
          {item.name}
          {item.soon && <SoonBadge />}
          {!!settingsExitHref(item.id) && (
            <span className="inline-flex h-[20px] items-center rounded-full bg-pqBtnSimple px-[8px] text-[11px] font-[600] text-pqMuted">
              {t('conn_in_settings', 'In Settings')}
            </span>
          )}
        </span>
        <span className="text-[12.5px] leading-[1.4] text-pqMuted">
          {item.short}
        </span>
      </span>
      <Arrow />
    </button>
  );
};

/** On a phone every card is a row: logo, name, how you connect. */
const PhoneRow: FC<{ item: Connection; onPick: Pick }> = ({ item, onPick }) => (
  <button
    type="button"
    data-connector={item.id}
    data-conn-card="1"
    onClick={() => onPick(item.id)}
    className="flex min-h-[64px] w-full cursor-pointer items-center gap-[12px] rounded-pqLg bg-pqPop p-[12px_14px] text-start shadow-[0_0_0_1px_var(--border)]"
  >
    <ConnIcon item={item} size="md" decorative />
    <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
      <span className="flex items-center gap-[7px] text-[15px] font-[600] text-pqText">
        <span className="truncate">{item.name}</span>
        {item.isNew && <NewBadge />}
        {item.soon && <SoonBadge />}
      </span>
      {item.way ? (
        <WayLine way={item.way} />
      ) : (
        <span className="truncate text-[12.5px] text-pqMuted">
          {item.short}
        </span>
      )}
    </span>
    <StrokeIcon
      paths={ICONS.chevron}
      size={17}
      className="text-pqSoft rtl:rotate-180"
    />
  </button>
);

const ChatAppsCard: FC<{ groups: Group[]; onPick: Pick; layout: Layout }> = ({
  groups,
  onPick,
  layout,
}) => {
  const t = useT();
  const apps = CHAT_APP_IDS.map((id) => findConnection(groups, id)).filter(
    (c): c is Connection => !!c
  );
  return (
    <div
      data-pq="conn-chat-apps"
      className={clsx(
        'flex gap-[14px] rounded-pqLg bg-pqBrandFaint p-[18px_20px] shadow-[inset_0_0_0_1px_var(--brandSoft)]',
        layout.desktop ? 'items-center' : 'flex-col'
      )}
    >
      <span className="flex shrink-0 gap-[7px]">
        {apps.map((app) => (
          <ConnIcon key={app.id} item={app} size="hero" />
        ))}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="font-display text-[15px] font-[700] text-pqText">
          {t(
            'conn_chat_apps_title',
            'Ask from WhatsApp, Telegram, Slack or Discord'
          )}
        </span>
        <span className="text-[13px] leading-[1.5] text-pqMuted">
          {t(
            'conn_chat_apps_text',
            'Talk to your OpenClaw, Hermes or NanoClaw agent from the chat app you already use. PostQueen does not sign into those apps or post into them.'
          )}
        </span>
      </span>
      <span
        className={clsx(
          'flex gap-[8px]',
          layout.desktop ? 'flex-col' : 'flex-wrap gap-x-[18px]'
        )}
      >
        {(['openclaw', 'hermes'] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onPick(id)}
            className="inline-flex cursor-pointer items-center gap-[5px] whitespace-nowrap text-[13px] font-[600] text-pqFocused hover:underline"
          >
            {id === 'openclaw'
              ? t('conn_set_up_openclaw', 'Set up OpenClaw')
              : t('conn_set_up_hermes', 'Set up Hermes')}
            <StrokeIcon
              paths={ICONS.arrow}
              size={14}
              className="rtl:rotate-180"
            />
          </button>
        ))}
      </span>
    </div>
  );
};

/** The dark band on All: the pitch, the logos, and a week the agent planned. */
const HeroBand: FC<{ groups: Group[]; layout: Layout }> = ({
  groups,
  layout,
}) => {
  const t = useT();
  const logos = HERO_LOGO_IDS.map((id) => findConnection(groups, id)).filter(
    (c): c is Connection => !!c
  );
  // Every named agent, editor and app; the "any MCP app" card is not one.
  const named = ['bots', 'agents', 'editors']
    .flatMap((nav) => connectionsForNav(groups, nav as ConnectNavId))
    .filter((c) => c.id !== 'other-mcp').length;
  const cells = [
    {
      icon: 'instagram',
      time: '9:00',
      title: t('conn_hero_cell_1', 'Sunrise'),
    },
    {
      icon: 'linkedin',
      time: '12:00',
      title: t('conn_hero_cell_2', 'Outside'),
    },
    { icon: 'tiktok', time: '15:00', title: t('conn_hero_cell_3', 'Stretch') },
    { icon: 'x', time: '9:30', title: t('conn_hero_cell_4', 'Mats') },
  ];
  return (
    <div className="relative shrink-0 overflow-hidden rounded-[16px] p-[22px_26px] shadow-[inset_0_0_0_1px_var(--connHeroRing)] [background:var(--connHero)]">
      <span className="pointer-events-none absolute end-[90px] top-[-150px] size-[380px] rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--brand)_42%,transparent),transparent)]" />
      <div className="relative flex items-center gap-[28px]">
        <div className="flex min-w-0 flex-1 flex-col gap-[11px]">
          <h2 className="m-0 font-display text-[29px] font-[700] leading-[1.08] tracking-[-0.03em] text-pqConnHeroText">
            {t('conn_hero_title', 'Post from your')}{' '}
            <span className="font-serif font-[400] italic tracking-[-0.005em] text-pqConnHeroAccent">
              {t('conn_hero_accent', 'AI agent.')}
            </span>
          </h2>
          <p className="m-0 max-w-[500px] text-[14px] leading-[1.5] text-pqConnHeroMuted">
            {t(
              'conn_hero_text',
              'Ask Grok Bot, Muse, Claude, ChatGPT or any AI agent to write and schedule your posts. What they schedule shows up on your calendar, where you can edit it.'
            )}
          </p>
          <div className="mt-[2px] flex flex-wrap items-center gap-[8px]">
            {logos.map((item) => (
              <ConnIcon key={item.id} item={item} size="hero" />
            ))}
            <span className="ps-[4px] text-[12px] font-[600] text-pqConnHeroMuted">
              {t('conn_hero_more', '+{{count}} more', {
                count: Math.max(named - logos.length, 0),
              })}
            </span>
          </div>
        </div>
        {layout.desktop && (
          <div
            aria-hidden="true"
            className="light flex w-[290px] shrink-0 flex-col gap-[8px]"
          >
            <div className="max-w-[240px] self-end rounded-[13px] rounded-ee-[4px] bg-pqPop px-[12px] py-[8px] text-[12px] leading-[1.4] text-pqText">
              {t(
                'conn_hero_ask',
                'Plan next week for our sunrise class on Instagram, TikTok, LinkedIn and X.'
              )}
            </div>
            <div className="rounded-[12px] bg-pqPop p-[10px] shadow-pqE3">
              <div className="mb-[7px] flex items-center justify-between">
                <span className="flex items-center gap-[6px] text-[11.5px] font-[700] text-pqText">
                  <SafeImage
                    src="/postqueen.svg"
                    alt=""
                    width={16}
                    height={16}
                  />
                  {t('conn_hero_week', 'Next week')}
                </span>
                <span className="rounded-full bg-pqBoxFocused px-[7px] py-[2px] text-[10px] font-[700] text-pqFocused">
                  {t('conn_hero_scheduled', '{{count}} scheduled', {
                    count: cells.length,
                  })}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-[5px]">
                {cells.map((cell) => (
                  <span
                    key={cell.icon}
                    className="flex flex-col gap-[3px] rounded-[7px] bg-pqPop p-[5px_6px] shadow-[inset_0_0_0_1px_var(--border)]"
                  >
                    <span className="flex items-center gap-[4px]">
                      <SafeImage
                        src={`/icons/platforms/${cell.icon}.png`}
                        alt=""
                        width={12}
                        height={12}
                      />
                      <span className="text-[9.5px] font-[600] text-pqSoft">
                        {cell.time}
                      </span>
                    </span>
                    <span className="truncate text-[10px] font-[700] text-pqText">
                      {cell.title}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/** One category: its heading and its grid. Assistants and bots lead with the featured four. */
const Section: FC<{
  nav: (typeof ALL_PAGE_NAV_IDS)[number];
  groups: Group[];
  onPick: Pick;
  layout: Layout;
  tourConn: boolean;
}> = ({ nav, groups, onPick, layout, tourConn }) => {
  const t = useT();
  const items = connectionsForNav(groups, nav);
  const featured = new Set<string>(FEATURED_IDS);
  const heads: Record<
    typeof nav,
    { title: string; sub: string; right?: ReactNode }
  > = {
    bots: {
      title: t('connect_nav_assistants', 'Assistants and bots'),
      sub: t(
        'conn_bots_sub',
        'Ask in chat. They write, schedule and check your posts.'
      ),
      right: (
        <OutLink href={`${SITE}/api/ai-agents#compare`}>
          {t('conn_compare_agents', 'Compare agents on postqueen.ai')}
        </OutLink>
      ),
    },
    agents: {
      title: t('connect_nav_coding', 'Coding agents'),
      sub: t(
        'conn_agents_sub',
        'Schedule from your terminal or editor while you work.'
      ),
    },
    editors: {
      title: t('connect_nav_editors_apps', 'Editors and other apps'),
      sub: t(
        'conn_editors_sub',
        'Any app that speaks MCP connects with one address and your key.'
      ),
      right: (
        <OutLink href={`${DOCS}/agents/other-mcp-clients`}>
          {t('conn_guide_docs', 'Guide in the docs')}
        </OutLink>
      ),
    },
    automation: {
      title: t('connect_nav_automations', 'Automations'),
      sub: t(
        'conn_automation_sub',
        'Workflows, feeds and webhooks, no chat needed.'
      ),
    },
    developer: {
      title: t('connect_nav_developer_tools', 'Developer tools'),
      sub: t(
        'conn_developer_sub',
        'The API, the command line and the SDK, when you write the code yourself.'
      ),
      right: (
        <OutLink href={`${DOCS}/public-api/introduction`}>
          {t('conn_api_reference', 'API reference in the docs')}
        </OutLink>
      ),
    },
  };
  const head = heads[nav];
  const delay = (i: number) => (tourConn ? (i % 14) * 0.38 : undefined);

  const grid = (list: Connection[], kind: 'featured' | 'agent' | 'compact') => {
    if (layout.mobile) {
      return (
        <div className="flex flex-col gap-[10px]">
          {list.map((item) => (
            <PhoneRow key={item.id} item={item} onPick={onPick} />
          ))}
        </div>
      );
    }
    return (
      <div className={cols(layout, kind === 'featured' ? 4 : 3)}>
        {list.map((item, i) =>
          kind === 'featured' ? (
            <FeaturedCard
              key={item.id}
              item={item}
              onPick={onPick}
              delay={delay(i)}
            />
          ) : kind === 'agent' ? (
            <AgentCard key={item.id} item={item} onPick={onPick} />
          ) : (
            <CompactCard key={item.id} item={item} onPick={onPick} />
          )
        )}
      </div>
    );
  };

  const compact = nav === 'automation' || nav === 'developer';
  return (
    <section className="flex flex-col gap-[14px]">
      <SectionHead
        title={head.title}
        sub={head.sub}
        right={layout.mobile ? undefined : head.right}
      />
      {nav === 'bots' ? (
        <>
          <div
            data-tour="connect-featured"
            {...(tourConn ? { 'data-tourconn': '1' } : {})}
          >
            {grid(
              items.filter((c) => featured.has(c.id)),
              'featured'
            )}
          </div>
          {grid(
            items.filter((c) => !featured.has(c.id)),
            'agent'
          )}
          <ChatAppsCard groups={groups} onPick={onPick} layout={layout} />
        </>
      ) : (
        grid(items, compact ? 'compact' : 'agent')
      )}
    </section>
  );
};

const SearchResults: FC<{
  groups: Group[];
  query: string;
  onPick: Pick;
  onClear: () => void;
  layout: Layout;
}> = ({ groups, query, onPick, onClear, layout }) => {
  const t = useT();
  const results = useMemo(
    () => searchConnections(groups, query),
    [groups, query]
  );
  const viaChatApp = results.some((c) =>
    (c.keywords || []).some((word) =>
      word.toLowerCase().includes(query.trim().toLowerCase())
    )
  );
  if (!results.length) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-[12px] text-center">
        <span className="grid size-[48px] place-items-center rounded-[14px] bg-pqBtnSimple text-pqMuted">
          <StrokeIcon paths={ICONS.search} size={22} />
        </span>
        <div className="font-display text-[16px] font-[700] text-pqText">
          {t('conn_no_match', 'No agents or tools match “{{query}}”', {
            query: query.trim(),
            // What someone typed, shown as text; React escapes it already.
            interpolation: { escapeValue: false },
          })}
        </div>
        <div className="max-w-[420px] text-[13.5px] leading-[1.5] text-pqMuted">
          {t(
            'conn_no_match_channels',
            'Social networks like TikTok are channels, not connections. You add them from Channels.'
          )}
        </div>
        <button
          type="button"
          onClick={onClear}
          className="h-[32px] cursor-pointer rounded-[8px] bg-pqPop px-[12px] text-[12.5px] font-[600] text-pqText shadow-[inset_0_0_0_1px_var(--border)] hover:bg-pqHover"
        >
          {t('conn_clear_search', 'Clear search')}
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-[14px]">
      <div className="text-[13.5px] text-pqMuted">
        {results.length === 1
          ? t('conn_result_for', '1 result for “{{query}}”', {
              query: query.trim(),
              interpolation: { escapeValue: false },
            })
          : t('conn_results_for', '{{count}} results for “{{query}}”', {
              count: results.length,
              query: query.trim(),
              interpolation: { escapeValue: false },
            })}
      </div>
      {viaChatApp && (
        <Card className="flex-row items-center gap-[12px] p-[12px_14px]">
          <StrokeIcon paths={ICONS.chat} size={17} className="text-pqFocused" />
          <span className="min-w-0 flex-1 text-[13px] leading-[1.5] text-pqMuted">
            {t(
              'conn_chat_apps_search',
              'WhatsApp, Telegram, Slack and Discord work through an agent you host: OpenClaw, Hermes or NanoClaw.'
            )}
          </span>
          <OutLink href={`${DOCS}/agents/chat-channels`}>
            {t('conn_chat_apps_guide', 'Chat apps guide')}
          </OutLink>
        </Card>
      )}
      {layout.mobile ? (
        <div className="flex flex-col gap-[10px]">
          {results.map((item) => (
            <PhoneRow key={item.id} item={item} onPick={onPick} />
          ))}
        </div>
      ) : (
        <div className={cols(layout, 3)}>
          {results.map((item) => (
            <AgentCard key={item.id} item={item} onPick={onPick} />
          ))}
        </div>
      )}
    </div>
  );
};

export const ConnectHub: FC<{
  nav: ConnectNavId;
  groups: Group[];
  query: string;
  onPick: Pick;
  onClearQuery: () => void;
  layout: Layout;
  tourConn: boolean;
}> = ({ nav, groups, query, onPick, onClearQuery, layout, tourConn }) => {
  if (query.trim()) {
    return (
      <SearchResults
        groups={groups}
        query={query}
        onPick={onPick}
        onClear={onClearQuery}
        layout={layout}
      />
    );
  }
  if (nav === 'all') {
    return (
      <div className="flex flex-col gap-[26px]">
        <HeroBand groups={groups} layout={layout} />
        {ALL_PAGE_NAV_IDS.map((id) => (
          <Section
            key={id}
            nav={id}
            groups={groups}
            onPick={onPick}
            layout={layout}
            tourConn={tourConn}
          />
        ))}
      </div>
    );
  }
  const section = (ALL_PAGE_NAV_IDS as readonly string[]).includes(nav)
    ? (nav as (typeof ALL_PAGE_NAV_IDS)[number])
    : null;
  if (!section) return null;
  return (
    <Section
      nav={section}
      groups={groups}
      onPick={onPick}
      layout={layout}
      tourConn={tourConn}
    />
  );
};
