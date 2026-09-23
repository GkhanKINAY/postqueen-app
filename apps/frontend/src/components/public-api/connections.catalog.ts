/**
 * Static Connections catalog, docs-backed, not an API.
 *
 * Publishing channels live on Channels / Add Channel. This catalog covers
 * coding agents, bots, chat front doors, editors, automation, Public API / CLI
 * / Node SDK / OAuth apps, and third-party media. Code samples interpolate
 * backendUrl / mcpUrl / apiKey at build time.
 *
 * OpenClaw and Hermes lead with the Agent Skill, because the Chat cards build
 * on it. Both also have native MCP clients (openclaw mcp set, Hermes
 * mcp_servers), which their cards offer as a second route.
 * Do not invent Typefully commands.
 */

export type Kind = 'AGENT' | 'CHAT' | 'MCP' | 'SKILL' | 'FLOW' | 'API' | 'MEDIA';

/** How the connector talks to PostQueen. Shown on the detail pane, not the hub card. */
export type MethodId = 'MCP' | 'Skill' | 'Chat' | 'HTTP' | 'CLI' | 'API';

/** How examples render in the detail pane. */
export type ExampleKind =
  | 'chat'
  | 'bot'
  | 'agent'
  | 'workflow'
  | 'http'
  | 'cli'
  | 'api';

/** Credential the detail pane highlights. */
export type CredKind = 'mcp' | 'api' | 'env' | 'none';

/** Catalog group ids. */
export type SectionId =
  | 'agents'
  | 'bots'
  | 'chat'
  | 'featured'
  | 'editors'
  | 'automation'
  | 'developer'
  | 'media';

export type ConnectNavId =
  | 'all'
  | 'agents'
  | 'bots'
  | 'chat'
  | 'editors'
  | 'automation'
  | 'public-api'
  | 'cli'
  | 'sdk'
  | 'oauth-apps'
  | 'api-keys'
  | 'approved-apps';

/** Automation catalog ids, in display order. */
export const AUTOMATION_CHILD_IDS = [
  'n8n',
  'zapier',
  'make',
  'webhooks',
  'rss',
] as const;

export type AutomationChildId = (typeof AUTOMATION_CHILD_IDS)[number];

/** Featured marketplace row on All — four logo tiles. */
export const FEATURED_IDS = [
  'claude-apps',
  'chatgpt',
  'cursor',
  'grok',
] as const;

/** Catch-all under the 4-up, not a fifth tile in the same grid. */
export const FEATURED_CATCHALL_ID = 'other-mcp';

/** Category order on the Connectors hub, after Featured. */
export const ALL_PAGE_NAV_IDS = [
  'agents',
  'bots',
  'chat',
  'editors',
  'automation',
] as const;

export const AGENTS_DISPLAY_ORDER = [
  'claude-code',
  'codex',
  'cursor',
  'grok-build',
  'muse-code',
  'gemini',
] as const;

export const BOTS_DISPLAY_ORDER = [
  'openclaw',
  'grok-bot',
  'claude-cowork',
  'hermes',
  'perplexity-computer',
  'nanoclaw',
  'paperclip',
  'muse',
] as const;

export const EDITORS_DISPLAY_ORDER = [
  'vscode',
  'devin-desktop',
  'zed',
] as const;

function sortByIdOrder(
  items: Connection[],
  order: readonly string[]
): Connection[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const ai = rank.get(a.id) ?? order.length;
    const bi = rank.get(b.id) ?? order.length;
    return ai - bi;
  });
}

export interface Step {
  title: string;
  detail?: string;
  code?: string;
}

export interface DocLink {
  label: string;
  href: string;
}

export interface Example {
  title?: string;
  /** What you type, say, or send. */
  body: string;
  /** Shell command or code sample. */
  code?: string;
  /** Tool the client would call, shown as a chip. */
  tool?: string;
  /** What comes back: assistant line, stdout, or a short result. */
  reply?: string;
}

export interface Connection {
  id: string;
  name: string;
  glyph: string;
  /** Local icon under /icons/connections or /icons/third-party. */
  icon?: string;
  kind: Kind;
  method: MethodId;
  cred: CredKind;
  exampleKind: ExampleKind;
  section: SectionId;
  short: string;
  intro: string;
  examples?: Example[];
  info?: string;
  note?: string;
  soon?: boolean;
  docs: DocLink[];
  paths?: DocLink[];
  steps: Step[];
}

export interface Group {
  id: SectionId;
  label: string;
  blurb: string;
  items: Connection[];
}

export const KIND_STYLE: Record<Kind, string> = {
  AGENT: 'bg-pqBrandSoft text-pqFocused',
  CHAT: 'bg-pqBrandFaint text-pqBrand',
  MCP: 'bg-pqOkSoft text-pqOk',
  SKILL: 'bg-pqBrandSoft text-pqBrand',
  FLOW: 'bg-pqAmberSoft text-pqAmber',
  API: 'bg-pqBtnSimple text-pqSoft',
  MEDIA: 'bg-pqBrandFaint text-pqFocused',
};

export const METHOD_STYLE: Record<MethodId, string> = {
  MCP: 'bg-pqOkSoft text-pqOk',
  Skill: 'bg-pqBrandSoft text-pqBrand',
  Chat: 'bg-pqBrandFaint text-pqBrand',
  HTTP: 'bg-pqAmberSoft text-pqAmber',
  CLI: 'bg-pqBtnSimple text-pqSoft',
  API: 'bg-pqBtnSimple text-pqSoft',
};

export type CatalogTranslate = (key: string, defaultValue: string) => string;

export type ConnectionsCatalogContext = {
  t: CatalogTranslate;
  backendUrl: string;
  mcpUrl: string;
  apiKey?: string;
  apiKeyMasked?: string;
  apiUrl?: string;
};

export const absoluteApiUrl = (backendUrl: string) => {
  try {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    return new URL(backendUrl || '/api', origin).toString().replace(/\/$/, '');
  } catch {
    return backendUrl;
  }
};

export const needsApiUrl = (apiUrl: string) => {
  try {
    return !/(^|\.)postqueen\.ai$/.test(new URL(apiUrl).hostname);
  } catch {
    return true;
  }
};

/** The API's host, for tools that attach the key by host rather than by URL. */
const apiHost = (apiUrl: string) => {
  try {
    return new URL(apiUrl).host;
  } catch {
    return apiUrl;
  }
};

/**
 * Left-rail Connectors group. One row (labeled Connectors, not All) opens the
 * marketplace. Agents / Bots / Chat / Editors are headings inside that panel,
 * not extra rail rows.
 */
export const CONNECT_NAV_CONNECTORS: {
  id: ConnectNavId;
  labelKey: string;
  labelDefault: string;
}[] = [
  {
    id: 'all',
    labelKey: 'connect_nav_all',
    labelDefault: 'Connectors',
  },
];

/**
 * n8n, Zapier and Make stay catalog cards (they have real setup). The rail
 * opens those cards the same way Webhooks / RSS leave to Settings.
 */
export const CONNECT_AUTOMATION_SHORTCUTS: {
  id: 'n8n' | 'zapier' | 'make';
  icon: string;
  name: string;
  soon?: boolean;
}[] = [
  { id: 'n8n', icon: '/icons/connections/n8n.svg', name: 'n8n' },
  {
    id: 'zapier',
    icon: '/icons/connections/zapier.svg',
    name: 'Zapier',
    soon: true,
  },
  {
    id: 'make',
    icon: '/icons/connections/make.svg',
    name: 'Make',
    soon: true,
  },
];

export function isAutomationShortcut(id: string): boolean {
  return CONNECT_AUTOMATION_SHORTCUTS.some((item) => item.id === id);
}

export const CONNECT_NAV_DEVELOP: {
  id: ConnectNavId;
  labelKey: string;
  labelDefault: string;
}[] = [
  {
    id: 'public-api',
    labelKey: 'connect_nav_public_api',
    labelDefault: 'Public API',
  },
  { id: 'cli', labelKey: 'connect_nav_cli', labelDefault: 'CLI' },
  { id: 'sdk', labelKey: 'connect_nav_sdk', labelDefault: 'Node SDK' },
];

export const CONNECT_NAV_ACCOUNT: {
  id: ConnectNavId;
  labelKey: string;
  labelDefault: string;
}[] = [
  {
    id: 'api-keys',
    labelKey: 'connect_nav_api_keys',
    labelDefault: 'API Keys',
  },
  {
    id: 'oauth-apps',
    labelKey: 'developers',
    labelDefault: 'Developers',
  },
  {
    id: 'approved-apps',
    labelKey: 'connect_nav_approved_apps',
    labelDefault: 'Approved Apps',
  },
];

/**
 * Left-rail rows that leave Connect and open a Settings tab.
 * Webhooks and RSS AutoPost are not catalog cards: the overlay would only
 * tell you to open Settings.
 */
export const CONNECT_SETTINGS_EXITS: {
  id: string;
  href: string;
  labelKey: string;
  labelDefault: string;
}[] = [
  {
    id: 'webhooks',
    href: '/settings?tab=webhooks',
    labelKey: 'conn_webhooks_name',
    labelDefault: 'Webhooks',
  },
  {
    id: 'rss',
    href: '/settings?tab=autopost',
    labelKey: 'conn_rss_name',
    labelDefault: 'RSS AutoPost',
  },
];

export const SETTINGS_EXIT_HREF: Record<string, string> = {
  webhooks: '/settings?tab=webhooks',
  rss: '/settings?tab=autopost',
  autopost: '/settings?tab=autopost',
};

export function settingsExitHref(id: string): string | undefined {
  return SETTINGS_EXIT_HREF[id];
}

export const CONNECT_NAV = [
  ...CONNECT_NAV_CONNECTORS,
  ...CONNECT_NAV_DEVELOP,
  ...CONNECT_NAV_ACCOUNT,
];

/** Left-nav Develop rows that open a catalog item instead of a card grid. */
export const DEVELOP_NAV_ITEM: Partial<Record<ConnectNavId, string>> = {
  'public-api': 'api',
  cli: 'cli',
  sdk: 'sdk',
};

/** Deep-link aliases → catalog ids (`?connector=claude`). */
export const CONNECTOR_ALIASES: Record<string, string> = {
  claude: 'claude-apps',
  'claude-desktop': 'claude-apps',
  'claude-app': 'claude-apps',
  'claude-web': 'claude-apps',
  claudecode: 'claude-code',
  'claude code': 'claude-code',
  slack: 'slack-chat',
  discord: 'discord-chat',
  'gemini-cli': 'gemini',
  'other-clients': 'other-mcp',
  'any-mcp': 'other-mcp',
  'make.com': 'make',
  autopost: 'rss',
  'rss-autopost': 'rss',
  grokbot: 'grok-bot',
  'grok bot': 'grok-bot',
  grokbuild: 'grok-build',
  'grok-cli': 'grok-build',
  'grok build': 'grok-build',
  vscode: 'vscode',
  'vs-code': 'vscode',
  'vs code': 'vscode',
  devin: 'devin-desktop',
  'devin desktop': 'devin-desktop',
  // links written before the rename
  windsurf: 'devin-desktop',
  cascade: 'devin-desktop',
  cowork: 'claude-cowork',
  'claude cowork': 'claude-cowork',
  zed: 'zed',
  xai: 'grok',
  'muse-app': 'muse',
  perplexity: 'perplexity-computer',
  'perplexity computer': 'perplexity-computer',
};

export function resolveConnectorId(raw: string | null): string {
  if (!raw) return '';
  const key = raw.trim().toLowerCase();
  return CONNECTOR_ALIASES[key] || key;
}

/** Legacy `?nav=` aliases + current ConnectNavId values. */
export function resolveConnectNavId(raw: string | null): ConnectNavId | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (key === 'cli-api' || key === 'build' || key === 'api') return 'public-api';
  if (
    key === 'media' ||
    key === 'ai-agents' ||
    key === 'mcp' ||
    key === 'assistants' ||
    key === 'agent-skills' ||
    (ALL_PAGE_NAV_IDS as readonly string[]).includes(key)
  ) {
    return 'all';
  }
  if (key === 'developers') return 'oauth-apps';
  if (CONNECT_NAV.some((n) => n.id === key)) return key as ConnectNavId;
  return null;
}

const DOCS = 'https://docs.postqueen.ai';

const HUB_SECTIONS: SectionId[] = [
  'agents',
  'bots',
  'chat',
  'featured',
  'editors',
  'automation',
];

/**
 * Remaining cards on Connectors, grouped by category. Featured ids are omitted.
 * Develop (Public API, CLI, Node SDK) and Account (API Keys, Developers,
 * Approved Apps) rows are
 * panel-only. n8n / Zapier / Make are both grouped here and left-rail
 * shortcuts. Webhooks and RSS AutoPost are left-rail Settings exits, not
 * cards. Media stays in the catalog but is not a Connect nav.
 */
export function restGroupsForAllPage(
  groups: Group[]
): { nav: (typeof ALL_PAGE_NAV_IDS)[number]; items: Connection[] }[] {
  const featured = new Set<string>([...FEATURED_IDS, FEATURED_CATCHALL_ID]);
  return ALL_PAGE_NAV_IDS.map((nav) => ({
    nav,
    items: connectionsForNav(groups, nav).filter((c) => !featured.has(c.id)),
  })).filter((g) => g.items.length > 0);
}

/** Connections for a Connect-panel nav id. */
export function connectionsForNav(
  groups: Group[],
  navId: ConnectNavId
): Connection[] {
  const all = groups.flatMap((g) => g.items);
  const hubCard = (c: Connection) => !SETTINGS_EXIT_HREF[c.id];
  switch (navId) {
    case 'all':
      return all.filter((c) => HUB_SECTIONS.includes(c.section) && hubCard(c));
    case 'agents':
      return sortByIdOrder(
        all.filter((c) => c.section === 'agents'),
        AGENTS_DISPLAY_ORDER
      );
    case 'bots':
      return sortByIdOrder(
        all.filter((c) => c.section === 'bots'),
        BOTS_DISPLAY_ORDER
      );
    case 'chat':
      return all.filter((c) => c.section === 'chat');
    case 'editors':
      return sortByIdOrder(
        all.filter((c) => c.section === 'editors'),
        EDITORS_DISPLAY_ORDER
      );
    case 'automation':
      return all.filter((c) => c.section === 'automation' && hubCard(c));
    case 'public-api':
      return all.filter((c) => c.id === 'api');
    case 'cli':
      return all.filter((c) => c.id === 'cli');
    case 'sdk':
      return all.filter((c) => c.id === 'sdk');
    case 'oauth-apps':
    case 'api-keys':
    case 'approved-apps':
      return [];
    default:
      return [];
  }
}

export function findConnection(
  groups: Group[],
  id: string
): Connection | undefined {
  for (const group of groups) {
    const found = group.items.find((item) => item.id === id);
    if (found) return found;
  }
  return undefined;
}

export function defaultNavForConnection(item: Connection): ConnectNavId {
  if (item.id === 'api') return 'public-api';
  if (item.id === 'cli') return 'cli';
  if (item.id === 'sdk') return 'sdk';
  if (item.id === 'oauth') return 'oauth-apps';
  return 'all';
}

