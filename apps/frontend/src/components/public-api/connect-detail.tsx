'use client';

import { FC, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { leaveSettingsFor } from '@gitroom/frontend/components/layout/leave-settings';
import {
  CHAT_APP_IDS,
  CONNECT_DOCS_URL,
  findConnection,
  keyStepFor,
  settingsExitHref,
  type Connection,
  type ConnectNavId,
  type Demo,
  type Group,
  type Step,
} from '@gitroom/frontend/components/public-api/connections.catalog';
import {
  AskChip,
  Card,
  CodePanel,
  CommandRow,
  ConnIcon,
  type ConnectLayout,
  Eyebrow,
  ICONS,
  InlineCode,
  KEY_PLACEHOLDER,
  KeyRow,
  NewBadge,
  OutButton,
  OutLink,
  StrokeIcon,
  TryChip,
} from '@gitroom/frontend/components/public-api/connect-ui';

/**
 * One item's page. Setup is a single numbered path: the key, the text to copy
 * and the prompt to try sit inside the step that needs them, and the example
 * sits next to it. What to know and what to do when it fails are one tab
 * over, every other way to connect a third, so the setup fits one screen.
 */

type Layout = ConnectLayout;
type TabId = 'setup' | 'tips' | 'ways';

const DOCS = CONNECT_DOCS_URL;

/**
 * The steps as the page shows them: the key first wherever it is needed. When
 * a step's code already carries an admin's key, the key row would only repeat
 * it; a member always gets the row, because it says whose key it is.
 */
const withKeyStep = (
  item: Connection,
  steps: Step[],
  keyStep: Step,
  apiKey: string
): Step[] => {
  if (item.cred === 'none' || steps.some((s) => s.inline === 'key')) {
    return steps;
  }
  const inCode =
    apiKey !== KEY_PLACEHOLDER && steps.some((s) => s.code?.includes(apiKey));
  return inCode ? steps : [keyStep, ...steps];
};

const Stepper: FC<{ steps: Step[]; apiKey: string }> = ({ steps, apiKey }) => {
  const t = useT();
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        const oneLine = !!step.code && !step.code.includes('\n');
        return (
          <li
            key={`${step.title}-${i}`}
            className={clsx('relative flex gap-[14px]', !last && 'pb-[16px]')}
          >
            {!last && (
              <span className="absolute bottom-[5px] start-[13px] top-[34px] w-[2px] rounded-[2px] bg-pqBrandSoft" />
            )}
            <span className="grid size-[28px] shrink-0 place-items-center rounded-full bg-pqBrand text-[12.5px] font-[700] text-pqOnBrand">
              {i + 1}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-[9px] pt-[4px]">
              <div className="text-[13.5px] leading-[1.55] text-pqMuted">
                <strong className="font-[600] text-pqText">{step.title}</strong>{' '}
                {!!step.detail && <InlineCode text={step.detail} />}
              </div>
              {step.inline === 'key' && <KeyRow apiKey={apiKey} />}
              {!!step.code &&
                (oneLine &&
                (!step.codeLabel ||
                  step.codeLabel === 'terminal' ||
                  step.codeLabel === 'value') ? (
                  <CommandRow
                    code={step.code}
                    apiKey={apiKey}
                    prompt={step.codeLabel === 'terminal'}
                  />
                ) : (
                  <CodePanel
                    code={step.code}
                    apiKey={apiKey}
                    fold={step.fold}
                    label={step.codeLabel || t('conn_code_label', 'copy this')}
                  />
                ))}
              {step.inline === 'ask' && !!step.ask && (
                <AskChip text={step.ask} />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
};

/** What you ask, the tools that run, and what comes back. */
const DemoCard: FC<{ item: Connection; demo: Demo; tryChips: string[] }> = ({
  item,
  demo,
  tryChips,
}) => {
  const t = useT();
  return (
    <Card className="gap-[12px] p-[18px_20px]">
      <div className="flex items-center justify-between">
        <h4 className="m-0 font-display text-[16px] font-[700] text-pqText">
          {t('conn_then_ask', 'Then just ask')}
        </h4>
        <span className="text-[12px] font-[600] text-pqMuted">
          {t('conn_example', 'Example')}
        </span>
      </div>
      <div className="max-w-[330px] self-end rounded-[16px] rounded-ee-[4px] bg-pqBrand px-[14px] py-[11px] text-[13.5px] leading-[1.5] text-pqOnBrand">
        {demo.ask}
      </div>
      {!!demo.rows.length && (
        <div className="overflow-hidden rounded-[12px] bg-pqInner shadow-[inset_0_0_0_1px_var(--border)]">
          {demo.rows.map((row, i) => (
            <div
              key={`${row.tool}-${i}`}
              className={clsx(
                'flex h-[34px] items-center gap-[8px] px-[12px]',
                i > 0 && 'border-t border-pqLine'
              )}
            >
              <span className="grid size-[16px] shrink-0 place-items-center rounded-full bg-pqOk text-pqOnBrand">
                <StrokeIcon paths={ICONS.check} size={10} />
              </span>
              <span
                dir="ltr"
                className="min-w-0 flex-1 truncate font-mono text-[12px] text-pqFocused"
              >
                {row.tool}
              </span>
              {!!row.result && (
                <span className="shrink-0 text-[12px] text-pqSoft">
                  {row.result}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {!!demo.answer && (
        <div className="flex gap-[10px]">
          <ConnIcon item={item} size="xs" />
          <div className="min-w-0 flex-1 rounded-[14px] bg-pqPop p-[10px_13px] text-[13.5px] leading-[1.5] text-pqText shadow-[inset_0_0_0_1px_var(--border)]">
            {demo.answer}
            <div className="mt-[6px] text-[12px] font-[600] text-pqFocused">
              {t('conn_on_calendar', 'On your PostQueen calendar')}
            </div>
          </div>
        </div>
      )}
      {!!tryChips.length && (
        <div className="flex flex-col gap-[8px] pt-[4px]">
          <span className="text-[12px] font-[600] text-pqSoft">
            {t('conn_also_try', 'Also try')}
          </span>
          <div className="flex flex-wrap gap-[6px]">
            {tryChips.map((chip) => (
              <TryChip key={chip} text={chip} />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};

/** Examples without a chat: workflows, requests, SDK calls. */
const ExamplesCard: FC<{ item: Connection; apiKey: string }> = ({
  item,
  apiKey,
}) => {
  const t = useT();
  return (
    <Card className="gap-[10px] p-[18px_20px]">
      <h4 className="m-0 font-display text-[16px] font-[700] text-pqText">
        {t('conn_examples_eyebrow', 'Examples')}
      </h4>
      {(item.examples || []).map((ex, i) => (
        <div
          key={`${ex.body}-${i}`}
          className="flex flex-col gap-[6px] rounded-[10px] bg-pqInner p-[11px_13px] shadow-[inset_0_0_0_1px_var(--border)]"
        >
          {!!ex.title && (
            <span className="text-[13px] font-[600] text-pqText">
              {ex.title}
            </span>
          )}
          <span className="text-[12.5px] leading-[1.45] text-pqMuted">
            {ex.body}
          </span>
          {!!ex.code &&
            (ex.code.includes('\n') ? (
              <CodePanel code={ex.code} apiKey={apiKey} label={item.name} />
            ) : (
              <CommandRow code={ex.code} apiKey={apiKey} />
            ))}
        </div>
      ))}
    </Card>
  );
};

/** A chat-style example built from the older example list, until a page has its own. */
const demoFromExamples = (item: Connection): Demo | null => {
  const talk = ['chat', 'bot', 'agent', 'cli'].includes(item.exampleKind);
  const first = item.examples?.[0];
  if (!talk || !first) return null;
  return {
    ask: first.body,
    rows: first.tool ? [{ tool: first.tool, result: '' }] : [],
    answer: first.reply || '',
  };
};

const Callout: FC<{
  icon: string[];
  children: ReactNode;
  tone?: 'info' | 'warn';
  trailing?: ReactNode;
}> = ({ icon, children, tone = 'info', trailing }) => (
  <div className="flex items-center gap-[12px] rounded-[12px] bg-pqPop p-[12px_14px] shadow-[inset_0_0_0_1px_var(--border)]">
    <StrokeIcon
      paths={icon}
      size={17}
      className={tone === 'warn' ? 'text-pqAmber' : 'text-pqFocused'}
    />
    <span className="min-w-0 flex-1 text-[12.5px] leading-[1.5] text-pqMuted">
      {children}
    </span>
    {trailing}
  </div>
);

export const ConnectDetail: FC<{
  item: Connection;
  groups: Group[];
  apiKey: string;
  supportEmail: string;
  layout: Layout;
  onBack: () => void;
  onPick: (id: string) => void;
  onNav: (id: ConnectNavId) => void;
}> = ({
  item,
  groups,
  apiKey,
  supportEmail,
  layout,
  onBack,
  onPick,
  onNav,
}) => {
  const t = useT();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('setup');
  const [route, setRoute] = useState<'signin' | 'key'>(
    item.signInSteps?.length ? 'signin' : 'key'
  );

  const settingsHref = settingsExitHref(item.id);
  const guide = item.docs[0]?.href;
  const goodToKnow =
    item.goodToKnow || [item.info, item.note].filter((s): s is string => !!s);
  const fixes = item.fixes || [];
  const routes = item.routes || [];

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'setup', label: t('conn_tab_setup', 'Setup') },
  ];
  if (goodToKnow.length || fixes.length) {
    tabs.push({
      id: 'tips',
      label: t('conn_tab_tips', 'Tips and fixes'),
      count: goodToKnow.length + fixes.length,
    });
  }
  if (routes.length) {
    tabs.push({
      id: 'ways',
      label: t('conn_tab_ways', 'All ways to connect'),
      count: routes.length,
    });
  }
  const shown = tabs.some((tab) => tab.id === activeTab) ? activeTab : 'setup';

  const keyStep = keyStepFor(t);
  // Signing in needs no key, so the sign-in route gets no key row.
  const steps =
    route === 'signin' && item.signInSteps?.length
      ? item.signInSteps
      : withKeyStep(item, item.steps, keyStep, apiKey);
  const demo = item.demo || demoFromExamples(item);
  const tryChips =
    item.tryChips ||
    (item.demo ? [] : (item.examples || []).slice(1).map((ex) => ex.body));
  // A chat app front door or a media integration takes more than a minute.
  const quick = ['bots', 'agents', 'editors'].includes(item.section);
  const chatApps = CHAT_APP_IDS.map((id) => findConnection(groups, id)).filter(
    (c): c is Connection => !!c
  );

  const header = (
    <div
      className={clsx(
        'flex gap-[14px]',
        layout.mobile ? 'flex-col' : 'items-center'
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-[14px]">
        {!layout.mobile && (
          <button
            type="button"
            onClick={onBack}
            aria-label={t('back', 'Back')}
            className="grid size-[34px] shrink-0 cursor-pointer place-items-center rounded-[8px] bg-pqPop text-pqMuted shadow-[inset_0_0_0_1px_var(--border)] transition-colors hover:text-pqText"
          >
            <StrokeIcon
              paths={ICONS.back}
              size={17}
              className="rtl:rotate-180"
            />
          </button>
        )}
        <ConnIcon item={item} size="xl" decorative />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-[9px]">
            <h2 className="m-0 font-display text-[21px] font-[700] tracking-[-0.02em] text-pqText">
              {item.name}
            </h2>
            {item.isNew && <NewBadge />}
            {!!item.soonNote && (
              <span className="inline-flex h-[20px] items-center gap-[4px] rounded-full bg-pqBtnSimple px-[8px] text-[11px] font-[600] text-pqMuted">
                <StrokeIcon paths={ICONS.clock} size={11} />
                {item.soonNote}
              </span>
            )}
          </div>
          <div className="mt-[2px] text-[13.5px] text-pqMuted">
            {item.short}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-[8px]">
        {!!guide && (
          <OutButton href={guide}>
            {t('conn_guide_docs', 'Guide in the docs')}
          </OutButton>
        )}
        {!!item.site && (
          <OutButton href={item.site}>
            {t('conn_on_site', 'On postqueen.ai')}
          </OutButton>
        )}
        {!!settingsHref && (
          <button
            type="button"
            onClick={() => leaveSettingsFor(settingsHref, router)}
            className="inline-flex h-[32px] cursor-pointer items-center gap-[6px] rounded-[8px] bg-pqBrand px-[12px] text-[12.5px] font-[600] text-pqOnBrand transition-colors hover:bg-pqBrandHover"
          >
            {t('conn_set_up_in_settings', 'Set up in Settings')}
            <StrokeIcon
              paths={ICONS.arrow}
              size={14}
              className="rtl:rotate-180"
            />
          </button>
        )}
        {item.section === 'media' && (
          <button
            type="button"
            onClick={() =>
              leaveSettingsFor('/settings?tab=integrations', router)
            }
            className="inline-flex h-[32px] cursor-pointer items-center rounded-[8px] bg-pqBrand px-[12px] text-[12.5px] font-[600] text-pqOnBrand transition-colors hover:bg-pqBrandHover"
          >
            {t('connect_open_integrations', 'Open Integrations')}
          </button>
        )}
        {item.id === 'oauth' && (
          <button
            type="button"
            onClick={() => onNav('oauth-apps')}
            className="inline-flex h-[32px] cursor-pointer items-center rounded-[8px] bg-pqBrand px-[12px] text-[12.5px] font-[600] text-pqOnBrand transition-colors hover:bg-pqBrandHover"
          >
            {t('connect_open_oauth_apps', 'Open OAuth Apps')}
          </button>
        )}
      </div>
    </div>
  );

  const setupTitle = (
    <div className="flex items-baseline justify-between gap-[12px]">
      <h3 className="m-0 font-display text-[19px] font-[700] leading-[1.15] tracking-[-0.015em] text-pqText">
        {item.setupTitle ||
          t('conn_setup_title', 'Connect {{name}}', { name: item.name })}{' '}
        <span className="font-serif font-[400] italic text-pqFocused">
          {item.setupAccent ||
            (quick
              ? t('conn_setup_accent', 'in about a minute.')
              : t('conn_setup_accent_steps', 'step by step.'))}
        </span>
      </h3>
    </div>
  );

  const routeToggle = !!item.signInSteps?.length && (
    <div
      className="flex gap-[2px] rounded-[8px] bg-pqBtnSimple p-[2px]"
      role="radiogroup"
      aria-label={t('conn_route_label', 'How to connect')}
    >
      {(
        [
          ['signin', t('conn_route_sign_in', 'Sign in, no key'), ICONS.signin],
          ['key', t('conn_route_key', 'Key in the address'), ICONS.key],
        ] as const
      ).map(([id, label, icon]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={route === id}
          onClick={() => setRoute(id)}
          className={clsx(
            'inline-flex h-[32px] flex-1 cursor-pointer items-center justify-center gap-[7px] rounded-[6px] px-[12px] text-[13px] mobile:h-[44px]',
            route === id
              ? 'bg-pqPop font-[600] text-pqText shadow-pqE1'
              : 'font-[500] text-pqMuted hover:text-pqText'
          )}
        >
          <StrokeIcon paths={icon} size={15} />
          {label}
        </button>
      ))}
    </div>
  );

  const callouts = (
    <>
      {item.chatApps && (
        <Callout
          icon={ICONS.chat}
          trailing={
            <span className="flex shrink-0 gap-[5px]">
              {chatApps.map((app) => (
                <ConnIcon key={app.id} item={app} size="xs" />
              ))}
            </span>
          }
        >
          {t(
            'conn_chat_apps_callout',
            'Then ask from WhatsApp, Telegram, Slack or Discord, wherever your {{name}} answers.',
            { name: item.name }
          )}
        </Callout>
      )}
      {!!item.teamNote && <Callout icon={ICONS.users}>{item.teamNote}</Callout>}
    </>
  );

  const setupPane = (
    <div
      data-pq="conn-pane-setup"
      className={clsx(
        'grid items-start gap-[16px]',
        layout.desktop
          ? 'grid-cols-[minmax(0,7fr)_minmax(0,5fr)]'
          : 'grid-cols-1'
      )}
    >
      <Card className="gap-[16px] p-[18px_20px]">
        {setupTitle}
        {routeToggle}
        <Stepper steps={steps} apiKey={apiKey} />
      </Card>
      <div className="flex flex-col gap-[14px]">
        {demo ? (
          <DemoCard item={item} demo={demo} tryChips={tryChips} />
        ) : item.examples?.length ? (
          <ExamplesCard item={item} apiKey={apiKey} />
        ) : null}
        {callouts}
      </div>
    </div>
  );

  const tipsPane = (
    <div
      data-pq="conn-pane-tips"
      className={clsx(
        'grid items-start gap-[16px]',
        layout.desktop ? 'grid-cols-2' : 'grid-cols-1'
      )}
    >
      <div className="flex flex-col gap-[14px]">
        {!!goodToKnow.length && (
          <Card className="gap-[10px] p-[18px_20px]">
            <Eyebrow>{t('conn_good_to_know', 'Good to know')}</Eyebrow>
            {goodToKnow.map((line) => (
              <div
                key={line}
                className="flex gap-[10px] text-[13.5px] leading-[1.5] text-pqText"
              >
                <StrokeIcon
                  paths={ICONS.info}
                  size={15}
                  className="mt-[2px] text-pqFocused"
                />
                <span>
                  <InlineCode text={line} />
                </span>
              </div>
            ))}
          </Card>
        )}
        <div className="flex flex-wrap items-center gap-x-[16px] gap-y-[6px] px-[4px]">
          <span className="text-[13px] text-pqMuted">
            {t('conn_still_stuck', 'Still stuck?')}
          </span>
          <OutLink href={`${DOCS}/agents/troubleshooting`}>
            {t('conn_troubleshooting', 'Troubleshooting guide')}
          </OutLink>
          {!!supportEmail && (
            <a
              href={`mailto:${supportEmail}`}
              className="text-[13px] font-[600] text-pqFocused hover:underline"
            >
              {t('conn_email_support', 'Email support')}
            </a>
          )}
        </div>
      </div>
      {!!fixes.length && (
        <Card className="gap-[4px] p-[18px_20px]">
          <Eyebrow>{t('conn_not_working', 'Something not working?')}</Eyebrow>
          <div>
            {fixes.map((fix, i) => (
              <div
                key={fix.symptom}
                className={clsx(
                  'flex gap-[10px] py-[12px]',
                  i > 0 && 'border-t border-pqLine'
                )}
              >
                <StrokeIcon
                  paths={ICONS.alert}
                  size={15}
                  className="mt-[2px] text-pqAmber"
                />
                <span className="flex flex-col gap-[3px]">
                  <span className="text-[13.5px] font-[600] text-pqText">
                    <InlineCode text={fix.symptom} />
                  </span>
                  <span className="text-[13px] leading-[1.5] text-pqMuted">
                    <InlineCode text={fix.fix} />
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );

  const waysPane = (
    <div data-pq="conn-pane-ways" className="flex flex-col gap-[16px]">
      <p className="m-0 text-[13.5px] text-pqMuted">
        {t('conn_ways_intro', 'Pick the one that fits how you use {{name}}.', {
          name: item.name,
        })}
      </p>
      <Card className="gap-0">
        {routes.map((r, i) => (
          <div
            key={r.name}
            className={clsx(
              'grid gap-[10px] p-[13px_18px]',
              layout.mobile
                ? 'grid-cols-1'
                : 'grid-cols-[250px_minmax(0,1fr)_auto] items-center gap-[18px]',
              i > 0 && 'border-t border-pqLine'
            )}
          >
            <span className="flex flex-col gap-[2px]">
              <span className="text-[13.5px] font-[600] text-pqText">
                {r.name}
              </span>
              <span className="text-[12.5px] leading-[1.4] text-pqSoft">
                {r.bestFor}
              </span>
            </span>
            <span className="flex min-w-0 flex-col gap-[3px]">
              {r.address ? (
                <span
                  dir="ltr"
                  className="truncate font-mono text-[12px] text-pqText"
                >
                  {r.address}
                </span>
              ) : null}
              <span className="text-[12.5px] leading-[1.4] text-pqSoft">
                <InlineCode text={r.how} />
              </span>
            </span>
            <span
              className={clsx(
                'inline-flex h-[20px] w-fit items-center gap-[4px] justify-self-end rounded-full px-[8px] text-[11px] font-[600]',
                r.need === 'none'
                  ? 'bg-pqOkSoft text-pqOk'
                  : r.need === 'soon'
                    ? 'bg-pqText text-pqPop'
                    : 'bg-pqBtnSimple text-pqMuted'
              )}
            >
              {r.need === 'none'
                ? t('conn_need_none', 'No key')
                : r.need === 'soon'
                  ? t('conn_soon_badge', 'SOON')
                  : t('api_key', 'API key')}
            </span>
          </div>
        ))}
      </Card>
      <div
        className={clsx(
          'grid gap-[12px]',
          layout.mobile ? 'grid-cols-1' : 'grid-cols-3'
        )}
      >
        {item.docs
          .concat(item.paths || [])
          .concat(
            item.site
              ? [
                  {
                    label: t('conn_on_site_named', '{{name}} on postqueen.ai', {
                      name: item.name,
                    }),
                    href: item.site,
                  },
                ]
              : []
          )
          .map((doc) => (
            <a
              key={doc.href}
              href={doc.href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-[12px] rounded-pqLg bg-pqPop p-[14px_16px] shadow-[var(--e1),0_0_0_1px_var(--border)] hover:shadow-[var(--e1),0_0_0_1px_var(--brand)]"
            >
              <StrokeIcon
                paths={ICONS.book}
                size={20}
                className="text-pqFocused"
              />
              <span className="min-w-0 flex-1 text-[13.5px] font-[600] text-pqText">
                {doc.label}
              </span>
              <StrokeIcon
                paths={ICONS.external}
                size={15}
                className="text-pqSoft"
              />
            </a>
          ))}
        {item.chatApps &&
          chatApps.map((app) => (
            <button
              key={app.id}
              type="button"
              onClick={() => onPick(app.id)}
              className="flex cursor-pointer items-center gap-[12px] rounded-pqLg bg-pqPop p-[14px_16px] text-start shadow-[var(--e1),0_0_0_1px_var(--border)] hover:shadow-[var(--e1),0_0_0_1px_var(--brand)]"
            >
              <ConnIcon item={app} size="xs" />
              <span className="min-w-0 flex-1 text-[13.5px] font-[600] text-pqText">
                {app.name}
              </span>
              <StrokeIcon
                paths={ICONS.arrow}
                size={15}
                className="text-pqSoft rtl:rotate-180"
              />
            </button>
          ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-[14px]">
      {header}
      {tabs.length > 1 ? (
        <div
          data-pq="conn-detail-tabs"
          role="tablist"
          aria-label={item.name}
          className="flex gap-[24px] overflow-x-auto border-b border-pqLine"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={shown === tab.id}
              data-pq={`conn-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                '-mb-px inline-flex h-[38px] shrink-0 cursor-pointer items-center gap-[7px] border-b-2 text-[13.5px] mobile:h-[44px]',
                shown === tab.id
                  ? 'border-pqBrand font-[600] text-pqText'
                  : 'border-transparent font-[500] text-pqMuted hover:text-pqText'
              )}
            >
              {tab.label}
              {!!tab.count && (
                <span
                  className={clsx(
                    'inline-flex h-[18px] items-center rounded-full px-[6px] text-[11px] font-[700]',
                    shown === tab.id
                      ? 'bg-pqBrandSoft text-pqFocused'
                      : 'bg-pqBtnSimple text-pqMuted'
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="h-px bg-pqLine" />
      )}
      {shown === 'setup' && setupPane}
      {shown === 'tips' && tipsPane}
      {shown === 'ways' && waysPane}
    </div>
  );
};