export function buildConnectionsCatalog(
  ctx: ConnectionsCatalogContext
): Group[] {
  const { t, backendUrl, mcpUrl, apiUrl } = ctx;
  const apiKey = ctx.apiKeyMasked ?? ctx.apiKey ?? '';
  const apiUrlStep: Step[] = apiUrl
    ? [
        {
          title: t('conn_step_api_url', 'Point it at your server'),
          detail: t(
            'conn_step_api_url_detail',
            'The skill, the CLI and the SDK call the hosted API unless told otherwise. Export this next to the key.'
          ),
          code: `export POSTQUEEN_API_URL="${apiUrl}"`,
        },
      ]
    : [];
  const mcpUrlWithKey = `${mcpUrl}/${apiKey}`;
  // The sign-in address: a workspace admin approves, and it serves every tool
  // but ask_postqueen
  const mcpSignInUrl = `${backendUrl}/mcp-oauth-dynamic`;
  const signInStep = (detail: string): Step => ({
    title: t('conn_step_sign_in', 'Or sign in instead of a key'),
    detail,
    code: mcpSignInUrl,
  });

  const skillInstall: Step[] = [
    {
      title: t('conn_step_skill_install', 'Install the PostQueen skill'),
      detail: t(
        'conn_step_skill_install_detail',
        'One command, once per machine. This is a playbook (SKILL.md). It does not install the CLI.'
      ),
      code: 'npx skills add GkhanKINAY/postqueen-agent',
    },
    {
      title: t('conn_step_cli_install', 'Install the postqueen CLI'),
      detail: t(
        'conn_step_cli_install_detail',
        'Skill agents run real shell commands on your machine. The skill does not put postqueen on your PATH. You still need this package.'
      ),
      code: 'npm install -g postqueen',
    },
    {
      title: t('conn_step_skill_key', 'Give it your API key'),
      detail: t(
        'conn_step_skill_key_detail',
        'The agent and the CLI read this from the environment. Put it in the profile the gateway or agent actually runs in. Get the key from Connections → API Keys (workspace admins only).'
      ),
      code: `export POSTQUEEN_API_KEY="${apiKey}"`,
    },
    ...apiUrlStep,
  ];

  const chatGroundworkSteps = (): Step[] => [
    {
      title: t(
        'conn_chat_step_agent',
        'Run OpenClaw or Hermes on your machine'
      ),
      detail: t(
        'conn_chat_step_agent_detail',
        'PostQueen never signs into WhatsApp, Telegram, Slack or Discord. An agent you host sits in the middle, reads the message and runs the postqueen CLI. Keep its gateway awake: openclaw gateway or hermes gateway. A sleeping laptop means a silent bot.'
      ),
    },
    ...skillInstall,
    {
      title: t('conn_chat_step_cli_ready', 'Confirm the CLI half'),
      detail: t(
        'conn_chat_step_cli_ready_detail',
        'A JSON list of your channels means the agent can reach PostQueen. Finish this before pairing a chat app.'
      ),
      code: 'postqueen integrations:list',
    },
  ];

  const chatTryStep = (): Step => ({
    title: t('conn_chat_step_try', 'Send it a message'),
    detail: t(
      'conn_chat_step_try_detail',
      'From the connected chat app, in your own words. The examples below show one channel, another channel, and several at once. Ask for a draft if you want to review on the calendar first.'
    ),
    code: t(
      'conn_bridge_example',
      'Post this photo to Instagram tonight at 7, and this video to X and LinkedIn Friday at 10 as drafts'
    ),
  });

  const sample = (ex: Example): Example => ex;

  const whatsappSteps = (): Step[] => [
    ...chatGroundworkSteps(),
    {
      title: t('conn_whatsapp_step_pair', 'Pair WhatsApp over QR'),
      detail: t(
        'conn_whatsapp_step_pair_detail',
        'WhatsApp is an OpenClaw plugin. channels add installs it and starts setup. channels login shows a QR code: scan it from the phone. OpenClaw recommends a separate WhatsApp number. Hermes uses hermes gateway setup for the same channel.'
      ),
      code: `openclaw channels add --channel whatsapp
openclaw channels login --channel whatsapp`,
    },
    {
      title: t('conn_whatsapp_step_gateway', 'Start the gateway and approve you'),
      detail: t(
        'conn_whatsapp_step_gateway_detail',
        'Leave the gateway running. The first sender to message you needs a pairing code. Access requests expire after an hour.'
      ),
      code: `openclaw gateway
openclaw pairing list whatsapp
openclaw pairing approve whatsapp <CODE>`,
    },
    chatTryStep(),
  ];

  const telegramSteps = (): Step[] => [
    ...chatGroundworkSteps(),
    {
      title: t('conn_telegram_step_bot', 'Create a Telegram bot'),
      detail: t(
        'conn_telegram_step_bot_detail',
        'In Telegram, message @BotFather, run /newbot, and save the token. Telegram ships in the core OpenClaw install, there is no plugin to add. Slack, Discord and Telegram can also be publishing channels under Channels. That is a separate setup.'
      ),
    },
    {
      title: t('conn_telegram_step_token', 'Give the token to the gateway'),
      detail: t(
        'conn_telegram_step_token_detail',
        'Export it where the gateway runs, or put it in the OpenClaw channel config. Then start the gateway and approve your own pairing code.'
      ),
      code: `export TELEGRAM_BOT_TOKEN="123:abc"
openclaw gateway
openclaw pairing list telegram
openclaw pairing approve telegram <CODE>`,
    },
    chatTryStep(),
  ];

  const slackChatSteps = (): Step[] => [
    ...chatGroundworkSteps(),
    {
      title: t('conn_slack_chat_step_app', 'Create a Slack app in your workspace'),
      detail: t(
        'conn_slack_chat_step_app_detail',
        'Socket Mode needs a Bot User OAuth Token and an App-Level Token with connections:write. Both tokens must come from the same Slack app. This is a front door to your agent, not connecting Slack as a publishing channel under Channels.'
      ),
    },
    {
      title: t('conn_slack_chat_step_plugin', 'Install the Slack plugin'),
      detail: t(
        'conn_slack_chat_step_plugin_detail',
        'Then patch the gateway config and keep it running. Typical bot scopes include app_mentions:read, channels:history, chat:write, im:history and files:write.'
      ),
      code: `openclaw plugins install @openclaw/slack
export SLACK_BOT_TOKEN=your-bot-token
export SLACK_APP_TOKEN=your-app-token
openclaw gateway`,
    },
    chatTryStep(),
  ];

  const discordChatSteps = (): Step[] => [
    ...chatGroundworkSteps(),
    {
      title: t('conn_discord_chat_step_bot', 'Create a Discord bot'),
      detail: t(
        'conn_discord_chat_step_bot_detail',
        'In the Discord Developer Portal, create an application with a bot user. Turn Message Content Intent on or the bot receives nothing readable. Invite it with the bot and applications.commands scopes. Publishing into Discord is a separate Channels setup.'
      ),
    },
    {
      title: t('conn_discord_chat_step_plugin', 'Install the Discord plugin'),
      detail: t(
        'conn_discord_chat_step_plugin_detail',
        'Hand the token to OpenClaw, start the gateway, then DM the bot and approve the pairing code.'
      ),
      code: `openclaw plugins install @openclaw/discord
export DISCORD_BOT_TOKEN="YOUR_BOT_TOKEN"
openclaw gateway
openclaw pairing list discord
openclaw pairing approve discord <CODE>`,
    },
    chatTryStep(),
  ];

  return [
    {
      id: 'agents',
      label: t('conn_group_agents', 'Agents'),
      blurb: t(
        'conn_group_agents_blurb',
        'Coding agents: Claude Code, Codex, Cursor, Grok Build, Muse Code and Gemini CLI.'
      ),
      items: [
        {
          id: 'openclaw',
          name: 'OpenClaw',
          glyph: 'OC',
          icon: '/icons/connections/openclaw.svg',
          kind: 'AGENT',
          method: 'Skill',
          cred: 'env',
          exampleKind: 'bot',
          section: 'bots',
          short: t('conn_openclaw_short', 'A bot you host that posts from chat'),
          intro: t(
            'conn_openclaw_intro',
            'OpenClaw is a self hosted personal agent that stays running on your machine. Message it from WhatsApp, Telegram, Slack or Discord. It is a bot, not a coding session. It drives the postqueen CLI through an Agent Skill, and it can also call PostQueen over MCP with openclaw mcp set.'
          ),
          examples: [
            sample({
              title: t('conn_ex_label_ig', 'One channel: Instagram'),
              body: t('conn_openclaw_ex', 'Post this photo to Instagram tonight at 7 as a draft, caption about skipping the SIM booth at the airport'),
              reply: t('conn_openclaw_ex_reply', 'Got it. That photo is an Instagram draft for tonight at 19:00 with the SIM booth caption. I will wait for you to confirm in WhatsApp before it goes out.'),
              code: 'postqueen posts:create',
            }),
            sample({
              title: t('conn_ex_label_x', 'One channel: X'),
              body: t('conn_openclaw_ex_x', 'Schedule this video on X tomorrow at 8am as a draft, copy about the Japan eSIM going live'),
              reply: t('conn_openclaw_ex_x_reply', 'Japan eSIM video is queued on X as a draft for tomorrow at 08:00. Open the calendar if you want a last look.'),
              code: 'postqueen posts:create',
            }),
            sample({
              title: t('conn_ex_label_multi', 'Several channels'),
              body: t('conn_openclaw_ex_multi', 'Share this photo to Instagram, X and LinkedIn on Friday at 10, leave them as drafts, same Japan launch caption'),
              reply: t('conn_openclaw_ex_multi_reply', 'Same Japan launch photo is drafted to Instagram, X and LinkedIn for Friday at 10:00. Say the word when they should go live.'),
              code: 'postqueen posts:create',
            }),
          ],
          info: t(
            'conn_openclaw_note',
            'The same install powers the Chat cards. Keep the Gateway awake. Chat credentials stay on your machine; PostQueen only sees the API key the CLI uses. Keep a human in the loop before anything goes out.'
          ),
          docs: [
            {
              label: t('conn_docs_openclaw', 'OpenClaw guide'),
              href: `${DOCS}/agents/openclaw`,
            },
          ],
          paths: [
            {
              label: t('conn_path_skill', 'Install via CLI skill'),
              href: `${DOCS}/agents/skill-install`,
            },
          ],
          steps: [
            {
              title: t('conn_openclaw_step_install', 'Install OpenClaw'),
              detail: t(
                'conn_openclaw_step_install_detail',
                'On macOS or Linux run the installer, then onboard so the Gateway stays running. Windows uses the PowerShell script. OpenClaw is a separate project; Node 22.22.3+, 24.15+ or 25.9+.'
              ),
              code: `curl -fsSL https://openclaw.ai/install.sh | bash
openclaw onboard --install-daemon`,
            },
            ...skillInstall,
            {
              title: t('conn_step_verify', 'Check it worked'),
              detail: t(
                'conn_openclaw_verify',
                'A JSON list of your channels means the CLI half is ready. Then link a chat app: Telegram needs a BotFather token; WhatsApp, Slack and Discord are plugins. Pairing steps live on each Chat card.'
              ),
              code: 'postqueen integrations:list',
            },
            {
              title: t('conn_openclaw_step_channel', 'Link a chat app'),
              detail: t(
                'conn_openclaw_step_channel_detail',
                'openclaw channels add installs the plugin and starts that channel\'s setup. Restart the Gateway after a plugin install. Full pairing: docs.postqueen.ai/agents/chat-channels.'
              ),
              code: 'openclaw channels add',
            },
            {
              title: t('conn_openclaw_step_mcp', 'Or connect over MCP'),
              detail: t(
                'conn_openclaw_step_mcp_detail',
                'Instead of the skill, you can use OpenClaw\'s own MCP client. Set transport to streamable-http, because OpenClaw assumes SSE when it is left out. probe connects and lists the tools. MCP tools show up in the coding and messaging tool profiles, not in minimal. Get the key from Connections → API Keys (workspace admins only).'
              ),
              code: `openclaw mcp set postqueen '${JSON.stringify({
                url: mcpUrlWithKey,
                transport: 'streamable-http',
              })}'
openclaw mcp probe postqueen`,
            },
          ],
        },
        {
          id: 'hermes',
          name: 'Hermes',
          glyph: 'H',
          icon: '/icons/connections/hermes.svg',
          kind: 'AGENT',
          method: 'Skill',
          cred: 'env',
          exampleKind: 'bot',
          section: 'bots',
          short: t('conn_hermes_short', 'Hand it a brief. It plans the week.'),
          intro: t(
            'conn_hermes_intro',
            'Hermes is Nous Research\'s open-source agent. It runs on your machine (Python, not Node), keeps memory across sessions, and drives the postqueen CLI. Hand it one brief and it can plan, write and schedule a week. It can also front the same chat apps as OpenClaw, and it has a built-in MCP client if you would rather connect over MCP.'
          ),
          examples: [
            sample({
              title: t('conn_ex_label_ig', 'One channel: Instagram'),
              body: t('conn_hermes_ex', 'Draft a caption for this photo about Monday\'s webinar and save it to Instagram for Monday 9am'),
              reply: t('conn_hermes_ex_reply', 'Webinar caption is drafted with the photo for Instagram on Monday at 09:00. Check the calendar if you want to edit it first.'),
              code: 'postqueen posts:create -t draft',
            }),
            sample({
              title: t('conn_ex_label_x', 'One channel: X'),
              body: t('conn_hermes_ex_x', 'Queue this video on X for Tuesday 8am as a draft, three reasons to get an eSIM before you fly'),
              reply: t('conn_hermes_ex_x_reply', 'The three reasons video sits on X as a draft for Tuesday at 08:00. I will not publish until you confirm.'),
              code: 'postqueen posts:create -t draft',
            }),
            sample({
              title: t('conn_ex_label_multi', 'Several channels'),
              body: t('conn_hermes_ex_multi', 'Put this photo on Instagram, X and LinkedIn Wednesday at 10, all drafts, caption for the Product Hunt launch'),
              reply: t('conn_hermes_ex_multi_reply', 'Product Hunt photo is drafted on Instagram, X and LinkedIn for Wednesday at 10:00. Confirm each one when you are ready.'),
              code: 'postqueen posts:create -t draft',
            }),
          ],
          info: t(
            'conn_hermes_note',
            'The skills CLI installs into ~/.agents/skills. Hermes loads ~/.hermes/skills plus skills.external_dirs, so point it at that folder. Recurring jobs use hermes cron create. Keep a human in the loop before anything publishes.'
          ),
          docs: [
            {
              label: t('conn_docs_hermes', 'Hermes guide'),
              href: `${DOCS}/agents/hermes`,
            },
          ],
          paths: [
            {
              label: t('conn_path_skill', 'Install via CLI skill'),
              href: `${DOCS}/agents/skill-install`,
            },
          ],
          steps: [
            {
              title: t('conn_hermes_step_install', 'Install Hermes'),
              detail: t(
                'conn_hermes_step_install_detail',
                'The installer pulls uv and Python 3.11. Windows uses the PowerShell script. Chat apps are linked with hermes gateway setup, then hermes gateway keeps them awake.'
              ),
              code: 'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash',
            },
            ...skillInstall,
            {
              title: t('conn_hermes_step_skills_dir', 'Point Hermes at the skill folder'),
              detail: t(
                'conn_hermes_step_skills_dir_detail',
                'Add this to ~/.hermes/config.yaml so Hermes reads the skill the next time it starts.'
              ),
              code: `skills:
  external_dirs:
    - ~/.agents/skills`,
            },
            {
              title: t('conn_step_verify', 'Check it worked'),
              detail: t(
                'conn_hermes_verify',
                'A JSON list of your channels means Hermes can drive PostQueen. Then give it a brief, or hook a chat app with hermes gateway setup.'
              ),
              code: 'postqueen integrations:list',
            },
            {
              title: t('conn_hermes_step_mcp', 'Or connect over MCP'),
              detail: t(
                'conn_hermes_step_mcp_detail',
                'Instead of the skill, you can use the MCP client that ships with the standard Hermes install. Add this to ~/.hermes/config.yaml, then start hermes chat, or run /reload-mcp in a session that is already open, and ask it to list your connected channels. Get the key from Connections → API Keys (workspace admins only).'
              ),
              code: `mcp_servers:
  postqueen:
    url: "${mcpUrlWithKey}"`,
            },
          ],
        },
        {
          id: 'claude-code',
          name: 'Claude Code',
          glyph: 'CC',
          icon: '/icons/connections/claude-code.svg',
          kind: 'MCP',
          method: 'MCP',
          cred: 'mcp',
          exampleKind: 'cli',
          section: 'agents',
          short: t('conn_cc_short', 'Schedule from the Claude Code session'),
          intro: t(
            'conn_cc_intro',
            'Claude Code is Anthropic\'s terminal and IDE agent, not claude.ai or Claude Desktop. Same pairing as Codex vs ChatGPT. Point it at PostQueen over MCP with one command, then schedule from the session you already have open.'
          ),
          examples: [
            sample({
              title: t('conn_ex_label_ig', 'One channel: Instagram'),
              body: t('conn_cc_ex', 'Generate a photo of a passport next to a boarding pass and draft it to Instagram tonight at 7, caption about roaming without a SIM'),
              reply: t('conn_cc_ex_reply', 'Passport photo is saved as an Instagram draft for tonight at 19:00. Take a look on the calendar before it publishes.'),
              code: 'claude', tool: 'generateImageTool',
            }),
            sample({
              title: t('conn_ex_label_x', 'One channel: X'),
              body: t('conn_cc_ex_x', 'Create a video about installing a Japan eSIM in four steps and queue it on X tomorrow at 8am as a draft'),
              reply: t('conn_cc_ex_x_reply', 'Four-step eSIM video is queued on X as a draft for tomorrow at 08:00. Nothing goes out until you confirm.'),
              code: 'claude', tool: 'generateVideoTool',
            }),
            sample({
              title: t('conn_ex_label_multi', 'Several channels'),
              body: t('conn_cc_ex_multi', 'Save the same Japan launch post as drafts on Instagram, X and LinkedIn for Friday at 10'),
              reply: t('conn_cc_ex_multi_reply', 'Japan launch is drafted to Instagram, X and LinkedIn for Friday at 10:00. Open the calendar if you want to tweak any of them.'),
              code: 'claude', tool: 'integrationSchedulePostTool',
            }),
          ],
          info: t(
            'conn_cc_note',
            'claude_desktop_config.json is the Claude chat app, not Claude Code. Config for this product is ~/.claude.json or a project .mcp.json. Official install is claude mcp add --transport http. A custom connector on claude.ai does not replace that command. Prefer MCP here; the Agent Skill is optional if you also want postqueen on the PATH (npm install -g postqueen).'
          ),
          docs: [
            {
              label: t('conn_docs_claude_code', 'Claude Code guide'),
              href: `${DOCS}/agents/claude-code`,
            },
          ],
          paths: [
            {
              label: t('conn_path_mcp', 'Connect via MCP'),
              href: `${DOCS}/mcp/clients/claude-code`,
            },
            {
              label: t('conn_path_skill', 'Install via CLI skill'),
              href: `${DOCS}/agents/skill-install`,
            },
          ],
          steps: [
            {
              title: t('conn_cc_step_add', 'Register the server'),
              detail: t(
                'conn_cc_step_add_detail',
                'Run this in your terminal. The key sits in the URL. Get it from Connections → API Keys (workspace admins only).'
              ),
              code: `claude mcp add --transport http postqueen ${mcpUrlWithKey}`,
            },
            {
              title: t('conn_step_verify', 'Check it worked'),
              code: 'claude mcp list',
            },
          ],
        },
        {
          id: 'grok-build',
          name: t('conn_grok_build_name', 'Grok Build'),
          glyph: 'Bd',
          icon: '/icons/connections/grok.svg',
          kind: 'MCP',
          method: 'MCP',
          cred: 'mcp',
          exampleKind: 'cli',
          section: 'agents',
          short: t(
            'conn_grok_build_short',
            'Grok Build MCP from the terminal'
          ),
          intro: t(
            'conn_grok_build_intro',
            'Grok Build is xAI\'s terminal coding agent, not grok.com chat and not Grok Bot. Same split as Claude Code vs Claude. Register PostQueen with grok mcp add. A custom connector at grok.com/connectors does not register this product.'
          ),
          examples: [
            sample({
              title: t('conn_ex_label_x', 'One channel: X'),
              body: t('conn_grok_build_ex', 'Queue a draft on X for 8am: we just launched Japan eSIM, keep it under 280 characters'),
              reply: t('conn_grok_build_ex_reply', 'Japan eSIM post is drafted to X for 08:00. Confirm it on the calendar before it publishes.'),
              code: 'grok', tool: 'integrationSchedulePostTool',
            }),
            sample({
              title: t('conn_ex_label_ig', 'One channel: Instagram'),
              body: t('conn_grok_build_ex_ig', 'Generate a photo of a phone unlocking at airport arrivals and draft it to Instagram tonight at 7, caption about landing ready to roam'),
              reply: t('conn_grok_build_ex_ig_reply', 'Arrivals photo is an Instagram draft for tonight at 19:00. Have a look before it goes live.'),
              code: 'grok', tool: 'generateImageTool',
            }),
            sample({
              title: t('conn_ex_label_multi', 'Several channels'),
              body: t('conn_grok_build_ex_multi', 'Put Friday\'s launch recap on Instagram, X and LinkedIn at 10 as drafts'),
              reply: t('conn_grok_build_ex_multi_reply', 'Launch recap is queued as drafts on Instagram, X and LinkedIn for Friday at 10:00. Confirm in this session when you are happy with them.'),
              code: 'grok', tool: 'integrationSchedulePostTool',
            }),
          ],
          info: t(
            'conn_grok_build_note',
            'A custom connector on grok.com does not replace grok mcp add. The command writes ~/.grok/config.toml. Grok Build may pick up a Cursor or Claude Code MCP entry as a fallback. Official setup is the grok command, then grok mcp list. grok mcp doctor postqueen diagnoses connectivity.'
          ),
          docs: [
            {
              label: t('conn_docs_grok_build', 'Grok Build guide'),
              href: `${DOCS}/agents/grok-build`,
            },
          ],
          paths: [
            {
              label: t('conn_path_mcp', 'Connect via MCP'),
              href: `${DOCS}/mcp/clients/grok-build`,
            },
          ],
          steps: [
            {
              title: t('conn_grok_build_step_add', 'Register the server'),
              detail: t(
                'conn_grok_build_step_add_detail',
                'Run this in your terminal. The key sits in the URL. Get it from Connections → API Keys (workspace admins only). Add --header "Authorization: Bearer KEY" if you prefer the key out of the URL.'
              ),
              code: `grok mcp add --transport http postqueen ${mcpUrlWithKey}`,
            },
            {
              title: t('conn_step_verify', 'Check it worked'),
              code: 'grok mcp list',
            },
          ],
        },
        {
          id: 'codex',
          name: 'Codex',
          glyph: 'Cx',
          icon: '/icons/connections/codex.svg',
          kind: 'MCP',
          method: 'MCP',
          cred: 'mcp',
          exampleKind: 'cli',
          section: 'agents',
          short: t('conn_codex_short', 'Schedule from the Codex coding agent'),
          intro: t(
            'conn_codex_intro',
            'Codex is OpenAI\'s coding agent, not ChatGPT. Same pairing as Claude Code vs Claude. Register PostQueen over MCP with one codex mcp add command. The Agent Skill and the postqueen CLI are optional. Adding a plugin in ChatGPT does not install this product.'
          ),
          examples: [
            sample({
              title: t('conn_ex_label_week', 'Check the calendar'),
              body: t('conn_codex_ex', 'What is scheduled this week?'),
              reply: t('conn_codex_ex_reply', 'This week: Instagram Tuesday at 19:00 and X Wednesday at 08:00. Want a change?'),
              code: 'codex "What is scheduled this week?"',
              tool: 'postsListTool',
            }),
            sample({
              title: t('conn_ex_label_ig', 'One channel: Instagram'),
              body: t('conn_codex_ex_ig', 'Generate a photo of someone holding a phone at Narita arrivals and draft it to Instagram tonight at 7'),
              reply: t('conn_codex_ex_ig_reply', 'Narita photo is drafted to Instagram for tonight at 19:00. Check the calendar if you want to change the caption.'),
              code: 'codex "Generate a photo of someone holding a phone at Narita arrivals and draft it to Instagram tonight at 7"',
              tool: 'generateImageTool',
            }),
            sample({
              title: t('conn_ex_label_multi', 'Several channels'),
              body: t('conn_codex_ex_multi', 'Draft the same Narita arrivals post to Instagram, X and LinkedIn Friday at 10'),
              reply: t('conn_codex_ex_multi_reply', 'Narita arrivals is drafted to Instagram, X and LinkedIn for Friday at 10:00. Nothing publishes until you confirm.'),
              code: 'codex "Draft the same Narita arrivals post to Instagram, X and LinkedIn Friday at 10"',
              tool: 'integrationSchedulePostTool',
            }),
          ],
          docs: [
            {
              label: t('conn_docs_codex', 'Codex guide'),
              href: `${DOCS}/agents/codex`,
            },
          ],
          paths: [
            {
              label: t('conn_path_mcp', 'Connect via MCP'),
              href: `${DOCS}/mcp/clients/codex`,
            },
            {
              label: t('conn_path_skill', 'Install via CLI skill'),
              href: `${DOCS}/agents/skill-install`,
            },
          ],
          steps: [
            {
              title: t('conn_codex_step_add', 'Register the server'),
              detail: t(
                'conn_codex_step_add_detail',
                'Run this in your terminal. It writes ~/.codex/config.toml, which the Codex CLI, the IDE extension and the ChatGPT desktop app share. The key sits in the URL. Get it from Connections → API Keys (workspace admins only). To keep the key out of the file, register the bare /mcp URL with --bearer-token-env-var POSTQUEEN_API_KEY instead.'
              ),
              code: `codex mcp add postqueen --url ${mcpUrlWithKey}`,
            },
            {
              title: t('conn_step_verify', 'Check it worked'),
              code: 'codex "list my social media integrations"',
            },
            {
              title: t('conn_codex_step_cli', 'Or add the skill and CLI'),
              detail: t(
                'conn_codex_step_cli_detail',
                'Codex runs shell commands with network access turned off by default, so every postqueen CLI call asks for your approval. To allow it, set network_access = true under [sandbox_workspace_write] in ~/.codex/config.toml. The MCP server above does not need this.'
              ),
            },
            ...skillInstall,
          ],
        },
        {
          id: 'muse-code',
          name: t('conn_muse_code_name', 'Muse Code'),
          glyph: 'MC',
          icon: '/icons/connections/muse.svg',
          kind: 'MCP',
          method: 'MCP',
          cred: 'mcp',
          exampleKind: 'agent',
          section: 'agents',
          short: t('conn_muse_code_short', 'Muse Code over streamable HTTP MCP'),
          intro: t(
            'conn_muse_code_intro',
            'Muse Code is Meta\'s coding agent. It loads remote MCP servers from ~/.config/muse/settings.json over streamable HTTP. This is the path that works today, the consumer Muse app does not take an MCP URL yet.'
          ),
          examples: [
            sample({
              title: t('conn_ex_label_ig', 'One channel: Instagram'),
              body: t('conn_muse_code_ex', 'Generate a square photo of a boarding pass on a tray table and draft it to Instagram tonight at 7'),
              reply: t('conn_muse_code_ex_reply', 'Boarding pass photo is an Instagram draft for tonight at 19:00. Open it before anything publishes.'),
              tool: 'generateImageTool',
            }),
            sample({
              title: t('conn_ex_label_x', 'One channel: X'),
              body: t('conn_muse_code_ex_x', 'Queue a draft on X tomorrow at 8am about the Korea eSIM going live this week'),
              reply: t('conn_muse_code_ex_x_reply', 'Korea eSIM post is queued on X as a draft for tomorrow at 08:00. Have a look first.'),
              tool: 'integrationSchedulePostTool',
            }),
            sample({
              title: t('conn_ex_label_multi', 'Several channels'),
              body: t('conn_muse_code_ex_multi', 'Share Friday\'s Korea launch post to Instagram, X and LinkedIn at 10, all drafts'),
              reply: t('conn_muse_code_ex_multi_reply', 'Korea launch is drafted to Instagram, X and LinkedIn for Friday at 10:00. Confirm on the calendar.'),
              tool: 'integrationSchedulePostTool',
            }),
          ],
          docs: [
            {
              label: t('conn_docs_muse_code', 'Muse Code MCP setup'),
              href: `${DOCS}/mcp/clients/muse`,
            },
          ],
          paths: [
            {
              label: t('conn_docs_muse_hub', 'Muse guide'),
              href: `${DOCS}/agents/muse`,
            },
          ],
          steps: [
            {
              title: t('conn_muse_code_step_file', 'Edit Muse Code settings'),
              detail: t(
                'conn_muse_code_step_file_detail',
                'Add this to ~/.config/muse/settings.json. Get the key from Connections → API Keys (workspace admins only). Restart Muse Code after saving.'
              ),
              code: JSON.stringify(
                {
                  schema_version: 1,
                  mcp_servers: {
                    postqueen: {
                      transport: 'streamable_http',
                      url: mcpUrlWithKey,
                      mode: 'optional',
                    },
                  },
                },
                null,
                2
              ),
            },
            {
              title: t('conn_muse_code_step_header', 'Or pass the key as a header'),
              detail: t(
                'conn_muse_code_step_header_detail',
                'If you prefer a bare /mcp URL, put the key in Authorization.'
              ),
              code: JSON.stringify(
                {
                  schema_version: 1,
                  mcp_servers: {
                    postqueen: {
                      transport: 'streamable_http',
                      url: mcpUrl,
                      headers: { Authorization: `Bearer ${apiKey}` },
                      mode: 'optional',
                    },
                  },
                },
                null,
                2
              ),
            },
          ],
        },
      ],
    },
    {
      id: 'chat',
      label: t('conn_group_chat_doors', 'Chat front doors'),
      blurb: t(
        'conn_group_chat_doors_blurb',
        'Message an agent from WhatsApp, Telegram, Slack or Discord. Not publishing channels, those live under Channels.'
      ),
      items: [
        {
          id: 'whatsapp',
          name: 'WhatsApp',
          glyph: 'WA',
          icon: '/icons/connections/whatsapp.svg',
          kind: 'CHAT',
          method: 'Chat',
          cred: 'env',
          exampleKind: 'bot',
          section: 'chat',
          short: t('conn_whatsapp_short', 'Voice notes to the bot on your phone'),
          intro: t(
            'conn_whatsapp_intro',
            'Talk to your hosted OpenClaw or Hermes agent from WhatsApp. PostQueen does not sign into WhatsApp and does not publish into WhatsApp. Pairing is QR on your machine. The gateway has to stay awake.'
          ),
          examples: [
            sample({
              title: t('conn_ex_label_ig', 'One channel: Instagram'),
              body: t('conn_whatsapp_ex', 'Voice note: post this photo to Instagram tonight at 7, caption about skipping the SIM booth'),
              reply: t('conn_whatsapp_ex_reply', 'Heard you. That photo is an Instagram draft for tonight at 19:00 with the SIM booth caption. Reply here when it looks right.'),
            }),
            sample({
              title: t('conn_ex_label_x', 'One channel: X'),
              body: t('conn_whatsapp_ex_x', 'Voice note: post this video to X tomorrow at 8am as a draft, copy about the Korea eSIM'),
              reply: t('conn_whatsapp_ex_x_reply', 'Korea eSIM video is drafted to X for tomorrow at 08:00. I will wait for a yes in this chat.'),
            }),
            sample({
              title: t('conn_ex_label_multi', 'Several channels'),
              body: t('conn_whatsapp_ex_multi', 'Voice note: post this to Instagram, X and LinkedIn Friday at 10 as drafts, same launch caption'),
              reply: t('conn_whatsapp_ex_multi_reply', 'Launch drafts for Instagram, X and LinkedIn are set for Friday at 10:00. Confirm in WhatsApp before they go out.'),
            }),
          ],
          info: t(
            'conn_bridge_note',
            'The gateway is yours: it runs on your infrastructure and PostQueen never sees your chat accounts. Keep a human in the loop before anything publishes.'
          ),
          docs: [
            {
              label: t('conn_docs_whatsapp', 'WhatsApp chat front door'),
              href: `${DOCS}/agents/chat-channels#whatsapp`,
            },
          ],
          steps: whatsappSteps(),
        },
        {
          id: 'telegram',
          name: 'Telegram',
          glyph: 'Tg',
          icon: '/icons/connections/telegram.svg',
          kind: 'CHAT',
          method: 'Chat',
          cred: 'env',
          exampleKind: 'bot',
          section: 'chat',
          short: t('conn_telegram_short', 'Message the hosted bot from Telegram'),
          intro: t(
            'conn_telegram_intro',
            'Talk to your hosted agent from Telegram. Create a bot with @BotFather and give the token to OpenClaw or Hermes. Telegram can also be a publishing channel under Channels. That is a separate setup.'
          ),
          examples: [
            sample({
              title: t('conn_ex_label_week', 'Check the calendar'),
              body: t('conn_telegram_ex', 'What is going out this week?'),
              reply: t('conn_telegram_ex_reply', 'This week: Instagram Tuesday at 19:00, X Wednesday at 08:00, and a YouTube draft still waiting.'),
            }),
            sample({
              title: t('conn_ex_label_ig', 'One channel: Instagram'),
              body: t('conn_telegram_ex_ig', 'Post this picture to Instagram tonight at 7 as a draft, caption about the webinar replay'),
              reply: t('conn_telegram_ex_ig_reply', 'Webinar replay picture is saved as an Instagram draft for tonight at 19:00. Confirm in Telegram before it publishes.'),
            }),
            sample({
              title: t('conn_ex_label_multi', 'Several channels'),
              body: t('conn_telegram_ex_multi', 'Send this video to Instagram, X and LinkedIn Friday at 10, all drafts, how to install the eSIM'),
              reply: t('conn_telegram_ex_multi_reply', 'Install video is drafted to Instagram, X and LinkedIn for Friday at 10:00. Confirm each one in this chat.'),
            }),
          ],
          docs: [
            {
              label: t('conn_docs_telegram', 'Telegram chat front door'),
              href: `${DOCS}/agents/chat-channels#telegram`,
            },
          ],
          steps: telegramSteps(),
        },
        {
          id: 'slack-chat',
          name: 'Slack',
          glyph: 'Sl',
          icon: '/icons/connections/slack.svg',
          kind: 'CHAT',
          method: 'Chat',
          cred: 'env',
          exampleKind: 'bot',
          section: 'chat',
          short: t('conn_slack_chat_short', 'Ask the hosted bot in a Slack channel'),
          intro: t(
            'conn_slack_chat_intro',
            'Ask your hosted agent from a Slack channel. You add a Slack app to the workspace and OpenClaw or Hermes keeps the gateway running. Connecting Slack as a publishing channel under Channels is a different setup.'
          ),
          examples: [
            sample({
              title: t('conn_ex_label_week', 'Check the calendar'),
              body: t('conn_slack_chat_ex', '@PostQueen what is on the calendar tomorrow?'),
              reply: t('conn_slack_chat_ex_reply', 'Tomorrow has one Instagram post at 19:00. Nothing else is queued.'),
            }),
            sample({
              title: t('conn_ex_label_x', 'One channel: X'),
              body: t('conn_slack_chat_ex_x', '@PostQueen post this photo to X tomorrow at 8am as a draft, copy for the webinar reminder'),
              reply: t('conn_slack_chat_ex_x_reply', 'Webinar reminder is drafted to X for tomorrow at 08:00. Peek at the calendar in Slack if you want a last look.'),
            }),
            sample({
              title: t('conn_ex_label_multi', 'Several channels'),
              body: t('conn_slack_chat_ex_multi', '@PostQueen share this video to Instagram, X and LinkedIn Friday at 10 as drafts, Product Hunt recap'),
              reply: t('conn_slack_chat_ex_multi_reply', 'Product Hunt recap is drafted to Instagram, X and LinkedIn for Friday at 10:00. Confirm in this channel.'),
            }),
          ],
          docs: [
            {
              label: t('conn_docs_slack_chat', 'Slack chat front door'),
              href: `${DOCS}/agents/chat-channels#slack`,
            },
          ],
          steps: slackChatSteps(),
        },
        {
          id: 'discord-chat',
          name: 'Discord',
          glyph: 'Dc',
          icon: '/icons/connections/discord.svg',
          kind: 'CHAT',
          method: 'Chat',
          cred: 'env',
          exampleKind: 'bot',
          section: 'chat',
          short: t('conn_discord_chat_short', 'Ask the hosted bot in a Discord channel'),
          intro: t(
            'conn_discord_chat_intro',
            'Ask your hosted agent from Discord. You run a bot with Message Content Intent and keep OpenClaw or Hermes awake. Publishing into Discord is a separate Channels setup.'
          ),
          examples: [
            sample({
              title: t('conn_ex_label_x', 'One channel: X'),
              body: t('conn_discord_chat_ex', '@PostQueen post this photo to X tomorrow at 8 as a draft, copy about early bird tickets'),
              reply: t('conn_discord_chat_ex_reply', 'Early bird photo is drafted to X for tomorrow at 08:00. Open it before it publishes.'),
              code: 'postqueen posts:create -t draft',
            }),
            sample({
              title: t('conn_ex_label_ig', 'One channel: Instagram'),
              body: t('conn_discord_chat_ex_ig', '@PostQueen post this clip to Instagram tonight at 7 as a draft, caption for the behind the scenes reel'),
              reply: t('conn_discord_chat_ex_ig_reply', 'Behind the scenes clip is saved as an Instagram draft for tonight at 19:00. Confirm in Discord first.'),
              code: 'postqueen posts:create -t draft',
            }),
            sample({
              title: t('conn_ex_label_multi', 'Several channels'),
              body: t('conn_discord_chat_ex_multi', '@PostQueen share this photo to Instagram, X and LinkedIn Friday at 10 as drafts, same ticket drop caption'),
              reply: t('conn_discord_chat_ex_multi_reply', 'Ticket drop photo is drafted to Instagram, X and LinkedIn for Friday at 10:00. Confirm each in this channel.'),
              code: 'postqueen posts:create -t draft',
            }),
          ],
          docs: [
            {
              label: t('conn_docs_discord_chat', 'Discord chat front door'),
              href: `${DOCS}/agents/chat-channels#discord`,
            },
          ],
          steps: discordChatSteps(),
        },
      ],
    },
    {
      id: 'featured',
      label: t('conn_group_featured', 'Featured'),
      blurb: t(
        'conn_group_featured_blurb',
        'Chat products and any other MCP client. One URL, 21 tools.'
      ),
      items: [
        {
          id: 'claude-apps',
          name: t('conn_claude_apps_name', 'Claude'),
          glyph: 'C',
          icon: '/icons/connections/claude.svg',
          kind: 'MCP',
          method: 'MCP',
          cred: 'mcp',
          exampleKind: 'chat',
          section: 'featured',
          short: t('conn_claude_apps_short', 'Chat on claude.ai, Desktop or phone'),
          intro: t(
            'conn_claude_apps_intro',
            'This is Anthropic\'s chat: claude.ai, Claude Desktop, iOS and Android. PostQueen is not in Anthropic\'s Connectors Directory. You paste our public MCP URL yourself. Claude\'s UI calls that Add custom connector; that is their name for a remote MCP server, not a listing we published. One add follows the account (web, Desktop and phone). For LAN or VPN, use mcp-remote in the Desktop config instead. Claude Code is a different product, use that card under Agents, like Codex vs ChatGPT.'
          ),
          examples: [
            sample({
              title: t('conn_ex_label_week', 'Check the calendar'),
              body: t('conn_claude_apps_ex', 'What is in my PostQueen queue this week?'),
              reply: t('conn_claude_apps_ex_reply', 'This week you have Instagram on Tuesday at 19:00, X on Wednesday at 08:00, and a YouTube draft waiting. Want me to move anything?'),
              tool: 'postsListTool',
            }),
            sample({
              title: t('conn_ex_label_ig', 'One channel: Instagram'),
              body: t('conn_claude_apps_ex_ig', 'Generate a photo of a passport stamp and draft it to Instagram tonight at 7, caption about collecting countries not SIM cards'),
              reply: t('conn_claude_apps_ex_ig_reply', 'Passport stamp photo is saved as an Instagram draft for tonight at 19:00. Open the calendar if you want to tweak the caption.'),
              tool: 'generateImageTool',
            }),
            sample({
              title: t('conn_ex_label_multi', 'Several channels'),
              body: t('conn_claude_apps_ex_multi', 'Draft the same passport stamp post to Instagram, X and LinkedIn Friday at 10'),
              reply: t('conn_claude_apps_ex_multi_reply', 'Passport stamp post is drafted to Instagram, X and LinkedIn for Friday at 10:00. Nothing publishes until you say so.'),
              tool: 'integrationSchedulePostTool',
            }),
          ],
          info: t(
            'conn_claude_apps_note',
            'Not listed at claude.com/connectors. Browse will not find PostQueen. Do not search the directory. A plain "url" in claude_desktop_config.json does not work. Customize → Connectors does not install Claude Code. Adding connectors from the mobile apps is in beta; the web and Desktop remain the main way to add one.'
          ),
          docs: [
            {
              label: t('conn_docs_claude_apps', 'Claude MCP setup'),
              href: `${DOCS}/mcp/clients/claude`,
            },
          ],
          steps: [
            {
              title: t(
                'conn_claude_apps_step_desktop',
                'Paste the MCP URL'
              ),
              detail: t(
                'conn_claude_apps_step_desktop_detail',
                'Do not browse Connectors looking for PostQueen. Customize → Connectors → + → Add custom connector (Claude Desktop may still say Settings → Connectors). Name it PostQueen and paste the MCP URL (key in the path). Leave OAuth / Advanced empty; the key in the URL is the auth. On Team/Enterprise an Owner adds it under Organization settings → Connectors → Add → Custom → Web, then members click Connect. For LAN or VPN, skip that dialog: Desktop → Developer → Edit Config and mcp-remote instead.'
              ),
              code: mcpUrlWithKey,
            },
            {
              title: t(
                'conn_claude_apps_step_web',
                'Enable it in a chat'
              ),
              detail: t(
                'conn_claude_apps_step_web_detail',
                'In a conversation, open + → Connectors and turn PostQueen on. One add follows the account, so Desktop, claude.ai and iOS/Android pick it up after you add it once. Adding connectors from the mobile apps is in beta, so the web or Desktop is the surer place to add it.'
              ),
            },
            {
              title: t('conn_step_verify', 'Check it worked'),
              detail: t(
                'conn_claude_apps_verify',
                'Start a new conversation and ask Claude to list your connected social media accounts.'
              ),
            },
          ],
        },
        {
          id: 'chatgpt',
          name: 'ChatGPT',
          glyph: 'G',
          icon: '/icons/connections/chatgpt.svg',
          kind: 'MCP',
          method: 'MCP',
          cred: 'mcp',
          exampleKind: 'chat',
          section: 'featured',
          short: t('conn_chatgpt_short', 'Schedule posts from ChatGPT on the web'),
          intro: t(
            'conn_chatgpt_intro',
            'ChatGPT reaches PostQueen over MCP in Developer mode. She is not in the ChatGPT app store or GPT store. Turn on Developer mode, then create your own plugin at chatgpt.com/plugins and paste the MCP URL; do not search the directory. In July 2026 OpenAI replaced the App Directory with the Plugin Directory, so older guides and some accounts still say Apps. Web only, not the Free plan, not the mobile apps. Codex is a different product, use that card under Agents.'
          ),
          examples: [
            sample({
              title: t('conn_ex_label_ig', 'One channel: Instagram'),
              body: t('conn_chatgpt_ex', 'Generate a photo of a phone with an eSIM QR on screen and draft it to Instagram tonight at 7'),
              reply: t('conn_chatgpt_ex_reply', 'eSIM QR photo is drafted to Instagram for tonight at 19:00. Have a look before it goes out.'),
              tool: 'generateImageTool',
            }),
            sample({
              title: t('conn_ex_label_x', 'One channel: X'),
              body: t('conn_chatgpt_ex_x', 'Create a video about three reasons to get an eSIM before you fly and queue it on X tomorrow at 8am as a draft'),
              reply: t('conn_chatgpt_ex_x_reply', 'Three reasons video is queued on X as a draft for tomorrow at 08:00. Check it once before it publishes.'),
              tool: 'generateVideoTool',
            }),
            sample({
              title: t('conn_ex_label_multi', 'Several channels'),
              body: t('conn_chatgpt_ex_multi', 'How did Instagram, X and LinkedIn do in the last 30 days?'),
              reply: t('conn_chatgpt_ex_multi_reply', 'Last 30 days: Instagram leads on comments, X on impressions, LinkedIn is quiet. The Japan launch post is in front.'),
              tool: 'analyticsSummaryTool',
            }),
          ],
          info: t(
            'conn_chatgpt_note',
            'She is not listed in the ChatGPT app store. Searching the Plugin Directory will not find PostQueen. OpenAI Help Center currently says full MCP write (schedule/publish) is for Business and Enterprise/Edu. Plus and Pro can usually connect, but write tools such as integrationSchedulePostTool may stay blocked. Authentication: No Authentication, the key is already in the URL. A ChatGPT plugin does not install Codex.'
          ),
          docs: [
            {
              label: t('conn_docs_chatgpt', 'ChatGPT guide'),
              href: `${DOCS}/agents/chatgpt`,
            },
          ],
          paths: [
            {
              label: t('conn_path_mcp', 'Connect via MCP'),
              href: `${DOCS}/mcp/clients/chatgpt`,
            },
          ],
          steps: [
            {
              title: t(
                'conn_chatgpt_step_devmode',
                'Turn on Developer mode'
              ),
              detail: t(
                'conn_chatgpt_step_devmode_detail',
                'ChatGPT on the web → Settings → Security and login → Developer mode. On Business, Enterprise and Edu an admin allows it first under Workspace settings → Permissions & Roles, and the switch may sit under Settings → Apps → Advanced settings. It is not available on the Free plan.'
              ),
            },
            {
              title: t('conn_chatgpt_step_plugin', 'Create the plugin'),
              detail: t(
                'conn_chatgpt_step_plugin_detail',
                'Do not search the app store. Go to chatgpt.com/plugins and press +. Name it PostQueen, paste the MCP URL under Connection, set Authentication to No Authentication, then create it. It is listed under Drafts. Enable it in a chat via + → Developer mode, then pick PostQueen.'
              ),
              code: mcpUrlWithKey,
            },
            {
              title: t('conn_step_verify', 'Check it worked'),
              detail: t(
                'conn_chatgpt_verify',
                'Ask ChatGPT to list your connected social media accounts.'
              ),
            },
          ],
        },
        {
          id: 'grok',
          name: 'Grok',
          glyph: 'Gk',
          icon: '/icons/connections/grok.svg',
          kind: 'MCP',
          method: 'MCP',
          cred: 'mcp',
          exampleKind: 'chat',
          section: 'featured',
          short: t('conn_grok_short', 'Paste the MCP URL on grok.com'),
          intro: t(
            'conn_grok_intro',
            'Grok can call a remote MCP server through a custom connector. PostQueen is not in xAI\'s connector catalog. Paste the MCP URL yourself at grok.com/connectors → New Connector → Custom. The server must be reachable over the public internet. Grok Bot and Grok Build are different products, use those cards.'
          ),
          examples: [
            sample({
              title: t('conn_ex_label_x', 'One channel: X'),
              body: t('conn_grok_ex', 'Put tonight\'s launch photo on X tomorrow at 8am as a draft'),
              reply: t('conn_grok_ex_reply', 'Tonight\'s launch photo is drafted to X for tomorrow at 08:00. Nothing publishes until you say so.'),
              tool: 'integrationSchedulePostTool',
            }),
            sample({
              title: t('conn_ex_label_ig', 'One channel: Instagram'),
              body: t('conn_grok_ex_ig', 'Generate a photo of a phone on a passport and draft it to Instagram tonight at 7, caption about landing with data'),
              reply: t('conn_grok_ex_ig_reply', 'Passport phone photo is an Instagram draft for tonight at 19:00. Take a look first.'),
              tool: 'generateImageTool',
            }),
            sample({
              title: t('conn_ex_label_multi', 'Several channels'),
              body: t('conn_grok_ex_multi', 'Queue this launch photo on Instagram, X and LinkedIn Friday at 10 as drafts'),
              reply: t('conn_grok_ex_multi_reply', 'Launch photo is queued as drafts on Instagram, X and LinkedIn for Friday at 10:00. Confirm when you are ready.'),
              tool: 'integrationSchedulePostTool',
            }),
          ],
          info: t(
            'conn_grok_note',
            'Searching the catalog will not find PostQueen. On Grok Business and Enterprise, an admin must add a custom MCP URL in console.x.ai (Other) first. grok.com/connectors does not install PostQueen on Grok Bot or Grok Build.'
          ),
          docs: [
            {
              label: t('conn_docs_grok', 'Grok MCP setup'),
              href: `${DOCS}/mcp/clients/grok`,
            },
          ],
          paths: [
            {
              label: t('conn_docs_grok_hub', 'Grok guide'),
              href: `${DOCS}/agents/grok`,
            },
          ],
          steps: [
            {
              title: t('conn_grok_step_open', 'Open Grok connectors'),
              detail: t(
                'conn_grok_step_open_detail',
                'Go to grok.com/connectors → New Connector → Custom. Do not pick a catalog connector; the next step is pasting the MCP URL.'
              ),
            },
            {
              title: t('conn_grok_step_url', 'Paste the MCP URL'),
              detail: t(
                'conn_grok_step_url_detail',
                'Enter the streamable HTTP URL with your API key in the path. Get the key from Connections → API Keys (workspace admins only). Leave extra auth empty unless you prefer a Bearer header instead.'
              ),
              code: mcpUrlWithKey,
            },
            {
              title: t('conn_step_verify', 'Check it worked'),
              detail: t(
                'conn_grok_verify',
                'In a Grok chat, ask it to list your connected social media accounts.'
              ),
            },
          ],
        },
        {
          id: 'grok-bot',
          name: t('conn_grok_bot_name', 'Grok Bot'),
          glyph: 'GB',
          icon: '/icons/connections/grok-bot.svg',
          kind: 'MCP',
          method: 'MCP',
          cred: 'mcp',
          exampleKind: 'chat',
          section: 'bots',
          short: t('conn_grok_bot_short', 'Ask Grok Bot in chat to connect PostQueen'),
          intro: t(
            'conn_grok_bot_intro',
            'Grok Bot is xAI\'s cloud agent app, not grok.com chat and not Grok Build. It does not read grok.com/connectors, Cursor mcp.json or ~/.grok/config.toml. Ask the Bot in chat to connect PostQueen as an MCP server, and give it your API key through its secure prompt. The URL must be public HTTPS, localhost and stdio do not work.'
          ),
          examples: [
            sample({
              title: t('conn_ex_label_x', 'One channel: X'),
              body: t('conn_grok_bot_ex', 'Draft this photo to X for tomorrow 8am, caption about the waitlist opening'),
              reply: t('conn_grok_bot_ex_reply', 'Waitlist photo is drafted to X for tomorrow at 08:00. I will wait for you here before it goes out.'),
              tool: 'integrationSchedulePostTool',
            }),
            sample({
              title: t('conn_ex_label_ig', 'One channel: Instagram'),
              body: t('conn_grok_bot_ex_ig', 'Draft this picture to Instagram tonight at 7, caption for the waitlist'),
              reply: t('conn_grok_bot_ex_ig_reply', 'Waitlist picture is an Instagram draft for tonight at 19:00. Reply in this chat if you want a change.'),
              tool: 'integrationSchedulePostTool',
            }),
            sample({
              title: t('conn_ex_label_multi', 'Several channels'),
              body: t('conn_grok_bot_ex_multi', 'Post this picture to Instagram, X and LinkedIn Friday at 10 as drafts, waitlist caption on each'),
              reply: t('conn_grok_bot_ex_multi_reply', 'Waitlist picture is drafted to Instagram, X and LinkedIn for Friday at 10:00. Confirm here before they publish.'),
              tool: 'integrationSchedulePostTool',
            }),
          ],
          info: t(
            'conn_grok_bot_note',
            'PostQueen is not a Grok Bot marketplace plugin yet, so there is nothing to install from Marketplace. Servers you add from chat are managed under Plugins → Yours. Keep the API key out of the chat itself; the secure prompt keeps it out of the transcript. Teams inherit Cursor MCP allowlists. Same MCP server as Grok chat, different product.'
          ),
          docs: [
            {
              label: t('conn_docs_grok_bot', 'Grok Bot MCP setup'),
              href: `${DOCS}/mcp/clients/grok-bot`,
            },
          ],
          paths: [
            {
              label: t('conn_docs_grok_bot_guide', 'Grok Bot guide'),
              href: `${DOCS}/agents/grok-bot`,
            },
          ],
          steps: [
            {
              title: t('conn_grok_bot_step_ask', 'Ask the Bot to connect PostQueen'),
              detail: t(
                'conn_grok_bot_step_ask_detail',
                'Open Grok Bot in the desktop or mobile app. There is no grok.com/connectors form here. In a Bot chat, send this message. It uses the URL without your key.'
              ),
              code: `Connect PostQueen as an MCP server at ${mcpUrl}`,
            },
            {
              title: t('conn_grok_bot_step_url', 'Give it the key in the secure prompt'),
              detail: t(
                'conn_grok_bot_step_url_detail',
                'The Bot shows a secure card. Choose Connect and paste your API key into the secure prompt, never into the chat. Get the key from Connections → API Keys (workspace admins only). Tools show up on the next message.'
              ),
            },
            {
              title: t('conn_step_verify', 'Check it worked'),
              detail: t(
                'conn_grok_bot_verify',
                'In that Grok Bot chat, ask it to list your connected social media accounts. The server is also listed under Plugins → Yours.'
              ),
            },
          ],
        },
        {
          id: 'claude-cowork',
          name: t('conn_claude_cowork_name', 'Claude Cowork'),
          glyph: 'CW',
          icon: '/icons/connections/claude.svg',
          kind: 'MCP',
          method: 'MCP',
          cred: 'mcp',
          exampleKind: 'chat',
          section: 'bots',
          short: t(
            'conn_claude_cowork_short',
            'Hand Cowork a task that ends in a post'
          ),
          intro: t(
            'conn_claude_cowork_intro',
            'Claude Cowork is Anthropic\'s agent for everyday work in Claude Desktop, and in beta on claude.ai and the mobile apps. It uses the same custom connector as the Claude card: add the MCP URL once and Cowork can call PostQueen. Cowork is on the Pro, Max, Team and Enterprise plans, not Free. Claude Code is a different product, use that card under Agents.'
          ),
          examples: [
            sample({
              title: t('conn_ex_label_week', 'Check the calendar'),
              body: t('conn_claude_cowork_ex', 'Look at my PostQueen calendar for next week and tell me which days have nothing scheduled'),
              reply: t('conn_claude_cowork_ex_reply', 'Next week Monday and Thursday are empty. Instagram on Tuesday at 19:00 and X on Wednesday at 08:00 are already queued.'),
              tool: 'postsListTool',
            }),
            sample({
              title: t('conn_ex_label_ig', 'One channel: Instagram'),
              body: t('conn_claude_cowork_ex_ig', 'Generate a photo of a phone showing a boarding pass and draft it to Instagram tonight at 7, caption about travel days without SIM swaps'),
              reply: t('conn_claude_cowork_ex_ig_reply', 'Boarding pass photo is an Instagram draft for tonight at 19:00. Open the calendar if you want to change the caption.'),
              tool: 'generateImageTool',
            }),
            sample({
              title: t('conn_ex_label_multi', 'Several channels'),
              body: t('conn_claude_cowork_ex_multi', 'Turn this week\'s product update into drafts for Instagram, X and LinkedIn on Friday at 10'),
              reply: t('conn_claude_cowork_ex_multi_reply', 'The product update is drafted to Instagram, X and LinkedIn for Friday at 10:00. Nothing publishes until you confirm.'),
              tool: 'integrationSchedulePostTool',
            }),
          ],
          info: t(
            'conn_claude_cowork_note',
            'There is no separate Cowork install. If PostQueen is already a custom connector on your Claude account, Cowork can use it. On Team and Enterprise an Owner adds the connector for the organization first.'
          ),
          docs: [
            {
              label: t('conn_docs_claude_apps', 'Claude MCP setup'),
              href: `${DOCS}/mcp/clients/claude`,
            },
          ],
          steps: [
            {
              title: t('conn_claude_cowork_step_add', 'Add the custom connector'),
              detail: t(
                'conn_claude_cowork_step_add_detail',
                'Skip this if the Claude card is already set up. On claude.ai or Claude Desktop: Customize → Connectors → + → Add custom connector. Name it PostQueen and paste the MCP URL (key in the path). Leave the advanced OAuth fields empty.'
              ),
              code: mcpUrlWithKey,
            },
            {
              title: t('conn_claude_cowork_step_use', 'Use it in a Cowork task'),
              detail: t(
                'conn_claude_cowork_step_use_detail',
                'Start a Cowork task and make sure PostQueen is turned on in its connectors. On Pro and Max, Cowork is gradually becoming part of the regular Claude chat, so you may not see a separate Cowork option.'
              ),
            },
            {
              title: t('conn_step_verify', 'Check it worked'),
              detail: t(
                'conn_claude_cowork_verify',
                'Ask Cowork to list your connected social media accounts.'
              ),
            },
          ],
        },
        {
          id: 'cursor',
          name: 'Cursor',
          glyph: 'Cu',
          icon: '/icons/connections/cursor.svg',
          kind: 'MCP',
          method: 'MCP',
          cred: 'mcp',
          exampleKind: 'agent',
          section: 'agents',
          short: t('conn_cursor_short', 'Schedule from Cursor in the editor'),
          intro: t(
            'conn_cursor_intro',
            'Cursor reads MCP servers from mcp.json. PostQueen is not in the Cursor Marketplace, so do not browse Customize → MCPs looking for her. Add a remote streamable HTTP server with a url field (Cursor infers the transport), or open Cursor Settings → Tools & MCP (older builds: Tools & Integrations → MCP) and paste the JSON; all write the same file.'
          ),
          examples: [
            sample({
              title: t('conn_ex_label_ig', 'One channel: Instagram'),
              body: t('conn_cursor_ex', 'Generate a photo for the waitlist opening and schedule it to Instagram tonight at 7'),
              reply: t('conn_cursor_ex_reply', 'Waitlist photo is scheduled to Instagram for tonight at 19:00 as a draft. Check the calendar before it publishes.'),
              tool: 'generateImageTool',
            }),
            sample({
              title: t('conn_ex_label_x', 'One channel: X'),
              body: t('conn_cursor_ex_x', 'Create a video about how the waitlist works in four steps and queue it on X tomorrow at 8am as a draft'),
              reply: t('conn_cursor_ex_x_reply', 'Waitlist steps video is queued on X as a draft for tomorrow at 08:00. Have a look first.'),
              tool: 'generateVideoTool',
            }),
            sample({
              title: t('conn_ex_label_multi', 'Several channels'),
              body: t('conn_cursor_ex_multi', 'Which of my Instagram, X and LinkedIn posts got the most comments in the last 30 days?'),
              reply: t('conn_cursor_ex_multi_reply', 'Most comments in the last 30 days: the Japan launch on Instagram, then the waitlist post on X. LinkedIn is behind.'),
              tool: 'analyticsPostsTool',
            }),
          ],
          docs: [
            {
              label: t('conn_docs_cursor', 'Cursor guide'),
              href: `${DOCS}/agents/cursor`,
            },
          ],
          paths: [
            {
              label: t('conn_path_mcp', 'Connect via MCP'),
              href: `${DOCS}/mcp/clients/cursor`,
            },
            {
              label: t('conn_path_cli', 'Drive via CLI'),
              href: `${DOCS}/cli/introduction`,
            },
          ],
          steps: [
            {
              title: t('conn_cursor_step_ui', 'Add the server'),
              detail: t(
                'conn_cursor_step_ui_detail',
                'Do not search the Cursor Marketplace. Cursor Settings → Tools & MCP (older builds: Tools & Integrations → MCP), then add a streamable HTTP server named postqueen. Or create ~/.cursor/mcp.json (global) or .cursor/mcp.json (this project).'
              ),
            },
            {
              title: t('conn_cursor_step_url', 'Paste this JSON'),
              detail: t(
                'conn_cursor_step_url_detail',
                'url is correct for Cursor. Do not put this block in Claude Desktop\'s config, that client does not accept a plain url field.'
              ),
              code: JSON.stringify(
                { mcpServers: { postqueen: { url: mcpUrlWithKey } } },
                null,
                2
              ),
            },
            {
              title: t('conn_step_verify', 'Check it worked'),
              detail: t(
                'conn_cursor_verify',
                'In agent mode, ask Cursor to list your connected channels.'
              ),
            },
          ],
        },
        {
          id: 'vscode',
          name: t('conn_vscode_name', 'VS Code'),
          glyph: 'VS',
          icon: '/icons/connections/vscode.svg',
          kind: 'MCP',
          method: 'MCP',
          cred: 'mcp',
          exampleKind: 'agent',
          section: 'editors',
          short: t(
            'conn_vscode_short',
            'Schedule from VS Code Copilot MCP'
          ),
          intro: t(
            'conn_vscode_intro',
            'VS Code Copilot reads MCP from mcp.json. The file uses a servers object and each remote entry needs type http. That is not Cursor\'s mcpServers url shape. Add it from the Command Palette (MCP: Add Server) or edit .vscode/mcp.json (this workspace) or the user mcp.json (MCP: Open User Configuration).'
          ),
          examples: [
            sample({
              title: t('conn_ex_label_x', 'One channel: X'),
              body: t('conn_vscode_ex', 'Draft this copy to X for 8am: waitlist is open, link in the next tweet'),
              reply: t('conn_vscode_ex_reply', 'Waitlist copy is drafted to X for 08:00. Confirm it on the calendar before it publishes.'),
              tool: 'integrationSchedulePostTool',
            }),
            sample({
              title: t('conn_ex_label_ig', 'One channel: Instagram'),
              body: t('conn_vscode_ex_ig', 'Save this product shot as an Instagram draft for tonight at 7, caption about the waitlist'),
              reply: t('conn_vscode_ex_ig_reply', 'Waitlist product shot is saved as an Instagram draft for tonight at 19:00. Peek at the calendar first.'),
              tool: 'integrationSchedulePostTool',
            }),
            sample({
              title: t('conn_ex_label_multi', 'Several channels'),
              body: t('conn_vscode_ex_multi', 'Schedule this campaign shot to Instagram, X and LinkedIn Friday at 10 as drafts'),
              reply: t('conn_vscode_ex_multi_reply', 'Campaign shot is drafted to Instagram, X and LinkedIn for Friday at 10:00. Confirm on the calendar when they look right.'),
              tool: 'integrationSchedulePostTool',
            }),
          ],
          info: t(
            'conn_vscode_note',
            'Do not paste a Cursor mcpServers block into VS Code. GitHub Copilot CLI is a different product (~/.copilot/mcp-config.json). This card is the VS Code editor.'
          ),
          docs: [
            {
              label: t('conn_docs_vscode', 'VS Code MCP setup'),
              href: `${DOCS}/mcp/clients/vscode`,
            },
          ],
          steps: [
            {
              title: t('conn_vscode_step_ui', 'Add the server'),
              detail: t(
                'conn_vscode_step_ui_detail',
                'Do not look for PostQueen in an extension marketplace. Command Palette → MCP: Add Server, pick HTTP, name it postqueen. Or create .vscode/mcp.json (this workspace) or run MCP: Open User Configuration for every workspace.'
              ),
            },
            {
              title: t('conn_vscode_step_json', 'Paste this JSON'),
              detail: t(
                'conn_vscode_step_json_detail',
                'The key is servers, not mcpServers. type must be http. Put the API key in the URL or in a headers Authorization Bearer. Get the key from Connections → API Keys (workspace admins only).'
              ),
              code: JSON.stringify(
                {
                  servers: {
                    postqueen: { type: 'http', url: mcpUrlWithKey },
                  },
                },
                null,
                2
              ),
            },
            {
              title: t('conn_step_verify', 'Check it worked'),
              detail: t(
                'conn_vscode_verify',
                'In Copilot Chat agent mode, ask it to list your connected channels.'
              ),
            },
          ],
        },
        {
          id: 'devin-desktop',
          name: 'Devin Desktop',
          glyph: 'Dv',
          kind: 'MCP',
          method: 'MCP',
          cred: 'mcp',
          exampleKind: 'agent',
          section: 'editors',
          short: t(
            'conn_devin_desktop_short',
            'Schedule from Devin Desktop'
          ),
          intro: t(
            'conn_devin_desktop_intro',
            'Devin Desktop is Cognition\'s code editor. Its agent, Devin Local, reads MCP servers from ~/.config/devin/mcp_config.json (Windows: %APPDATA%\\devin\\mcp_config.json), and a remote server needs only a url field. Add PostQueen with devin mcp add, or edit that file. That is not Cursor mcp.json.'
          ),
          examples: [
            sample({
              title: t('conn_ex_label_ig', 'One channel: Instagram'),
              body: t('conn_devin_desktop_ex', 'Generate a photo of a packing list next to a passport and save an Instagram draft for tonight at 7'),
              reply: t('conn_devin_desktop_ex_reply', 'Packing list photo is saved as an Instagram draft for tonight at 19:00. Open it on the calendar before it publishes.'),
              tool: 'generateImageTool',
            }),
            sample({
              title: t('conn_ex_label_x', 'One channel: X'),
              body: t('conn_devin_desktop_ex_x', 'Queue a draft on X tomorrow at 8am about packing wifi instead of a SIM tray'),
              reply: t('conn_devin_desktop_ex_x_reply', 'Packing wifi post is queued on X as a draft for tomorrow at 08:00. Confirm on the calendar first.'),
              tool: 'integrationSchedulePostTool',
            }),
            sample({
              title: t('conn_ex_label_multi', 'Several channels'),
              body: t('conn_devin_desktop_ex_multi', 'Post this packing photo to Instagram, X and LinkedIn Friday at 10 as drafts'),
              reply: t('conn_devin_desktop_ex_multi_reply', 'Packing photo is drafted to Instagram, X and LinkedIn for Friday at 10:00. Confirm on the calendar when you are happy.'),
              tool: 'integrationSchedulePostTool',
            }),
          ],
          info: t(
            'conn_devin_desktop_note',
            'Devin Local asks before each tool call by default. Older Devin versions keep MCP servers in ~/.config/devin/config.json and move them to mcp_config.json on startup.'
          ),
          docs: [],
          paths: [
            {
              label: t('conn_path_mcp', 'Connect via MCP'),
              href: `${DOCS}/mcp/introduction`,
            },
          ],
          steps: [
            {
              title: t('conn_devin_desktop_step_ui', 'Add it from the terminal'),
              detail: t(
                'conn_devin_desktop_step_ui_detail',
                'PostQueen is not in the Devin Desktop marketplace. Run this once. -s user makes the server available in every project; without it, it is saved for the current project only. Get the key from Connections → API Keys (workspace admins only).'
              ),
              code: `devin mcp add -s user postqueen ${mcpUrlWithKey}`,
            },
            {
              title: t('conn_devin_desktop_step_json', 'Or paste this JSON'),
              detail: t(
                'conn_devin_desktop_step_json_detail',
                'Add this to ~/.config/devin/mcp_config.json (Windows: %APPDATA%\\devin\\mcp_config.json). A url is all a remote server needs; Devin Local infers streamable HTTP.'
              ),
              code: JSON.stringify(
                {
                  mcpServers: {
                    postqueen: { url: mcpUrlWithKey },
                  },
                },
                null,
                2
              ),
            },
            {
              title: t('conn_step_verify', 'Check it worked'),
              detail: t(
                'conn_devin_desktop_verify',
                'In a Devin Local session, ask it to list your connected channels.'
              ),
            },
          ],
        },
        {
          id: 'zed',
          name: 'Zed',
          glyph: 'Zd',
          icon: '/icons/connections/zed.svg',
          kind: 'MCP',
          method: 'MCP',
          cred: 'mcp',
          exampleKind: 'agent',
          section: 'editors',
          short: t('conn_zed_short', 'Zed editor remote MCP from JSON'),
          intro: t(
            'conn_zed_intro',
            'Zed is an editor with an Agent Panel. It stores remote MCP servers under context_servers, not mcpServers. Add PostQueen from Settings → AI → MCP Servers, or edit the settings file.'
          ),
          examples: [
            sample({
              title: t('conn_ex_label_week', 'Check the calendar'),
              body: t('conn_zed_ex', 'What is already queued between Monday and Friday?'),
              reply: t('conn_zed_ex_reply', 'This week: Instagram Tuesday at 19:00 and X Wednesday at 08:00. Want a change?'),
              tool: 'postsListTool',
            }),
            sample({
              title: t('conn_ex_label_ig', 'One channel: Instagram'),
              body: t('conn_zed_ex_ig', 'Generate a photo of a suitcase and a phone and draft it to Instagram tonight at 7, caption about packing light'),
              reply: t('conn_zed_ex_ig_reply', 'Packing light photo is drafted to Instagram for tonight at 19:00. Open it on the calendar first.'),
              tool: 'generateImageTool',
            }),
            sample({
              title: t('conn_ex_label_multi', 'Several channels'),
              body: t('conn_zed_ex_multi', 'Queue the same packing post on Instagram, X and LinkedIn Friday at 10 as drafts'),
              reply: t('conn_zed_ex_multi_reply', 'Packing post is drafted to Instagram, X and LinkedIn for Friday at 10:00. Confirm on the calendar.'),
              tool: 'integrationSchedulePostTool',
            }),
          ],
          info: t(
            'conn_zed_note',
            'Zed starts its OAuth sign-in only when a server answers 401. The MCP URL with your key in the path answers normally, so it connects without the header and no OAuth prompt appears. The bare /mcp URL needs the Authorization header, or Zed gets a 401 and tries OAuth, which PostQueen does not offer on that address.'
          ),
          docs: [
            {
              label: t('conn_docs_zed', 'Zed MCP setup'),
              href: `${DOCS}/mcp/clients/zed`,
            },
          ],
          steps: [
            {
              title: t('conn_zed_step_ui', 'Add a remote server'),
              detail: t(
                'conn_zed_step_ui_detail',
                'Settings → AI → MCP Servers → Add Server → Add Remote Server. Name it postqueen. Or edit the settings file (zed: open settings file).'
              ),
            },
            {
              title: t('conn_zed_step_json', 'Paste this JSON'),
              detail: t(
                'conn_zed_step_json_detail',
                'The key is context_servers. This form sends the key in an Authorization header on the bare /mcp URL. A url with the key in the path also works on its own, without headers. Get the key from Connections → API Keys (workspace admins only).'
              ),
              code: JSON.stringify(
                {
                  context_servers: {
                    postqueen: {
                      url: mcpUrl,
                      headers: { Authorization: `Bearer ${apiKey}` },
                    },
                  },
                },
                null,
                2
              ),
            },
            {
              title: t('conn_step_verify', 'Check it worked'),
              detail: t(
                'conn_zed_verify',
                'In the Agent Panel, ask Zed to list your connected channels. A green indicator on the postqueen server means it is active.'
              ),
            },
          ],
        },
        {
          id: 'gemini',
          name: 'Gemini CLI',
          glyph: 'Gm',
          icon: '/icons/connections/gemini-cli.svg',
          kind: 'MCP',
          method: 'MCP',
          cred: 'mcp',
          exampleKind: 'cli',
          section: 'agents',
          short: t('conn_gemini_short', 'Gemini CLI talks over streamable HTTP'),
          intro: t(
            'conn_gemini_intro',
            'Gemini CLI reads MCP servers from ~/.gemini/settings.json. A remote server uses url with type "http", which is what gemini mcp add --transport http writes. The older httpUrl key still works but is deprecated. This is the terminal CLI, not gemini.google.com.'
          ),
          examples: [
            sample({
              title: t('conn_ex_label_week', 'Check the calendar'),
              body: t('conn_gemini_ex', 'Show me everything queued through Sunday'),
              reply: t('conn_gemini_ex_reply', 'Through Sunday: Instagram Tuesday at 19:00 and X Wednesday at 08:00.'),
              code: 'gemini', tool: 'postsListTool',
            }),
            sample({
              title: t('conn_ex_label_ig', 'One channel: Instagram'),
              body: t('conn_gemini_ex_ig', 'Generate a photo of a phone on airplane mode over a map and draft it to Instagram tonight at 7'),
              reply: t('conn_gemini_ex_ig_reply', 'Airplane mode photo is drafted to Instagram for tonight at 19:00. Check the calendar before it goes out.'),
              code: 'gemini', tool: 'generateImageTool',
            }),
            sample({
              title: t('conn_ex_label_multi', 'Several channels'),
              body: t('conn_gemini_ex_multi', 'Schedule the airplane mode post to Instagram, X and LinkedIn Friday at 10 as drafts'),
              reply: t('conn_gemini_ex_multi_reply', 'Airplane mode post is drafted to Instagram, X and LinkedIn for Friday at 10:00. Confirm when the set looks right.'),
              code: 'gemini', tool: 'integrationSchedulePostTool',
            }),
          ],
          info: t(
            'conn_gemini_note',
            'This settings.json does not appear in gemini.google.com. Google Connected Apps / Spark is a separate product with its own eligibility, do not expect the phone apps to pick up Gemini CLI.'
          ),
          docs: [
            {
              label: t('conn_docs_gemini', 'Gemini CLI guide'),
              href: `${DOCS}/agents/gemini-cli`,
            },
          ],
          paths: [
            {
              label: t('conn_path_mcp', 'Connect via MCP'),
              href: `${DOCS}/mcp/clients/gemini-cli`,
            },
          ],
          steps: [
            {
              title: t('conn_gemini_step_cli', 'Add it from the CLI'),
              detail: t(
                'conn_gemini_step_cli_detail',
                'Prefer this over hand-editing JSON. Pass --scope user so it is not written into a project file you might commit.'
              ),
              code: `gemini mcp add --transport http --scope user postqueen ${mcpUrlWithKey}`,
            },
            {
              title: t('conn_gemini_step_config', 'Or edit settings.json'),
              detail: t(
                'conn_gemini_step_config_detail',
                'Add this to ~/.gemini/settings.json. Use url with type "http". An existing entry that uses httpUrl keeps working, but that key is deprecated.'
              ),
              code: JSON.stringify(
                { mcpServers: { postqueen: { url: mcpUrlWithKey, type: 'http' } } },
                null,
                2
              ),
            },
            {
              title: t('conn_step_verify', 'Check it worked'),
              detail: t(
                'conn_gemini_verify',
                'Start Gemini CLI and run the slash command /mcp. postqueen should show as connected with 21 tools. Then ask it to list your connected social media accounts.'
              ),
              code: '/mcp',
            },
          ],
        },
        {
          id: 'perplexity-computer',
          name: 'Perplexity Computer',
          glyph: 'Px',
          kind: 'MCP',
          method: 'MCP',
          cred: 'mcp',
          exampleKind: 'chat',
          section: 'bots',
          short: t(
            'conn_perplexity_short',
            'Hand Perplexity Computer a task that ends in a post'
          ),
          intro: t(
            'conn_perplexity_intro',
            'Perplexity Computer is Perplexity\'s agent that carries out multi-step tasks in a cloud sandbox with a browser, files and your connected tools. Add PostQueen as a custom remote connector with the MCP URL, and Computer can call her. It is on the Pro, Max, Education Pro, Enterprise Pro and Enterprise Max plans, not Free. Perplexity search is a different product.'
          ),
          examples: [
            sample({
              title: t('conn_ex_label_week', 'Check the calendar'),
              body: t('conn_perplexity_ex', 'Check my PostQueen queue for next week and list the days with no posts'),
              reply: t('conn_perplexity_ex_reply', 'Next week Monday and Friday have no posts. Instagram on Tuesday at 19:00 and X on Wednesday at 08:00 are already queued.'),
              tool: 'postsListTool',
            }),
            sample({
              title: t('conn_ex_label_ig', 'One channel: Instagram'),
              body: t('conn_perplexity_ex_ig', 'Generate a photo of a SIM tray next to a passport and draft it to Instagram tonight at 7, caption with three eSIM tips'),
              reply: t('conn_perplexity_ex_ig_reply', 'SIM tray photo is an Instagram draft for tonight at 19:00 with the three tips. Open the calendar if you want to trim the caption.'),
              tool: 'generateImageTool',
            }),
            sample({
              title: t('conn_ex_label_multi', 'Several channels'),
              body: t('conn_perplexity_ex_multi', 'Find last month\'s best post and draft a follow up to Instagram, X and LinkedIn for Friday at 10'),
              reply: t('conn_perplexity_ex_multi_reply', 'The Japan launch did best. A follow up is drafted to Instagram, X and LinkedIn for Friday at 10:00. Nothing publishes until you confirm.'),
              tool: 'analyticsPostsTool',
            }),
          ],
          info: t(
            'conn_perplexity_note',
            'From Perplexity\'s docs, not tested by PostQueen yet. Add it under Account settings → Connectors, not Settings → MCP servers, which is for servers on your own device. Use the MCP URL with the key; PostQueen\'s sign-in address is not supported with Perplexity yet. On Enterprise, an admin first allows members to add custom connectors under Enterprise settings → Permissions.'
          ),
          docs: [],
          paths: [
            {
              label: t('conn_path_mcp', 'Connect via MCP'),
              href: `${DOCS}/mcp/introduction`,
            },
          ],
          steps: [
            {
              title: t('conn_perplexity_step_open', 'Open Perplexity connectors'),
              detail: t(
                'conn_perplexity_step_open_detail',
                'In Perplexity on the web, open Account settings → Connectors, click + Custom connector and choose Remote.'
              ),
            },
            {
              title: t('conn_perplexity_step_url', 'Paste the MCP URL'),
              detail: t(
                'conn_perplexity_step_url_detail',
                'Name it PostQueen and paste this as the MCP Server URL. Set Authentication to None, because the key is already in the URL, and Transport to Streamable HTTP. Get the key from Connections → API Keys (workspace admins only). Tick the acknowledgement box, click Add, then click the PostQueen card to enable it.'
              ),
              code: mcpUrlWithKey,
            },
            {
              title: t('conn_step_verify', 'Check it worked'),
              detail: t(
                'conn_perplexity_verify',
                'In Computer, check that PostQueen is on under Connectors, then ask it to list your connected channels.'
              ),
            },
          ],
        },
        {
          id: 'nanoclaw',
          name: 'NanoClaw',
          glyph: 'NC',
          kind: 'MCP',
          method: 'MCP',
          cred: 'mcp',
          exampleKind: 'bot',
          section: 'bots',
          short: t('conn_nanoclaw_short', 'An assistant you host, each agent in its own container'),
          intro: t(
            'conn_nanoclaw_intro',
            'NanoClaw is an open-source assistant that runs each agent in its own Docker container on your machine. You talk to it from Slack, Telegram, Discord, WhatsApp and other chat apps. Add PostQueen as an MCP server and keep the key in NanoClaw\'s OneCLI vault, so the agent never sees it. NanoClaw is not OpenClaw; each has its own setup.'
          ),
          examples: [
            sample({
              title: t('conn_ex_label_ig', 'One channel: Instagram'),
              body: t('conn_nanoclaw_ex', 'Draft this photo to Instagram tonight at 7, caption about the new Japan eSIM plans'),
              reply: t('conn_nanoclaw_ex_reply', 'Japan eSIM photo is an Instagram draft for tonight at 19:00. Reply here when it should go live.'),
              tool: 'integrationSchedulePostTool',
            }),
            sample({
              title: t('conn_ex_label_x', 'One channel: X'),
              body: t('conn_nanoclaw_ex_x', 'Queue this clip on X tomorrow at 8am as a draft, copy about roaming without a SIM swap'),
              reply: t('conn_nanoclaw_ex_x_reply', 'Roaming clip is drafted to X for tomorrow at 08:00. I will wait for your yes in this chat.'),
              tool: 'integrationSchedulePostTool',
            }),
            sample({
              title: t('conn_ex_label_multi', 'Several channels'),
              body: t('conn_nanoclaw_ex_multi', 'Send this photo to Instagram, X and LinkedIn on Friday at 10 as drafts, caption for the spring sale'),
              reply: t('conn_nanoclaw_ex_multi_reply', 'Spring sale photo is drafted to Instagram, X and LinkedIn for Friday at 10:00. Confirm here before they publish.'),
              tool: 'integrationSchedulePostTool',
            }),
          ],
          info: t(
            'conn_nanoclaw_note',
            'From NanoClaw\'s docs, not tested by PostQueen yet. Use the MCP server: the postqueen CLI and skill do not work inside NanoClaw\'s containers. NanoClaw has no sign-in flow for MCP servers, so use the API key, and keep it in the vault rather than in the URL.'
          ),
          docs: [],
          paths: [
            {
              label: t('conn_path_mcp', 'Connect via MCP'),
              href: `${DOCS}/mcp/introduction`,
            },
          ],
          steps: [
            {
              title: t('conn_nanoclaw_step_vault', 'Save the key in the OneCLI vault'),
              detail: t(
                'conn_nanoclaw_step_vault_detail',
                'On the machine that runs NanoClaw. The vault adds the key to the agent\'s requests to PostQueen. Get the key from Connections → API Keys (workspace admins only).'
              ),
              code: `onecli secrets create --name PostQueen --type generic --value "${apiKey}" --host-pattern ${apiHost(backendUrl)} --header-name Authorization --value-format "Bearer {value}"`,
            },
            {
              title: t('conn_nanoclaw_step_group', 'Add PostQueen to your agent group'),
              detail: t(
                'conn_nanoclaw_step_group_detail',
                'Find the group id with ncl groups list, then add the server on the bare /mcp URL and restart the group. The vault supplies the key.'
              ),
              code: `ncl groups config add-mcp-server --id YOUR_GROUP_ID --name postqueen --url ${mcpUrl}
ncl groups restart --id YOUR_GROUP_ID`,
            },
            {
              title: t('conn_step_verify', 'Check it worked'),
              detail: t(
                'conn_nanoclaw_verify',
                'Message the agent and ask it to list your connected channels.'
              ),
            },
          ],
        },
        {
          id: 'paperclip',
          name: 'Paperclip',
          glyph: 'Pc',
          kind: 'MCP',
          method: 'MCP',
          cred: 'mcp',
          exampleKind: 'agent',
          section: 'bots',
          short: t('conn_paperclip_short', 'Give your agent company a social media desk'),
          intro: t(
            'conn_paperclip_intro',
            'Paperclip is an open-source app for running a team of AI agents as a company: you set goals, hire agents, set budgets and approve their work from one dashboard. Connect PostQueen once under Apps and its Claude Code and Codex agents can use her tools.'
          ),
          examples: [
            sample({
              title: t('conn_ex_label_week', 'Check the calendar'),
              body: t('conn_paperclip_ex', 'List everything scheduled on PostQueen this week and flag the empty days'),
              reply: t('conn_paperclip_ex_reply', 'This week: Instagram Tuesday at 19:00 and X Wednesday at 08:00. Monday, Thursday and Friday are empty.'),
              tool: 'postsListTool',
            }),
            sample({
              title: t('conn_ex_label_x', 'One channel: X'),
              body: t('conn_paperclip_ex_x', 'Draft an X post for tomorrow at 8am announcing the Korea eSIM, under 280 characters'),
              reply: t('conn_paperclip_ex_x_reply', 'Korea eSIM post is drafted to X for tomorrow at 08:00. It waits for your approval before it is scheduled.'),
              tool: 'integrationSchedulePostTool',
            }),
            sample({
              title: t('conn_ex_label_multi', 'Several channels'),
              body: t('conn_paperclip_ex_multi', 'Turn Friday\'s product update into drafts for Instagram, X and LinkedIn at 10'),
              reply: t('conn_paperclip_ex_multi_reply', 'The product update is drafted to Instagram, X and LinkedIn for Friday at 10:00. Approve them when you are ready.'),
              tool: 'integrationSchedulePostTool',
            }),
          ],
          info: t(
            'conn_paperclip_note',
            'From Paperclip\'s docs, not tested by PostQueen yet. PostQueen\'s tools reach Paperclip\'s Claude Code and Codex agents; other agent types use their own MCP settings. There is no paperclipai command for MCP connections yet, so use the Apps page.'
          ),
          docs: [],
          paths: [
            {
              label: t('conn_path_mcp', 'Connect via MCP'),
              href: `${DOCS}/mcp/introduction`,
            },
          ],
          steps: [
            {
              title: t('conn_paperclip_step_add', 'Connect your own MCP server'),
              detail: t(
                'conn_paperclip_step_add_detail',
                'In Paperclip, open Apps → Connect an app → Connect your own MCP server. Enter this URL and press Check link.'
              ),
              code: mcpUrl,
            },
            {
              title: t('conn_paperclip_step_key', 'Give it the key'),
              detail: t(
                'conn_paperclip_step_key_detail',
                'Under Advanced authentication choose Key or token and paste the key on its own, without the word Bearer. Get the key from Connections → API Keys (workspace admins only).'
              ),
              code: apiKey,
            },
            {
              title: t('conn_paperclip_step_tools', 'Choose tools and who can use them'),
              detail: t(
                'conn_paperclip_step_tools_detail',
                'Reading tools start on. Tools that change something, such as scheduling a post, start off until you turn them on, and then ask for approval by default. Give an agent, a project or the whole company access to PostQueen.'
              ),
            },
            {
              title: t('conn_step_verify', 'Check it worked'),
              detail: t(
                'conn_paperclip_verify',
                'Assign an agent a task such as listing your connected channels.'
              ),
            },
            signInStep(
              t(
                'conn_paperclip_step_sign_in_detail',
                'Enter this address instead, choose Sign in to continue and approve as a PostQueen workspace admin. Not tested by PostQueen yet.'
              )
            ),
          ],
        },
        {
          id: 'muse',
          name: 'Muse',
          glyph: 'Mu',
          icon: '/icons/connections/muse.svg',
          kind: 'MCP',
          method: 'MCP',
          cred: 'none',
          exampleKind: 'chat',
          section: 'bots',
          short: t('conn_muse_short', 'Meta\'s personal agent. Not tested yet'),
          intro: t(
            'conn_muse_intro',
            'Muse is Meta\'s personal agent in the Muse app, on muse.ai and in WhatsApp. PostQueen cannot be added to it by URL yet. Meta documents asking Muse in chat to build a custom connector from a service\'s API information, not from an MCP address, and no PostQueen connector has been built that way yet, so this route is not tested by PostQueen yet. Muse Code is a separate product, Meta\'s coding agent, and it connects today: use that card under Agents.'
          ),
          info: t(
            'conn_muse_note',
            'Do not paste the MCP URL into Muse Settings → Connectors expecting it to work like Claude; that screen lists the connectors Meta has reviewed. If you try the chat route, enter your API key only in the secure prompt Muse shows, never in the chat.'
          ),
          docs: [
            {
              label: t('conn_docs_muse', 'Muse guide'),
              href: `${DOCS}/agents/muse`,
            },
          ],
          steps: [
            {
              title: t('conn_muse_step_code', 'Use Muse Code today'),
              detail: t(
                'conn_muse_step_code_detail',
                'Open the Muse Code card under Agents and add PostQueen to ~/.config/muse/settings.json over streamable HTTP.'
              ),
            },
            {
              title: t('conn_muse_step_app', 'Muse app'),
              detail: t(
                'conn_muse_step_app_detail',
                'PostQueen is not in Muse\'s connector list. Muse builds custom connectors in chat from API information, not from an MCP server URL, and that route is not tested by PostQueen yet.'
              ),
            },
          ],
        },
      ],
    },
    {
      id: 'editors',
      label: t('conn_group_editors', 'Editors'),
      blurb: t(
        'conn_group_editors_blurb',
        'Code editors that speak MCP. VS Code, Devin Desktop and Zed.'
      ),
      items: [
        {
          id: 'other-mcp',
          name: t('conn_other_mcp_name', 'Any MCP client'),
          glyph: 'MCP',
          icon: '/icons/connections/mcp.svg',
          kind: 'MCP',
          method: 'MCP',
          cred: 'mcp',
          exampleKind: 'agent',
          section: 'featured',
          short: t('conn_other_mcp_short', 'Any other MCP client with the URL'),
          intro: t(
            'conn_other_mcp_intro',
            'PostQueen exposes 21 tools at a single streamable HTTP endpoint (20 tools plus the ask_postqueen agent). If your editor or agent can reach a remote MCP server, use the URL below (API key in the path or as a Bearer token). Get your key from Connections → API Keys (workspace admins only).'
          ),
          examples: [
            sample({
              title: t('conn_ex_label_week', 'Check the calendar'),
              body: t('conn_other_mcp_ex', 'List everything on the calendar for the next seven days'),
              reply: t('conn_other_mcp_ex_reply', 'Next seven days: Instagram Tuesday at 19:00 and X Wednesday at 08:00.'),
              tool: 'postsListTool',
            }),
            sample({
              title: t('conn_ex_label_ig', 'One channel: Instagram'),
              body: t('conn_other_mcp_ex_ig', 'Generate a photo of an eSIM QR on a phone lock screen and draft it to Instagram tonight at 7'),
              reply: t('conn_other_mcp_ex_ig_reply', 'eSIM QR photo is drafted to Instagram for tonight at 19:00. Open the calendar if you want a last look.'),
              tool: 'generateImageTool',
            }),
            sample({
              title: t('conn_ex_label_multi', 'Several channels'),
              body: t('conn_other_mcp_ex_multi', 'Draft that QR post to Instagram, X and LinkedIn Friday at 10'),
              reply: t('conn_other_mcp_ex_multi_reply', 'QR post is drafted to Instagram, X and LinkedIn for Friday at 10:00. Nothing goes out until you confirm.'),
              tool: 'integrationSchedulePostTool',
            }),
          ],
          note: t(
            'conn_other_mcp_note',
            'Use this generic shape for Cline, Continue, Goose, Warp, JetBrains AI Assistant, Raycast and GitHub Copilot CLI. VS Code, Devin Desktop and Zed have their own cards. Claude Desktop is the exception: do not paste a plain url into claude_desktop_config.json, and do not look for PostQueen in Anthropic\'s directory; use Add custom connector with the MCP URL, or mcp-remote for LAN.'
          ),
          docs: [
            {
              label: t('conn_docs_other_mcp', 'Other MCP clients'),
              href: `${DOCS}/mcp/clients/other-clients`,
            },
          ],
          steps: [
            {
              title: t('conn_other_mcp_step_url', 'Streamable HTTP URL'),
              code: mcpUrlWithKey,
            },
            {
              title: t('conn_other_mcp_step_bearer', 'Or Bearer auth'),
              detail: t(
                'conn_other_mcp_step_bearer_detail',
                'Some clients prefer a bare URL plus an Authorization header. MCP Bearer is fine here. The Public API is different: it wants the raw key with no Bearer prefix.'
              ),
              code: `${mcpUrl}\nAuthorization: Bearer ${apiKey}`,
            },
            signInStep(
              t(
                'conn_other_mcp_step_sign_in_detail',
                'For clients that sign in to MCP servers themselves. A workspace admin approves access. This address has 20 tools, all but ask_postqueen. Not tested by PostQueen yet.'
              )
            ),
          ],
        },
      ],
    },
    {
      id: 'automation',
      label: t('conn_group_automation', 'Automation'),
      blurb: t(
        'conn_group_automation_blurb',
        'n8n is live. Zapier and Make official apps are coming soon. All three open from the left rail, next to Webhooks and RSS AutoPost.'
      ),
      items: [
        {
          id: 'n8n',
          name: 'n8n',
          glyph: 'n8',
          icon: '/icons/connections/n8n.svg',
          kind: 'FLOW',
          method: 'HTTP',
          cred: 'api',
          exampleKind: 'workflow',
          section: 'automation',
          short: t('conn_n8n_short', 'Schedule posts from an n8n workflow'),
          intro: t(
            'conn_n8n_intro',
            'Use the community node to publish from an n8n flow, and PostQueen webhooks to trigger a flow when a post publishes. This is not a chat prompt, you drop nodes on a canvas.'
          ),
          examples: [
            {
              title: t('conn_n8n_ex_1_title', 'New photo → Instagram'),
              body: t(
                'conn_n8n_ex_1_body',
                'New photo in Google Drive → Upload File → Create Post on Instagram.'
              ),
            },
            {
              title: t('conn_n8n_ex_2_title', 'New video → X draft'),
              body: t(
                'conn_n8n_ex_2_body',
                'New video in a folder → Create Post as a draft on X.'
              ),
            },
            {
              title: t('conn_n8n_ex_3_title', 'PostQueen → n8n'),
              body: t(
                'conn_n8n_ex_3_body',
                'When a post publishes, PostQueen POSTs to your n8n webhook so a sheet can log it.'
              ),
            },
          ],
          info: t(
            'conn_n8n_note',
            'Self-hosted n8n needs the community node installed before the credential appears. n8n Cloud can install community nodes from Settings → Community Nodes. Node.js 20.15+.'
          ),
          docs: [
            {
              label: t('conn_docs_n8n', 'n8n guide'),
              href: `${DOCS}/automation/n8n`,
            },
          ],
          steps: [
            {
              title: t('conn_n8n_step_node', 'Install the node'),
              detail: t(
                'conn_n8n_step_node_detail',
                'n8n → Settings → Community Nodes → Install → n8n-nodes-postqueen.'
              ),
              code: 'n8n-nodes-postqueen',
            },
            {
              title: t('conn_n8n_step_cred', 'Add the credential'),
              detail: t(
                'conn_n8n_step_cred_detail',
                'Create a PostQueen API credential. Paste your key from Connections → API Keys (workspace admins only). The Public API wants the raw key, n8n handles the Authorization header for you.'
              ),
              code: apiKey,
            },
            ...(apiUrl
              ? [
                  {
                    title: t('conn_n8n_step_host', 'Set the Host'),
                    detail: t(
                      'conn_n8n_step_host_detail',
                      "In the same credential, replace the default Host with your server's API address."
                    ),
                    code: apiUrl,
                  },
                ]
              : []),
            {
              title: t(
                'conn_n8n_step_trigger',
                'Trigger flows from PostQueen'
              ),
              detail: t(
                'conn_n8n_step_trigger_detail',
                'Add your n8n webhook URL under Settings → Webhooks. PostQueen posts the published post to it.'
              ),
            },
          ],
        },
        {
          id: 'zapier',
          name: 'Zapier',
          glyph: 'Zp',
          icon: '/icons/connections/zapier.svg',
          kind: 'FLOW',
          method: 'HTTP',
          cred: 'api',
          exampleKind: 'workflow',
          section: 'automation',
          soon: true,
          short: t('conn_zapier_short', 'HTTP today. Official Zapier app soon'),
          intro: t(
            'conn_zapier_intro',
            'There is no PostQueen app in Zapier\'s directory yet. Until there is, Webhooks by Zapier talks to the Public API in both directions. That Zapier app is on Professional, Team and Enterprise, not the Free plan. Zaps you build now stay valid.'
          ),
          info: t(
            'conn_zapier_note',
            'Use Custom Request, not the plain POST event: the create-post body is nested JSON. Authorization is the raw API key, no Bearer prefix.'
          ),
          examples: [
            {
              title: t('conn_zapier_ex_1_title', 'New photo → Instagram'),
              body: t(
                'conn_zapier_ex_1_body',
                'When a new photo lands in Drive → Webhooks by Zapier POST /public/v1/posts to Instagram.'
              ),
            },
            {
              title: t('conn_zapier_ex_2_title', 'New video → X'),
              body: t(
                'conn_zapier_ex_2_body',
                'When a new video is ready → schedule it on X as a draft.'
              ),
            },
          ],
          docs: [
            {
              label: t('conn_docs_zapier', 'Zapier guide'),
              href: `${DOCS}/automation/zapier`,
            },
          ],
          steps: [
            {
              title: t('conn_zapier_step_out', 'PostQueen → Zapier'),
              detail: t(
                'conn_zapier_step_out_detail',
                'Create a Catch Hook trigger in Zapier, then paste its URL under Settings → Webhooks. Every published post arrives there.'
              ),
            },
            {
              title: t('conn_zapier_step_in', 'Zapier → PostQueen'),
              detail: t(
                'conn_zapier_step_in_detail',
                'Use the Webhooks by Zapier Custom Request action (not the plain POST event) with this URL. The create-post body is nested JSON.'
              ),
              code: `${backendUrl}/public/v1/posts`,
            },
            {
              title: t('conn_zapier_step_auth', 'Authenticate the request'),
              detail: t(
                'conn_zapier_step_auth_detail',
                'Add this header. No Bearer prefix, the Public API expects the raw key.'
              ),
              code: `Authorization: ${apiKey}`,
            },
          ],
        },
        {
          id: 'make',
          name: 'Make',
          glyph: 'Mk',
          icon: '/icons/connections/make.svg',
          kind: 'FLOW',
          method: 'HTTP',
          cred: 'api',
          exampleKind: 'http',
          section: 'automation',
          soon: true,
          short: t('conn_make_short', 'HTTP today. Official Make app soon'),
          intro: t(
            'conn_make_intro',
            "No PostQueen module on Make yet, coming soon on cloud. Make's HTTP and Webhooks modules cover the same ground today. Scenarios you build against the Public API stay valid when the native app lands."
          ),
          examples: [
            {
              title: t('conn_make_ex_1_title', 'New photo → Instagram'),
              body: t(
                'conn_make_ex_1_body',
                'New photo in a folder → HTTP Make a request → POST /public/v1/posts to Instagram.'
              ),
              code: `${backendUrl}/public/v1/posts`,
            },
            {
              title: t('conn_make_ex_2_title', 'Watch publishes'),
              body: t(
                'conn_make_ex_2_body',
                'Custom Webhook in Make, URL under Settings → Webhooks, then route the payload.'
              ),
            },
          ],
          docs: [
            {
              label: t('conn_docs_make', 'Make guide'),
              href: `${DOCS}/automation/make`,
            },
          ],
          steps: [
            {
              title: t('conn_make_step_in', 'Make → PostQueen'),
              detail: t(
                'conn_make_step_in_detail',
                'HTTP app → Make a request. Method POST. Body type Raw, content type JSON.'
              ),
              code: `${backendUrl}/public/v1/posts`,
            },
            {
              title: t('conn_make_step_auth', 'Authenticate the request'),
              detail: t(
                'conn_make_step_auth_detail',
                'Headers → Add item. Name Authorization. Value is your API key with no Bearer prefix. That trips people who have wired other APIs into Make.'
              ),
              code: `Authorization: ${apiKey}`,
            },
            {
              title: t('conn_make_step_out', 'PostQueen → Make'),
              detail: t(
                'conn_make_step_out_detail',
                'Add a Custom Webhook module, copy its URL and paste it under Settings → Webhooks.'
              ),
            },
          ],
        },
        {
          id: 'webhooks',
          name: t('conn_webhooks_name', 'Webhooks'),
          glyph: 'WH',
          kind: 'FLOW',
          method: 'HTTP',
          cred: 'none',
          exampleKind: 'http',
          section: 'automation',
          short: t('conn_webhooks_short', 'Get an HTTP call when a post goes live'),
          intro: t(
            'conn_webhooks_intro',
            'PostQueen POSTs the published post as JSON to any URL you register. A webhook can watch every channel or just the ones you pick.'
          ),
          examples: [
            {
              title: t('conn_webhooks_ex_title', 'Log publishes'),
              body: t(
                'conn_webhooks_ex_body',
                'Point a webhook at n8n, Make or your own endpoint. The body includes the post, the channel and a link to it.'
              ),
            },
          ],
          note: t(
            'conn_webhooks_note',
            'Requests are not signed, so treat the URL itself as the secret, give each destination its own, and do not act on a payload you cannot otherwise verify.'
          ),
          docs: [
            {
              label: t('conn_docs_webhooks', 'Webhooks guide'),
              href: `${DOCS}/automation/webhooks`,
            },
          ],
          steps: [
            {
              title: t('conn_webhooks_step_add', 'Add a URL'),
              detail: t(
                'conn_webhooks_step_add_detail',
                'Settings → Webhooks. Optionally limit it to certain channels.'
              ),
            },
            {
              title: t('conn_webhooks_step_receive', 'What arrives'),
              detail: t(
                'conn_webhooks_step_receive_detail',
                'A POST with the post, its channel and its release URL, once publishing succeeds.'
              ),
            },
          ],
        },
        {
          id: 'rss',
          name: t('conn_rss_name', 'RSS AutoPost'),
          glyph: 'RSS',
          kind: 'FLOW',
          method: 'HTTP',
          cred: 'none',
          exampleKind: 'workflow',
          section: 'automation',
          short: t('conn_rss_short', 'Turn RSS items into calendar drafts'),
          intro: t(
            'conn_rss_intro',
            'Configure feeds under Settings → Autopost. Each new item can become a draft on your calendar on an hourly check.'
          ),
          examples: [
            {
              title: t('conn_rss_ex_title', 'Blog → drafts'),
              body: t(
                'conn_rss_ex_body',
                'Paste your blog RSS URL, pick LinkedIn + X, leave items as drafts so you review before they go out.'
              ),
            },
          ],
          docs: [
            {
              label: t('conn_docs_rss', 'RSS AutoPost guide'),
              href: `${DOCS}/automation/rss-autopost`,
            },
          ],
          steps: [
            {
              title: t('conn_rss_step_open', 'Open Autopost'),
              detail: t(
                'conn_rss_step_open_detail',
                'Settings → Autopost → Add an autopost, then paste the feed URL.'
              ),
            },
            {
              title: t('conn_rss_step_channels', 'Pick channels and timing'),
              detail: t(
                'conn_rss_step_channels_detail',
                'Choose where new items land and whether they stay as drafts for review.'
              ),
            },
          ],
        },
      ],
    },
    {
      id: 'developer',
      label: t('conn_group_developer', 'Develop'),
      blurb: t(
        'conn_group_developer_blurb',
        'Public API, CLI, Node SDK and OAuth apps. Each has its own left-nav row.'
      ),
      items: [
        {
          id: 'cli',
          name: t('conn_cli_name', 'Command line'),
          glyph: 'CLI',
          kind: 'API',
          method: 'CLI',
          cred: 'env',
          exampleKind: 'cli',
          section: 'developer',
          short: t('conn_cli_short', 'Run postqueen commands in a shell'),
          intro: t(
            'conn_cli_intro',
            'The postqueen CLI is 17 commands for channels, posts, media uploads and analytics. Same Public API under the hood; most commands print one status line, then JSON. It does not generate video. The Agent Skill is a playbook and does not install this package.'
          ),
          info: t(
            'conn_cli_note',
            'Video generation lives on MCP (generateVideoTool) and the Public API (POST /generate-video). Analytics is here, on the API and on MCP. Over MCP she reports how published posts did: totals for 7, 30 or 90 days, top posts and one post. Channel numbers such as follower growth are here and on the API.'
          ),
          examples: [
            {
              title: t('conn_ex_label_week', 'Check the calendar'),
              body: t('conn_cli_ex_list', 'List connected channels'),
              code: 'postqueen integrations:list',
              reply: `[
  { "name": "Instagram", "identifier": "acme" },
  { "name": "X", "identifier": "acme" },
  { "name": "LinkedIn", "identifier": "acme" }
]`,
            },
            {
              title: t('conn_ex_label_ig', 'One channel: Instagram'),
              body: t(
                'conn_cli_ex_ig',
                'Schedule an Instagram photo as a draft'
              ),
              code: 'postqueen posts:create -c "Tonight\'s photo" -s "2026-08-01T19:00:00Z" -i <instagram-id> -t draft',
            },
            {
              title: t('conn_ex_label_multi', 'Several channels'),
              body: t('conn_cli_ex_create', 'Schedule the same photo on Instagram, X and LinkedIn'),
              code: 'postqueen posts:create -c "Tonight\'s photo" -s "2026-08-01T10:00:00Z" -i <instagram-id>,<x-id>,<linkedin-id> -t draft',
            },
          ],
          docs: [
            {
              label: t('conn_docs_cli', 'CLI introduction'),
              href: `${DOCS}/cli/introduction`,
            },
            {
              label: t('conn_docs_cli_auth', 'Authentication'),
              href: `${DOCS}/cli/authentication`,
            },
          ],
          steps: [
            {
              title: t('conn_cli_step_install', 'Install it'),
              detail: t(
                'conn_cli_step_install_detail',
                'Or `pnpm install -g postqueen`. Verify with `postqueen --help`.'
              ),
              code: 'npm install -g postqueen',
            },
            {
              title: t('conn_cli_step_login', 'Authenticate'),
              detail: t(
                'conn_cli_step_login_detail',
                'Copy the key from Connections → API Keys (workspace admins only), then export it. The CLI logs in with the API key only.'
              ),
              code: `export POSTQUEEN_API_KEY="${apiKey}"`,
            },
            ...apiUrlStep,
            {
              title: t('conn_cli_step_try', 'Try it'),
              detail: t(
                'conn_cli_step_try_detail',
                'First command that reaches the API, lists your connected channels as JSON.'
              ),
              code: 'postqueen integrations:list',
            },
          ],
        },
        {
          id: 'api',
          name: t('conn_api_name', 'Public API'),
          glyph: 'API',
          kind: 'API',
          method: 'API',
          cred: 'api',
          exampleKind: 'api',
          section: 'developer',
          short: t('conn_api_short', 'REST for channels, posts and media'),
          intro: t(
            'conn_api_intro',
            'REST at /public/v1. List channels, schedule and delete posts, upload media, generate video, read analytics. This is the widest surface: 22 key authenticated operations. Image generation is MCP only. The header is the raw key, no Bearer prefix.'
          ),
          info: t(
            'conn_api_note',
            'MCP Bearer headers are for /mcp. Here, Authorization is the raw key. pos_ OAuth tokens use the same raw header. Video: POST /generate-video. There is no image generation endpoint on this API.'
          ),
          examples: [
            {
              title: t('conn_api_ex_title', 'List channels'),
              body: t(
                'conn_api_ex_body',
                'Send the key in Authorization with no Bearer.'
              ),
              code: `curl -H "Authorization: ${apiKey}" ${backendUrl}/public/v1/integrations`,
            },
          ],
          docs: [
            {
              label: t('conn_docs_api', 'Public API overview'),
              href: `${DOCS}/public-api/introduction`,
            },
          ],
          steps: [
            {
              title: t('conn_api_step_base', 'Base URL'),
              code: `${backendUrl}/public/v1`,
            },
            {
              title: t('conn_api_step_auth', 'Authenticate'),
              detail: t(
                'conn_api_step_auth_detail',
                'Send your key in the Authorization header on every request. Do not prefix Bearer, that is for MCP, not this API.'
              ),
              code: `curl -H "Authorization: ${apiKey}" ${backendUrl}/public/v1/integrations`,
            },
            {
              title: t('conn_api_step_post', 'Schedule a post'),
              detail: t(
                'conn_api_step_post_detail',
                'POST to /posts with the channels and the content.'
              ),
              code: `${backendUrl}/public/v1/posts`,
            },
          ],
        },
        {
          id: 'sdk',
          name: t('conn_sdk_name', 'Node SDK'),
          glyph: 'JS',
          kind: 'API',
          method: 'API',
          cred: 'env',
          exampleKind: 'api',
          section: 'developer',
          short: t('conn_sdk_short', 'Typed Node client for the Public API'),
          intro: t(
            'conn_sdk_intro',
            'A thin wrapper over the public API with types for the request and response shapes.'
          ),
          examples: [
            {
              body: t('conn_sdk_ex', 'List channels, then schedule a photo post'),
              code: `import PostQueen from '@postqueen/node';

const pq = new PostQueen(process.env.POSTQUEEN_API_KEY);
const channels = await pq.integrations();
await pq.post({
  type: 'schedule',
  date: '2026-08-01T09:00:00Z',
  shortLink: false,
  tags: [],
  posts: [{ integration: { id: channels[0].id }, value: [{ content: 'We just shipped' }] }],
});`,
            },
          ],
          docs: [
            {
              label: t('conn_docs_sdk', 'Node.js SDK'),
              href: `${DOCS}/public-api/sdk`,
            },
          ],
          steps: [
            {
              title: t('conn_sdk_step_install', 'Install it'),
              code: 'npm install @postqueen/node',
            },
            {
              title: t('conn_sdk_step_key', 'Authenticate'),
              detail: t(
                'conn_sdk_step_key_detail',
                'Pass your API key when you construct the client. Get it from Connections → API Keys (workspace admins only).'
              ),
              code: `POSTQUEEN_API_KEY="${apiKey}"`,
            },
            ...(apiUrl
              ? [
                  {
                    title: t('conn_sdk_step_url', 'Point it at your server'),
                    detail: t(
                      'conn_sdk_step_url_detail',
                      'The client calls the hosted API by default. Set this, or pass the URL as the second argument: new PostQueen(key, url).'
                    ),
                    code: `POSTQUEEN_API_URL="${apiUrl}"`,
                  },
                ]
              : []),
          ],
        },
        {
          id: 'oauth',
          name: t('conn_oauth_name', 'OAuth apps'),
          glyph: 'OA',
          kind: 'API',
          method: 'API',
          cred: 'none',
          exampleKind: 'api',
          section: 'developer',
          short: t('conn_oauth_short', 'Let other apps post for your users'),
          intro: t(
            'conn_oauth_intro',
            'If you are building a product rather than automating your own account, register an OAuth app under OAuth Apps. Users approve access and you receive a pos_ token. That token works on the Public API (raw key header) and on MCP as a Bearer token on /mcp. The URL form /mcp/KEY only accepts API keys.'
          ),
          docs: [
            {
              label: t('conn_docs_oauth', 'OAuth2 authentication'),
              href: `${DOCS}/public-api/oauth`,
            },
          ],
          steps: [
            {
              title: t('conn_oauth_step_create', 'Create the app'),
              detail: t(
                'conn_oauth_step_create_detail',
                'Connections → Developers, or Settings → Developers. Set your redirect URL there. This is not where the workspace API key lives, that is API Keys.'
              ),
            },
            {
              title: t('conn_oauth_step_token', 'Use the token'),
              detail: t(
                'conn_oauth_step_token_detail',
                'Tokens are prefixed pos_ and go in the same Authorization header as an API key (raw, no Bearer) on the Public API. On MCP, send them as Authorization: Bearer pos_… on https://api.postqueen.ai/mcp. Do not put a pos_ token in the /mcp/KEY URL; that form only looks up API keys.'
              ),
            },
          ],
        },
      ],
    },
    {
      id: 'media',
      label: t('conn_group_media', 'Media'),
      blurb: t(
        'conn_group_media_blurb',
        'Third-party media services you already pay for, paste an API key and they show up in the media picker.'
      ),
      items: [
        {
          id: 'heygen',
          name: 'HeyGen',
          glyph: 'HG',
          icon: '/icons/third-party/heygen.png',
          kind: 'MEDIA',
          method: 'API',
          cred: 'none',
          exampleKind: 'workflow',
          section: 'media',
          short: t('conn_heygen_short', 'HeyGen avatars in the media picker'),
          intro: t(
            'conn_heygen_intro',
            'Paste your HeyGen API key under Integrations. The service appears in the post editor media row as Integrations once connected.'
          ),
          examples: [
            {
              body: t(
                'conn_heygen_ex',
                'Write the post, then generate an avatar clip from the media row'
              ),
            },
          ],
          docs: [
            {
              label: t('conn_docs_heygen', 'Third-party integrations'),
              href: `${DOCS}/using/third-party-integrations`,
            },
          ],
          steps: [
            {
              title: t('conn_media_step_open', 'Open Integrations'),
              detail: t(
                'conn_media_step_open_detail',
                'App menu → Integrations (below Plugs). Click the HeyGen card.'
              ),
            },
            {
              title: t('conn_media_step_key', 'Paste the API key'),
              detail: t(
                'conn_heygen_step_key_detail',
                'She checks GET https://api.heygen.com/v1/user/me before storing anything.'
              ),
            },
          ],
        },
        {
          id: 'reelfarm',
          name: 'Reel.Farm',
          glyph: 'RF',
          icon: '/icons/third-party/reelfarm.png',
          kind: 'MEDIA',
          method: 'API',
          cred: 'none',
          exampleKind: 'workflow',
          section: 'media',
          short: t('conn_reelfarm_short', 'Import ReelFarm clips to the library'),
          intro: t(
            'conn_reelfarm_intro',
            'Paste your Reel.Farm API key under Integrations. Import appears in the media library toolbar once connected.'
          ),
          examples: [
            {
              body: t(
                'conn_reelfarm_ex',
                'Import a finished Reel.Farm clip, then attach it to a scheduled post'
              ),
            },
          ],
          docs: [
            {
              label: t('conn_docs_reelfarm', 'Third-party integrations'),
              href: `${DOCS}/using/third-party-integrations`,
            },
          ],
          steps: [
            {
              title: t('conn_media_step_open', 'Open Integrations'),
              detail: t(
                'conn_reelfarm_step_open_detail',
                'App menu → Integrations. Click the Reel.Farm card and paste your key.'
              ),
            },
            {
              title: t('conn_reelfarm_step_import', 'Import into Media'),
              detail: t(
                'conn_reelfarm_step_import_detail',
                'On the Media page or Insert Media, use Import once the account is connected.'
              ),
            },
          ],
        },
      ],
    },
  ];
}
