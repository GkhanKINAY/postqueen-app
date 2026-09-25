/**
 * Static Connections catalog, docs-backed, not an API.
 *
 * Publishing channels live on Channels / Add Channel. This catalog covers the
 * assistants and bots, coding agents, editors and other MCP apps, automations
 * and developer tools the Connect panel shows, plus the chat front doors and
 * third-party media that only deep links open. Code samples interpolate
 * backendUrl / mcpUrl / apiKey at build time.
 *
 * The agent pages follow the landing site's agent pages (postqueen.ai/<slug>),
 * so the app, the site and the docs give the same steps.
 * Do not invent Typefully commands.
 */

export type Kind = 'AGENT' | 'CHAT' | 'MCP' | 'SKILL' | 'FLOW' | 'API' | 'MEDIA';

/** How the connector talks to PostQueen. */
export type MethodId = 'MCP' | 'Skill' | 'Chat' | 'HTTP' | 'CLI' | 'API';

/** How the examples read. */
export type ExampleKind =
  | 'chat'
  | 'bot'
  | 'agent'
  | 'workflow'
  | 'http'
  | 'cli'
  | 'api';

/** Credential the item needs. */
export type CredKind = 'mcp' | 'api' | 'env' | 'none';

/** Catalog group ids. */
export type SectionId =
  | 'agents'
  | 'bots'
  | 'chat'
  | 'editors'
  | 'automation'
  | 'developer'
  | 'media';

/**
 * Left-menu rows. The Browse rows are categories, each a view inside the
 * panel; the Account rows are the key, the OAuth app console and the apps
 * someone signed in to.
 */
export type ConnectNavId =
  | 'all'
  | 'bots'
  | 'agents'
  | 'editors'
  | 'automation'
  | 'developer'
  | 'api-keys'
  | 'oauth-apps'
  | 'approved-apps';

export const CONNECT_NAV_BROWSE: ConnectNavId[] = [
  'all',
  'bots',
  'agents',
  'editors',
  'automation',
  'developer',
];

export const CONNECT_NAV_ACCOUNT: ConnectNavId[] = [
  'api-keys',
  'oauth-apps',
  'approved-apps',
];

/** Automation catalog ids, in display order. */
export const AUTOMATION_CHILD_IDS = [
  'n8n',
  'zapier',
  'make',
  'webhooks',
  'rss',
] as const;

export type AutomationChildId = (typeof AUTOMATION_CHILD_IDS)[number];

/** The four that lead Assistants and bots, each with a prompt to try. */
export const FEATURED_IDS = ['grok-bot', 'muse', 'openclaw', 'hermes'] as const;

/** The logos on the All hero, before "+N more". */
export const HERO_LOGO_IDS = [
  'grok-bot',
  'muse',
  'openclaw',
  'hermes',
  'claude-apps',
  'chatgpt',
  'claude-code',
  'cursor',
] as const;

/** Sections on All, after the hero, in order. */
export const ALL_PAGE_NAV_IDS = [
  'bots',
  'agents',
  'editors',
  'automation',
  'developer',
] as const;

export const BOTS_DISPLAY_ORDER = [
  'grok-bot',
  'muse',
  'openclaw',
  'hermes',
  'claude-apps',
  'chatgpt',
  'claude-cowork',
  'grok',
  'perplexity-computer',
  'nanoclaw',
] as const;

export const AGENTS_DISPLAY_ORDER = [
  'claude-code',
  'codex',
  'cursor',
  'gemini',
  'grok-build',
  'paperclip',
] as const;

export const EDITORS_DISPLAY_ORDER = [
  'vscode',
  'devin-desktop',
  'zed',
  'muse-code',
  'other-mcp',
] as const;

export const DEVELOPER_DISPLAY_ORDER = ['api', 'cli', 'sdk', 'oauth'] as const;

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
  /** Label over the code box: "terminal", "message to your Bot", "mcp.json". */
  codeLabel?: string;
  /** Fold the code box after this many lines, behind "Show the whole message". */
  fold?: number;
  /**
   * What sits inside the step instead of (or next to) code: the API key with a
   * Copy button, or a prompt to copy and send.
   */
  inline?: 'key' | 'ask';
  /** The prompt, for `inline: 'ask'`. */
  ask?: string;
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
  /** Tool the client would call. */
  tool?: string;
  /** What comes back: assistant line, stdout, or a short result. */
  reply?: string;
}

/** How a card says you connect, in plain words. The icon follows the kind. */
export type WayKind =
  | 'message'
  | 'signin'
  | 'command'
  | 'config'
  | 'connector'
  | 'panel'
  | 'address';

export interface Way {
  kind: WayKind;
  label: string;
}

/** One way to connect, for the All ways to connect table. */
export interface ConnectRoute {
  name: string;
  /** The address or command to copy, or `''` when the route is not out yet. */
  address: string;
  need: 'key' | 'none' | 'soon';
  bestFor: string;
  how: string;
}

/** A worked example: what you ask, the tools that run, what comes back. */
export interface Demo {
  ask: string;
  rows: { tool: string; result: string }[];
  answer: string;
}

export interface Fix {
  symptom: string;
  fix: string;
}

export interface Connection {
  id: string;
  name: string;
  glyph: string;
  /** Local icon under /icons/connections or /icons/third-party. */
  icon?: string;
  /** A drawn mark for the tools that have no logo: webhooks, feeds, the API. */
  symbol?: 'hook' | 'rss' | 'code' | 'terminal' | 'package' | 'key';
  kind: Kind;
  method: MethodId;
  cred: CredKind;
  exampleKind: ExampleKind;
  section: SectionId;
  short: string;
  /** The longer description; the agent pages ported from the site use their steps and tips instead. */
  intro?: string;
  examples?: Example[];
  info?: string;
  note?: string;
  soon?: boolean;
  docs: DocLink[];
  paths?: DocLink[];
  steps: Step[];
  /** The card's "how you connect" line. */
  way?: Way;
  /** A prompt to try, on the featured cards. */
  ask?: string;
  isNew?: boolean;
  /** Extra words search should find it by (chat apps for the bots you host). */
  keywords?: string[];
  /** The agent's page on the landing site. */
  site?: string;
  /** The setup heading when it is not "Connect <name>": "Set up n8n". */
  setupTitle?: string;
  /** The italic end of the setup heading: "Connect Grok Bot with one message." */
  setupAccent?: string;
  /** A version of this item that is not out yet, shown as a chip. */
  soonNote?: string;
  /** Steps for signing in without a key; `steps` is then the key route. */
  signInSteps?: Step[];
  demo?: Demo;
  tryChips?: string[];
  goodToKnow?: string[];
  fixes?: Fix[];
  routes?: ConnectRoute[];
  /** Reachable from WhatsApp, Telegram, Slack or Discord. */
  chatApps?: boolean;
  /** Who has to add it first on team plans. */
  teamNote?: string;
}

export interface Group {
  id: SectionId;
  label: string;
  blurb: string;
  items: Connection[];
}

export type CatalogTranslate = (
  key: string,
  defaultValue: string,
  options?: Record<string, unknown>
) => string;

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
 * Webhooks and RSS AutoPost are set up in Settings. Their cards open a page
 * here like any other, and its button leaves for the Settings tab.
 */
export const SETTINGS_EXIT_HREF: Record<string, string> = {
  webhooks: '/settings?tab=webhooks',
  rss: '/settings?tab=autopost',
  autopost: '/settings?tab=autopost',
};

export function settingsExitHref(id: string): string | undefined {
  return SETTINGS_EXIT_HREF[id];
}

/**
 * `?nav=` values from before the categories: the developer rows each opened
 * one card, and still do, under Developer tools.
 */
export const LEGACY_NAV_CONNECTOR: Record<string, string> = {
  'public-api': 'api',
  api: 'api',
  'cli-api': 'api',
  build: 'api',
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
  hermes: 'hermes',
  'hermes-agent': 'hermes',
  'hermes agent': 'hermes',
};

export function resolveConnectorId(raw: string | null): string {
  if (!raw) return '';
  const key = raw.trim().toLowerCase();
  return CONNECTOR_ALIASES[key] || key;
}

const NAV_IDS: readonly string[] = [
  ...CONNECT_NAV_BROWSE,
  ...CONNECT_NAV_ACCOUNT,
];

/** Current `?nav=` values plus the ones older links carry. */
export function resolveConnectNavId(raw: string | null): ConnectNavId | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (NAV_IDS.includes(key)) return key as ConnectNavId;
  if (LEGACY_NAV_CONNECTOR[key] || key === 'develop' || key === 'developer-tools') {
    return 'developer';
  }
  if (key === 'developers') return 'oauth-apps';
  if (key === 'api-key') return 'api-keys';
  if (key === 'assistants') return 'bots';
  if (key === 'coding') return 'agents';
  if (key === 'automations') return 'automation';
  if (
    key === 'media' ||
    key === 'ai-agents' ||
    key === 'mcp' ||
    key === 'agent-skills' ||
    key === 'chat' ||
    key === 'connectors'
  ) {
    return 'all';
  }
  return null;
}

/** Where the guides and the agent pages live; the panel links out to both. */
export const CONNECT_DOCS_URL = 'https://docs.postqueen.ai';
export const CONNECT_SITE_URL = 'https://postqueen.ai';
const DOCS = CONNECT_DOCS_URL;
const SITE = CONNECT_SITE_URL;

/** The chat apps you reach a hosted bot from; their pages open from the bot's. */
export const CHAT_APP_IDS = ['whatsapp', 'telegram', 'slack-chat', 'discord-chat'];

/** The step that hands over the key, with a Copy button in it. */
export const keyStepFor = (t: CatalogTranslate): Step => ({
  title: t('conn_step_copy_key', 'Copy your API key.'),
  detail: t('conn_step_copy_key_detail', 'Only workspace admins can see it.'),
  inline: 'key',
});

const NAV_SECTION: Partial<Record<ConnectNavId, SectionId>> = {
  bots: 'bots',
  agents: 'agents',
  editors: 'editors',
  automation: 'automation',
  developer: 'developer',
};

const NAV_ORDER: Partial<Record<ConnectNavId, readonly string[]>> = {
  bots: BOTS_DISPLAY_ORDER,
  agents: AGENTS_DISPLAY_ORDER,
  editors: EDITORS_DISPLAY_ORDER,
  automation: AUTOMATION_CHILD_IDS,
  developer: DEVELOPER_DISPLAY_ORDER,
};

/** Connections for a Connect-panel nav id. */
export function connectionsForNav(
  groups: Group[],
  navId: ConnectNavId
): Connection[] {
  const all = groups.flatMap((g) => g.items);
  if (navId === 'all') {
    return ALL_PAGE_NAV_IDS.flatMap((id) => connectionsForNav(groups, id));
  }
  const section = NAV_SECTION[navId];
  if (!section) return [];
  return sortByIdOrder(
    all.filter((c) => c.section === section),
    NAV_ORDER[navId] || []
  );
}

/**
 * Search across every category. Matches the name, the card line, the way you
 * connect and the item's keywords, so "whatsapp" finds the bots you reach
 * from WhatsApp.
 */
export function searchConnections(
  groups: Group[],
  query: string
): Connection[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return connectionsForNav(groups, 'all').filter((c) =>
    [c.name, c.short, c.way?.label || '', ...(c.keywords || [])].some((text) =>
      text.toLowerCase().includes(q)
    )
  );
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

/** The category an item's page sits under, for the left menu. */
export function defaultNavForConnection(item: Connection): ConnectNavId {
  switch (item.section) {
    case 'bots':
    case 'chat':
      return 'bots';
    case 'agents':
      return 'agents';
    case 'editors':
      return 'editors';
    case 'automation':
      return 'automation';
    case 'developer':
      return 'developer';
    default:
      return 'all';
  }
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
  // The card's "how you connect" line, in plain words.
  const way = {
    message: { kind: 'message', label: t('conn_way_message', 'One message') },
    signIn: { kind: 'signin', label: t('conn_way_sign_in', 'Sign in, no key') },
    oneCommand: { kind: 'command', label: t('conn_way_one_command', 'One command') },
    threeCommands: {
      kind: 'command',
      label: t('conn_way_three_commands', 'Three commands'),
    },
    cliSkill: { kind: 'command', label: t('conn_way_cli_skill', 'CLI and skill') },
    config: { kind: 'config', label: t('conn_way_config', 'Add to config') },
    mcpJson: { kind: 'config', label: t('conn_way_mcp_json', 'Add to mcp.json') },
    settings: { kind: 'config', label: t('conn_way_settings', 'Add to settings') },
    connector: {
      kind: 'connector',
      label: t('conn_way_connector', 'Custom connector'),
    },
    appsPanel: { kind: 'panel', label: t('conn_way_apps_panel', 'Apps panel') },
    address: { kind: 'address', label: t('conn_way_address', 'One address') },
  } satisfies Record<string, Way>;
  // WhatsApp, Telegram, Slack and Discord reach the bots you host, not PostQueen.
  const chatAppWords = ['WhatsApp', 'Telegram', 'Slack', 'Discord'];
  // The sign-in address: a workspace admin approves, and it serves every tool
  // but ask_postqueen
  const mcpSignInUrl = `${backendUrl}/mcp-oauth-dynamic`;
  // Addresses inside tips and fixes. Unescaped: these are URLs, and React
  // escapes the text anyway.
  const urlVars = {
    mcp: mcpUrl,
    signin: mcpSignInUrl,
    host: apiHost(backendUrl),
    interpolation: { escapeValue: false },
  };
  // The key sits in the step that needs it, with a Copy button.
  const keyStep = keyStepFor(t);
  // Prompts to try after connecting, shared by the agent pages.
  const chip = {
    channels: t('conn_chip_channels', 'List my PostQueen channels'),
    thisWeek: t('conn_chip_this_week', 'What is scheduled this week?'),
    lastMonth: t('conn_chip_last_month', 'How did last month’s posts do?'),
    tomorrow: t('conn_chip_tomorrow', 'What goes out tomorrow?'),
  };
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
            'conn_step_skill_key_body',
            'The agent and the CLI read this from the environment. Put it in the profile the gateway or agent actually runs in. Copy the key from Your API key, at the top of this panel.'
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
          way: way.cliSkill,
          keywords: chatAppWords,
          chatApps: true,
          site: `${SITE}/openclaw`,
          ask: t(
            'conn_openclaw_ask',
            'Share today’s blog post on LinkedIn, X and Bluesky at 5pm.'
          ),
          short: t(
            'conn_openclaw_line',
            'Ask from WhatsApp, Telegram, Slack or Discord'
          ),
          docs: [
            {
              label: t('conn_docs_full_guide', 'Full guide in the docs'),
              href: `${DOCS}/agents/openclaw`,
            },
            {
              label: t('conn_docs_chat_apps', 'Chat apps guide'),
              href: `${DOCS}/agents/chat-channels`,
            },
          ],
          steps: [
            keyStep,
            {
              title: t('conn_openclaw_step_2', 'Install the CLI and skill.'),
              detail: t(
                'conn_openclaw_step_2_detail',
                'Run these where OpenClaw runs, on your gateway.'
              ),
              code: `npm install -g postqueen\nnpx skills add GkhanKINAY/postqueen-agent`,
              codeLabel: 'terminal',
            },
            {
              title: t('conn_openclaw_step_3', 'Give OpenClaw your key.'),
              detail: t(
                'conn_openclaw_step_3_detail',
                'Set it in the environment the gateway starts with, or under `skills.entries.postqueen.env` in `openclaw.json`.'
              ),
              code: `export POSTQUEEN_API_KEY=${apiKey}`,
              codeLabel: 'terminal',
            },
            {
              title: t('conn_openclaw_step_4', 'Check that it is listed.'),
              detail: t(
                'conn_openclaw_step_4_detail',
                'Look for `postqueen` in the list, then ask OpenClaw to list your channels.'
              ),
              code: `openclaw skills list --eligible`,
              codeLabel: 'terminal',
            },
          ],
          demo: {
            ask: t(
              'conn_openclaw_demo_ask',
              'Share today’s blog post on LinkedIn, X and Bluesky at 5pm.'
            ),
            rows: [
              { tool: 'postqueen integrations:list', result: t('conn_openclaw_demo_row_1', '3 channels') },
              { tool: 'postqueen posts:create', result: t('conn_openclaw_demo_row_2', '3 posts, 17:00') },
            ],
            answer: t(
              'conn_openclaw_demo_answer',
              'Scheduled on LinkedIn, X and Bluesky for 17:00. Each one is written for its own network.'
            ),
          },
          tryChips: [chip.channels, chip.thisWeek, chip.lastMonth],
          goodToKnow: [
            t(
              'conn_openclaw_tip_1',
              'The skill counts as eligible only when the `postqueen` command is on the `PATH` and `POSTQUEEN_API_KEY` is set; otherwise OpenClaw leaves it out.'
            ),
            t(
              'conn_openclaw_tip_2',
              'An `export` in your own terminal does not reach a gateway that already runs as a background service. Put the key in `openclaw.json` (`skills.entries.postqueen.env`) or in the service’s own environment, then restart the gateway.'
            ),
            t(
              'conn_openclaw_tip_app_1',
              'Keep the gateway running: OpenClaw only answers while it is up.'
            ),
            t(
              'conn_openclaw_tip_app_2',
              'Your chat app logins stay on your machine. PostQueen only sees the API key.'
            ),
          ],
          fixes: [
            {
              symptom: t(
                'conn_openclaw_fix_1',
                '`postqueen` is not in `openclaw skills list --eligible`'
              ),
              fix: t(
                'conn_openclaw_fix_1_detail',
                'Put the `postqueen` command on the `PATH` and set `POSTQUEEN_API_KEY`.'
              ),
            },
            {
              symptom: t('conn_openclaw_fix_2', 'The gateway does not see your key'),
              fix: t(
                'conn_openclaw_fix_2_detail',
                'An `export` in your terminal does not reach a background gateway. Put the key in `openclaw.json` and restart the gateway.'
              ),
            },
            {
              symptom: t('conn_openclaw_fix_3', 'MCP connects but no tools appear'),
              fix: t(
                'conn_openclaw_fix_3_detail',
                'Add `--transport streamable-http`. Without it OpenClaw assumes SSE.'
              ),
            },
            {
              symptom: t('conn_openclaw_fix_4', 'You followed a NanoClaw guide'),
              fix: t(
                'conn_openclaw_fix_4_detail',
                'NanoClaw is a different app with its own setup. Open its page in this panel.'
              ),
            },
          ],
          routes: [
            {
              name: t('conn_openclaw_route_1', 'CLI and skill'),
              address: 'npm install -g postqueen',
              need: 'key',
              bestFor: t('conn_openclaw_route_1_best', 'The standard OpenClaw setup'),
              how: t(
                'conn_openclaw_route_1_how',
                '`POSTQUEEN_API_KEY` in the gateway’s environment or in `openclaw.json`.'
              ),
            },
            {
              name: t('conn_openclaw_route_2', 'MCP with a header'),
              address: `${mcpUrl}`,
              need: 'key',
              bestFor: t('conn_openclaw_route_2_best', 'Using PostQueen’s MCP tools'),
              how: t(
                'conn_openclaw_route_2_how',
                '`openclaw mcp add` with an Authorization header.'
              ),
            },
            {
              name: t('conn_route_name_sign_in', 'Sign-in'),
              address: `${mcpSignInUrl}`,
              need: 'none',
              bestFor: t('conn_route_best_no_key', 'Not copying or storing a key'),
              how: t(
                'conn_openclaw_route_3_how',
                '`--auth oauth`, then `openclaw mcp login postqueen`.'
              ),
            },
          ],
        },
        {
          id: 'hermes',
          name: 'Hermes Agent',
          glyph: 'H',
          icon: '/icons/connections/hermes.svg',
          kind: 'AGENT',
          method: 'Skill',
          cred: 'env',
          exampleKind: 'bot',
          section: 'bots',
          way: way.config,
          keywords: chatAppWords,
          chatApps: true,
          site: `${SITE}/hermes-agent`,
          ask: t(
            'conn_hermes_ask',
            'Every weekday at 9, post one tip from my notes to Threads.'
          ),
          short: t('conn_hermes_line', 'Ask from Telegram, Discord, Slack or WhatsApp'),
          docs: [
            {
              label: t('conn_docs_full_guide', 'Full guide in the docs'),
              href: `${DOCS}/agents/hermes`,
            },
            {
              label: t('conn_docs_chat_apps', 'Chat apps guide'),
              href: `${DOCS}/agents/chat-channels`,
            },
          ],
          steps: [
            {
              title: t('conn_hermes_step_1', 'Add this to your Hermes config.'),
              detail: t(
                'conn_hermes_step_1_detail',
                'Put it in `~/.hermes/config.yaml`, with your key in the address.'
              ),
              code: `mcp_servers:\n  postqueen:\n    url: "${mcpUrlWithKey}"`,
              codeLabel: '~/.hermes/config.yaml',
            },
            {
              title: t('conn_hermes_step_2', 'Reload Hermes.'),
              detail: t(
                'conn_hermes_step_2_detail',
                'Start a new `hermes chat`, or type `/reload-mcp` in a running session.'
              ),
            },
            {
              title: t('conn_hermes_step_3', 'Check the connection.'),
              detail: t(
                'conn_hermes_step_3_detail',
                'Run this, then ask Hermes to list your channels.'
              ),
              code: `hermes mcp test postqueen`,
              codeLabel: 'terminal',
            },
          ],
          demo: {
            ask: t(
              'conn_hermes_demo_ask',
              'Every weekday at 9, post one tip from my notes to Threads.'
            ),
            rows: [
              { tool: 'hermes cron create', result: t('conn_hermes_demo_row_1', 'weekdays, 9:00') },
              { tool: 'integrationSchedulePostTool', result: t('conn_hermes_demo_row_2', 'first post tomorrow') },
            ],
            answer: t(
              'conn_hermes_demo_answer',
              'Set up. Every weekday at 9:00 I will pick a tip from your notes and post it to Threads. The first one goes out tomorrow.'
            ),
          },
          tryChips: [chip.channels, chip.thisWeek, chip.lastMonth],
          goodToKnow: [
            t(
              'conn_hermes_tip_1',
              'The `hermes mcp catalog` and the setup card you get by asking in chat cover only servers Nous has approved; add PostQueen with `hermes mcp add` or in `config.yaml`.'
            ),
            t(
              'conn_hermes_tip_2',
              'To keep the key out of the file, run `hermes mcp add postqueen --url {{mcp}} --auth header` and paste the key when asked; Hermes keeps it in `~/.hermes/.env`.',
              urlVars
            ),
            t(
              'conn_hermes_tip_3',
              'Hermes can also sign in instead of using a key: set `auth: oauth` with the URL `{{signin}}`.',
              urlVars
            ),
            t(
              'conn_hermes_tip_4',
              'Recurring jobs use `hermes cron create`; there is no `tasks` section in the config file.'
            ),
          ],
          fixes: [
            {
              symptom: t('conn_hermes_fix_1', 'PostQueen is not in `hermes mcp catalog`'),
              fix: t(
                'conn_hermes_fix_1_detail',
                'The catalog lists only servers Nous has approved. Add PostQueen with `hermes mcp add` or in `config.yaml`.'
              ),
            },
            {
              symptom: t('conn_hermes_fix_2', 'The tools do not show in a running chat'),
              fix: t(
                'conn_hermes_fix_2_detail',
                'Type `/reload-mcp`, or start a new `hermes chat`.'
              ),
            },
            {
              symptom: t('conn_hermes_fix_3', 'You are not sure it connected'),
              fix: t('conn_hermes_fix_3_detail', 'Run `hermes mcp test postqueen`.'),
            },
            {
              symptom: t('conn_hermes_fix_4', 'The key is rejected'),
              fix: t(
                'conn_hermes_fix_4_detail',
                'Copy it again from Your API key, at the top of this panel. Only workspace admins see it.'
              ),
            },
          ],
          routes: [
            {
              name: t('conn_route_name_key_url', 'Key in the address'),
              address: `${mcpUrl}/YOUR_API_KEY`,
              need: 'key',
              bestFor: t('conn_route_best_quickest', 'The quickest setup'),
              how: t(
                'conn_hermes_route_1_how',
                'The key is part of the address in `config.yaml`.'
              ),
            },
            {
              name: t('conn_route_name_header', 'Authorization header'),
              address: `${mcpUrl}`,
              need: 'key',
              bestFor: t(
                'conn_hermes_route_2_best',
                'Keeping the key out of config.yaml'
              ),
              how: t(
                'conn_hermes_route_2_how',
                '`hermes mcp add --auth header` asks for the key and keeps it in `~/.hermes/.env`.'
              ),
            },
            {
              name: t('conn_route_name_sign_in', 'Sign-in'),
              address: `${mcpSignInUrl}`,
              need: 'none',
              bestFor: t('conn_route_best_no_key', 'Not copying or storing a key'),
              how: t(
                'conn_hermes_route_3_how',
                '`auth: oauth`, then you sign in to PostQueen in the browser.'
              ),
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
          way: way.oneCommand,
          site: `${SITE}/claude-code`,
          short: t('conn_cc_line', 'Make slideshows and videos for your product'),
          docs: [
            {
              label: t('conn_docs_full_guide', 'Full guide in the docs'),
              href: `${DOCS}/agents/claude-code`,
            },
          ],
          steps: [
            keyStep,
            {
              title: t('conn_cc_step_2', 'Run this in your terminal.'),
              detail: t(
                'conn_cc_step_2_detail',
                'It adds PostQueen’s tools to Claude Code.'
              ),
              code: `claude mcp add --transport http postqueen \\\n  ${mcpUrlWithKey}`,
              codeLabel: 'terminal',
            },
            {
              title: t('conn_cc_step_3', 'Check it.'),
              detail: t(
                'conn_cc_step_3_detail',
                'Look for postqueen in the list, then start a new session so the tools load.'
              ),
              code: `claude mcp list`,
              codeLabel: 'terminal',
            },
          ],
          demo: {
            ask: t(
              'conn_cc_demo_ask',
              'Make a TikTok slideshow a day for our app next week, at 6pm'
            ),
            rows: [
              { tool: 'postqueen · generateImageTool', result: t('conn_cc_demo_row_1', '6 slides × 5') },
              { tool: 'postqueen · integrationSchedulePostTool', result: t('conn_cc_demo_row_2', '5 posts, 18:00') },
            ],
            answer: t(
              'conn_cc_demo_answer',
              'Five slideshows are on your PostQueen calendar, Monday to Friday at 18:00.'
            ),
          },
          tryChips: [chip.channels, chip.thisWeek, chip.lastMonth],
          goodToKnow: [
            t(
              'conn_cc_tip_1',
              'The default scope is local (this project, stored in `~/.claude.json`); add `--scope user` for every project or `--scope project` to write a shared `.mcp.json`.'
            ),
            t(
              'conn_cc_tip_2',
              'To keep the key out of the URL: `claude mcp add --transport http postqueen {{mcp}} --header "Authorization: Bearer YOUR_API_KEY"`.',
              urlVars
            ),
            t(
              'conn_cc_tip_3',
              'Prefer to sign in? Add `{{signin}}` instead, then run `/mcp` and sign in to PostQueen as a workspace admin.',
              urlVars
            ),
            t(
              'conn_cc_tip_app_1',
              'Claude Code is not Claude on the web or desktop: a connector added there does not reach Claude Code.'
            ),
          ],
          fixes: [
            {
              symptom: t('conn_cc_fix_1', 'PostQueen is missing from a session'),
              fix: t(
                'conn_cc_fix_1_detail',
                'Run `claude mcp list`, then start a new session so the tools load.'
              ),
            },
            {
              symptom: t('conn_cc_fix_2', 'It works in one project only'),
              fix: t(
                'conn_cc_fix_2_detail',
                'The default scope is local. Add it again with `--scope user` for every project.'
              ),
            },
            {
              symptom: t('conn_cc_fix_3', 'The key is rejected'),
              fix: t(
                'conn_cc_fix_3_detail',
                'Copy it again from Your API key, at the top of this panel. Only workspace admins see it.'
              ),
            },
            {
              symptom: t('conn_cc_fix_4', 'You meant the Claude app'),
              fix: t(
                'conn_cc_fix_4_detail',
                'Claude and Claude Cowork use a connector instead. Open their pages in this panel.'
              ),
            },
          ],
          routes: [
            {
              name: t('conn_route_name_key_url', 'Key in the address'),
              address: `${mcpUrl}/YOUR_API_KEY`,
              need: 'key',
              bestFor: t('conn_route_best_quickest', 'The quickest setup'),
              how: t('conn_route_how_key_url', 'The key is part of the address.'),
            },
            {
              name: t('conn_route_name_header', 'Authorization header'),
              address: `${mcpUrl}`,
              need: 'key',
              bestFor: t('conn_cc_route_2_best', 'Keeping the key out of the address'),
              how: t(
                'conn_cc_route_2_how',
                '`--header` sends the key as a Bearer token.'
              ),
            },
            {
              name: t('conn_route_name_sign_in', 'Sign-in'),
              address: `${mcpSignInUrl}`,
              need: 'none',
              bestFor: t('conn_route_best_no_key', 'Not copying or storing a key'),
              how: t(
                'conn_cc_route_3_how',
                'Run `/mcp` and sign in to PostQueen as a workspace admin.'
              ),
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
          way: way.oneCommand,
          site: `${SITE}/grok-build`,
          short: t(
            'conn_grok_build_line',
            'Works in your terminal on macOS, Linux and Windows'
          ),
          docs: [
            {
              label: t('conn_docs_full_guide', 'Full guide in the docs'),
              href: `${DOCS}/agents/grok-build`,
            },
          ],
          steps: [
            keyStep,
            {
              title: t('conn_grok_build_step_2', 'Run this in your terminal.'),
              detail: t(
                'conn_grok_build_step_2_detail',
                'It adds PostQueen’s tools to Grok Build.'
              ),
              code: `grok mcp add --transport http postqueen \\\n  ${mcpUrlWithKey}`,
              codeLabel: 'terminal',
            },
            {
              title: t('conn_grok_build_step_3', 'Check it.'),
              detail: t(
                'conn_grok_build_step_3_detail',
                'Or open `/mcps` inside the TUI.'
              ),
              code: `grok mcp doctor postqueen`,
              codeLabel: 'terminal',
            },
          ],
          demo: {
            ask: t(
              'conn_grok_build_demo_ask',
              'Post a quick tip about our app on Threads tonight at 7'
            ),
            rows: [
              { tool: 'postqueen · integrationSchema', result: t('conn_grok_build_demo_row_1', 'Threads rules') },
              { tool: 'postqueen · integrationSchedulePostTool', result: t('conn_grok_build_demo_row_2', '1 post, 19:00') },
            ],
            answer: t(
              'conn_grok_build_demo_answer',
              'Wrote one Threads post with a tip about the app and scheduled it for 19:00.'
            ),
          },
          tryChips: [chip.channels, chip.thisWeek, chip.lastMonth],
          goodToKnow: [
            t(
              'conn_grok_build_tip_1',
              'Header form: `grok mcp add --transport http postqueen {{mcp}} --header \'Authorization: Bearer ${POSTQUEEN_API_KEY}\'`. Keep the single quotes so Grok reads the key from your environment; with double quotes your shell writes the key itself into `config.toml`.',
              urlVars
            ),
            t(
              'conn_grok_build_tip_2',
              '`--scope project` writes `.grok/config.toml`. Grok Build also reads `~/.claude.json`, `.cursor/mcp.json` and `.mcp.json` at lower priority.'
            ),
            t(
              'conn_grok_build_tip_3',
              'Prefer to sign in? Add `{{signin}}` instead, press `i` on PostQueen in `/mcps` and sign in to PostQueen as a workspace admin.',
              urlVars
            ),
            t(
              'conn_grok_build_tip_4',
              'Grok Build is not Grok on grok.com and not Grok Bot; each is set up on its own.'
            ),
          ],
          fixes: [
            {
              symptom: t('conn_grok_build_fix_1', 'PostQueen tools do not show up'),
              fix: t(
                'conn_grok_build_fix_1_detail',
                'Run `grok mcp doctor postqueen`, or open `/mcps` in the TUI and check the server.'
              ),
            },
            {
              symptom: t('conn_grok_build_fix_2', 'Your key ended up in config.toml'),
              fix: t(
                'conn_grok_build_fix_2_detail',
                'Add the server again with the header in single quotes, so Grok reads `${POSTQUEEN_API_KEY}` from your environment.'
              ),
            },
            {
              symptom: t('conn_grok_build_fix_3', 'The key is rejected'),
              fix: t(
                'conn_grok_build_fix_3_detail',
                'Copy it again from Your API key, at the top of this panel. Only workspace admins see it.'
              ),
            },
            {
              symptom: t('conn_grok_build_fix_4', 'You set up Grok or Grok Bot instead'),
              fix: t(
                'conn_grok_build_fix_4_detail',
                'Each one is set up on its own. Open its page in this panel.'
              ),
            },
          ],
          routes: [
            {
              name: t('conn_route_name_key_url', 'Key in the address'),
              address: `${mcpUrl}/YOUR_API_KEY`,
              need: 'key',
              bestFor: t('conn_route_best_quickest', 'The quickest setup'),
              how: t('conn_route_how_key_url', 'The key is part of the address.'),
            },
            {
              name: t('conn_route_name_header', 'Authorization header'),
              address: `${mcpUrl}`,
              need: 'key',
              bestFor: t(
                'conn_grok_build_route_2_best',
                'Keeping the key out of config.toml'
              ),
              how: t(
                'conn_grok_build_route_2_how',
                '`--header` with `${POSTQUEEN_API_KEY}`, read from your environment.'
              ),
            },
            {
              name: t('conn_route_name_sign_in', 'Sign-in'),
              address: `${mcpSignInUrl}`,
              need: 'none',
              bestFor: t('conn_route_best_no_key', 'Not copying or storing a key'),
              how: t(
                'conn_grok_build_route_3_how',
                'Press `i` on PostQueen in `/mcps` and sign in as a workspace admin.'
              ),
            },
            {
              name: t('conn_grok_build_route_4', 'Plugin with the CLI'),
              address: 'grok plugin install postqueen --trust',
              need: 'key',
              bestFor: t(
                'conn_grok_build_route_4_best',
                'Using the PostQueen CLI from Grok'
              ),
              how: t(
                'conn_grok_build_route_4_how',
                'The skill runs the PostQueen CLI with `POSTQUEEN_API_KEY`.'
              ),
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
          way: way.oneCommand,
          site: `${SITE}/codex`,
          short: t(
            'conn_codex_line',
            'Plan a week of posts without leaving your editor'
          ),
          docs: [
            {
              label: t('conn_docs_full_guide', 'Full guide in the docs'),
              href: `${DOCS}/agents/codex`,
            },
          ],
          steps: [
            keyStep,
            {
              title: t('conn_codex_step_2', 'Run this in your terminal.'),
              detail: t(
                'conn_codex_step_2_detail',
                'It adds PostQueen’s tools to Codex.'
              ),
              code: `codex mcp add postqueen \\\n  --url ${mcpUrlWithKey}`,
              codeLabel: 'terminal',
            },
            {
              title: t('conn_codex_step_3', 'Check it.'),
              detail: t(
                'conn_codex_step_3_detail',
                'Look for postqueen in the list, or type `/mcp` inside Codex.'
              ),
              code: `codex mcp list`,
              codeLabel: 'terminal',
            },
            {
              title: t(
                'conn_codex_step_4',
                'Using the IDE extension or the desktop app?'
              ),
              detail: t(
                'conn_codex_step_4_detail',
                'In the extension: gear menu > MCP servers > Add server > Streamable HTTP, paste the URL, save and choose Restart extension. In the ChatGPT desktop app: Settings > MCP servers > Add server, then Restart.'
              ),
            },
          ],
          demo: {
            ask: t(
              'conn_codex_demo_ask',
              'Write five TikTok hooks for our app and turn the best two into slideshows for this week'
            ),
            rows: [
              { tool: 'postqueen · generateImageTool', result: t('conn_codex_demo_row_1', '2 × 6 slides') },
              { tool: 'postqueen · integrationSchedulePostTool', result: t('conn_codex_demo_row_2', 'TikTok, Wed and Fri') },
            ],
            answer: t(
              'conn_codex_demo_answer',
              'Here are five hooks. The two strongest are now slideshows, scheduled for Wednesday and Friday at 18:00.'
            ),
          },
          tryChips: [chip.channels, chip.thisWeek, chip.lastMonth],
          goodToKnow: [
            t(
              'conn_codex_tip_1',
              'Prefer MCP over the PostQueen CLI in Codex: the default workspace-write sandbox has network access off, so every CLI call asks for approval and unattended runs fail.'
            ),
            t(
              'conn_codex_tip_2',
              'To keep the key out of the file: `codex mcp add postqueen --url {{mcp}} --bearer-token-env-var POSTQUEEN_API_KEY`.',
              urlVars
            ),
            t(
              'conn_codex_tip_3',
              'Prefer to sign in? Use `{{signin}}` as the URL. Codex opens the PostQueen sign-in, which a workspace admin approves.',
              urlVars
            ),
          ],
          fixes: [
            {
              symptom: t(
                'conn_codex_fix_1',
                'Every PostQueen CLI call asks for approval'
              ),
              fix: t(
                'conn_codex_fix_1_detail',
                'The default sandbox has network access off. Use the MCP server instead of the CLI.'
              ),
            },
            {
              symptom: t('conn_codex_fix_2', 'The IDE extension does not see PostQueen'),
              fix: t(
                'conn_codex_fix_2_detail',
                'Choose Restart extension after you add the server.'
              ),
            },
            {
              symptom: t('conn_codex_fix_3', 'ChatGPT on the web does not see it'),
              fix: t(
                'conn_codex_fix_3_detail',
                'It does not read Codex’s config. Add PostQueen to ChatGPT on its own.'
              ),
            },
            {
              symptom: t('conn_codex_fix_4', 'The key is rejected'),
              fix: t(
                'conn_codex_fix_4_detail',
                'Copy it again from Your API key, at the top of this panel. Only workspace admins see it.'
              ),
            },
          ],
          routes: [
            {
              name: t('conn_route_name_key_url', 'Key in the address'),
              address: `${mcpUrl}/YOUR_API_KEY`,
              need: 'key',
              bestFor: t('conn_route_best_quickest', 'The quickest setup'),
              how: t('conn_route_how_key_url', 'The key is part of the address.'),
            },
            {
              name: t('conn_codex_route_2', 'Token from your environment'),
              address: `${mcpUrl}`,
              need: 'key',
              bestFor: t('conn_codex_route_2_best', 'Keeping the key out of config.toml'),
              how: t(
                'conn_codex_route_2_how',
                '`--bearer-token-env-var POSTQUEEN_API_KEY` reads the key when Codex starts.'
              ),
            },
            {
              name: t('conn_route_name_sign_in', 'Sign-in'),
              address: `${mcpSignInUrl}`,
              need: 'none',
              bestFor: t('conn_route_best_no_key', 'Not copying or storing a key'),
              how: t(
                'conn_codex_route_3_how',
                'Codex opens the PostQueen sign-in, which a workspace admin approves.'
              ),
            },
          ],
        },
        {
          id: 'muse-code',
          name: t('conn_muse_code_name', 'Muse Code'),
          glyph: 'MC',
          icon: '/icons/connections/muse-code.svg',
          kind: 'MCP',
          method: 'MCP',
          cred: 'mcp',
          exampleKind: 'agent',
          section: 'editors',
          way: way.config,
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
            'conn_muse_code_step_file_body',
            'Add this to `~/.config/muse/settings.json`, then restart Muse Code.'
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
      id: 'bots',
      label: t('conn_group_bots_assistants', 'Assistants and bots'),
      blurb: t(
        'conn_group_bots_assistants_blurb',
        'Chat products, bots you host and any other MCP client.'
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
          section: 'bots',
          way: way.signIn,
          site: `${SITE}/claude`,
          short: t(
            'conn_claude_apps_line',
            'Works on the web, in the desktop app and on your phone'
          ),
          teamNote: t(
            'conn_claude_apps_team_note',
            'On Team and Enterprise plans, an Owner adds it first under Organization settings > Connectors > Add > Custom > Web.'
          ),
          docs: [
            {
              label: t('conn_docs_full_guide', 'Full guide in the docs'),
              href: `${DOCS}/agents/claude`,
            },
          ],
          steps: [
            keyStep,
            {
              title: t('conn_claude_apps_step_2', 'Open Claude’s connectors.'),
              detail: t(
                'conn_claude_apps_step_2_detail',
                'In Claude, open Customize > Connectors, then + > Add custom connector.'
              ),
            },
            {
              title: t('conn_claude_apps_step_3', 'Paste this address.'),
              detail: t(
                'conn_claude_apps_step_3_detail',
                'Name it PostQueen and use this as the URL, with no slash at the end. With your key in it, there is no sign-in step.'
              ),
              code: `Name: PostQueen\nURL:  ${mcpUrlWithKey}`,
              codeLabel: t('conn_claude_apps_step_3_code_label', 'custom connector'),
            },
            {
              title: t('conn_claude_apps_step_4', 'Switch it on in a chat.'),
              detail: t(
                'conn_claude_apps_step_4_detail',
                'Open + (or type /), choose Connectors and switch PostQueen on. Then ask:'
              ),
              inline: 'ask',
              ask: chip.channels,
            },
          ],
          signInSteps: [
            {
              title: t('conn_claude_apps_signin_step_1', 'Open Claude’s connectors.'),
              detail: t(
                'conn_claude_apps_signin_step_1_detail',
                'In Claude, open Customize > Connectors, then + > Add custom connector.'
              ),
            },
            {
              title: t('conn_claude_apps_signin_step_2', 'Paste this address.'),
              detail: t(
                'conn_claude_apps_signin_step_2_detail',
                'Name it PostQueen and use this as the URL, with no slash at the end. Leave the OAuth client ID and secret empty and click Add.'
              ),
              code: `Name: PostQueen\nURL:  ${mcpSignInUrl}`,
              codeLabel: t('conn_claude_apps_signin_step_2_code_label', 'custom connector'),
            },
            {
              title: t('conn_claude_apps_signin_step_3', 'Sign in and approve.'),
              detail: t(
                'conn_claude_apps_signin_step_3_detail',
                'Click Connect, sign in to PostQueen and approve access. Only a workspace admin can approve.'
              ),
            },
            {
              title: t('conn_claude_apps_signin_step_4', 'Switch it on in a chat.'),
              detail: t(
                'conn_claude_apps_signin_step_4_detail',
                'Open + (or type /), choose Connectors and switch PostQueen on. Then ask:'
              ),
              inline: 'ask',
              ask: chip.channels,
            },
          ],
          demo: {
            ask: t(
              'conn_claude_apps_demo_ask',
              'Turn my notes into a LinkedIn post and an X thread, and schedule both for Tuesday at 9am.'
            ),
            rows: [
              { tool: 'integrationList', result: t('conn_claude_apps_demo_row_1', '4 channels') },
              { tool: 'integrationSchema', result: t('conn_claude_apps_demo_row_2', 'LinkedIn and X rules') },
              { tool: 'integrationSchedulePostTool', result: t('conn_claude_apps_demo_row_3', '2 posts, Tue 9:00') },
            ],
            answer: t(
              'conn_claude_apps_demo_answer',
              'Done. The LinkedIn post and a five-part X thread are scheduled for Tuesday at 9:00. Both are on your calendar if you want to change anything.'
            ),
          },
          tryChips: [chip.channels, chip.thisWeek, chip.lastMonth],
          goodToKnow: [
            t(
              'conn_claude_apps_tip_1',
              'Only a workspace admin can connect PostQueen. Admins alone see the API key and approve the sign-in, because either one gives full access to the workspace.'
            ),
            t(
              'conn_claude_apps_tip_2',
              'The sign-in stays until you revoke it under Approved Apps in this panel.'
            ),
            t(
              'conn_claude_apps_tip_3',
              'The upload widget works on the web, in Claude Desktop, in Cowork and in the iOS and Android apps, so you can add a photo or video from your device.'
            ),
            t(
              'conn_claude_apps_tip_app_1',
              'This is Claude on the web, the desktop app and your phone. Claude Code, the terminal agent, is set up on its own.'
            ),
            t(
              'conn_claude_apps_tip_app_2',
              'PostQueen on a private network, such as a LAN or VPN? Claude connects from Anthropic’s servers, so use mcp-remote in Claude Desktop’s config instead.'
            ),
          ],
          fixes: [
            {
              symptom: t(
                'conn_claude_apps_fix_1',
                'Searching Connectors does not find PostQueen'
              ),
              fix: t(
                'conn_claude_apps_fix_1_detail',
                'PostQueen is not in Anthropic’s directory. Add it as a custom connector with the address from Setup.'
              ),
            },
            {
              symptom: t('conn_claude_apps_fix_2', 'Claude refuses the address'),
              fix: t(
                'conn_claude_apps_fix_2_detail',
                'Paste it with no slash at the end. Claude checks that it matches exactly.'
              ),
            },
            {
              symptom: t('conn_claude_apps_fix_3', '“Only an admin can approve”'),
              fix: t(
                'conn_claude_apps_fix_3_detail',
                'Ask a PostQueen workspace admin to sign in and approve, or to connect it with the key.'
              ),
            },
            {
              symptom: t('conn_claude_apps_fix_4', 'The tools do not show up in a chat'),
              fix: t(
                'conn_claude_apps_fix_4_detail',
                'Open + (or type /), choose Connectors and switch PostQueen on.'
              ),
            },
          ],
          routes: [
            {
              name: t('conn_route_name_sign_in', 'Sign-in'),
              address: `${mcpSignInUrl}`,
              need: 'none',
              bestFor: t('conn_route_best_no_key', 'Not copying or storing a key'),
              how: t(
                'conn_claude_apps_route_1_how',
                'You sign in to PostQueen and approve access. Claude registers itself.'
              ),
            },
            {
              name: t('conn_route_name_key_url', 'Key in the address'),
              address: `${mcpUrl}/YOUR_API_KEY`,
              need: 'key',
              bestFor: t(
                'conn_claude_apps_route_2_best',
                'Skipping the sign-in. Anthropic advises against secrets in a URL.'
              ),
              how: t(
                'conn_claude_apps_route_2_how',
                'The key is part of the address, so there is no sign-in step.'
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
          section: 'bots',
          way: way.signIn,
          site: `${SITE}/chatgpt`,
          short: t('conn_chatgpt_line', 'Upload photos in the chat and schedule them'),
          docs: [
            {
              label: t('conn_docs_full_guide', 'Full guide in the docs'),
              href: `${DOCS}/agents/chatgpt`,
            },
          ],
          steps: [
            keyStep,
            {
              title: t('conn_chatgpt_step_2', 'Turn on Developer mode.'),
              detail: t(
                'conn_chatgpt_step_2_detail',
                'In ChatGPT on the web, open Settings > Security and login and turn on Developer mode. On Business, Enterprise and Edu an admin first allows it under Workspace settings > Permissions & roles.'
              ),
            },
            {
              title: t('conn_chatgpt_step_3', 'Add PostQueen as an app.'),
              detail: t(
                'conn_chatgpt_step_3_detail',
                'Go to chatgpt.com/plugins, press +, and enter the name PostQueen, a description and this address under Connection.'
              ),
              code: `Name:           PostQueen\nConnection URL: ${mcpUrlWithKey}\nAuthentication: No Authentication`,
              codeLabel: 'chatgpt.com/plugins > New app',
            },
            {
              title: t('conn_chatgpt_step_4', 'Pick it in a chat.'),
              detail: t(
                'conn_chatgpt_step_4_detail',
                'Open the + menu, choose Developer mode and select PostQueen. ChatGPT asks you to confirm each action that changes something.'
              ),
              inline: 'ask',
              ask: chip.channels,
            },
          ],
          signInSteps: [
            {
              title: t('conn_chatgpt_signin_step_1', 'Turn on Developer mode.'),
              detail: t(
                'conn_chatgpt_signin_step_1_detail',
                'In ChatGPT on the web, open Settings > Security and login and turn on Developer mode. On Business, Enterprise and Edu an admin first allows it under Workspace settings > Permissions & roles.'
              ),
            },
            {
              title: t('conn_chatgpt_signin_step_2', 'Add PostQueen as an app.'),
              detail: t(
                'conn_chatgpt_signin_step_2_detail',
                'Go to chatgpt.com/plugins, press +, and enter the name PostQueen, a description and this address under Connection.'
              ),
              code: `Name:           PostQueen\nConnection URL: ${mcpSignInUrl}\nAuthentication: OAuth`,
              codeLabel: 'chatgpt.com/plugins > New app',
            },
            {
              title: t('conn_chatgpt_signin_step_3', 'Sign in and approve.'),
              detail: t(
                'conn_chatgpt_signin_step_3_detail',
                'Create it, then sign in to PostQueen and approve. Only a workspace admin can approve. It appears under Drafts.'
              ),
            },
            {
              title: t('conn_chatgpt_signin_step_4', 'Pick it in a chat.'),
              detail: t(
                'conn_chatgpt_signin_step_4_detail',
                'Open the + menu, choose Developer mode and select PostQueen. ChatGPT asks you to confirm each action that changes something.'
              ),
              inline: 'ask',
              ask: chip.channels,
            },
          ],
          demo: {
            ask: t(
              'conn_chatgpt_demo_ask',
              'Write a post about our weekend sale and schedule it on Instagram and Facebook for Friday at 6pm.'
            ),
            rows: [
              { tool: 'integrationList', result: t('conn_chatgpt_demo_row_1', '5 channels') },
              { tool: 'generateImageTool', result: t('conn_chatgpt_demo_row_2', '1 image') },
              { tool: 'integrationSchedulePostTool', result: t('conn_chatgpt_demo_row_3', 'Confirmed by you, 2 posts') },
            ],
            answer: t(
              'conn_chatgpt_demo_answer',
              'Scheduled for Friday at 18:00 on Instagram and Facebook, with the image I made. You approved the change when I asked.'
            ),
          },
          tryChips: [chip.channels, chip.thisWeek, chip.lastMonth],
          goodToKnow: [
            t(
              'conn_chatgpt_tip_1',
              'Menus that say Settings > Apps > Advanced settings are the older path; developer mode apps now live on the Plugins page.'
            ),
            t(
              'conn_chatgpt_tip_2',
              'ChatGPT shows the PostQueen upload widget, so you can add a file from your device.'
            ),
            t(
              'conn_chatgpt_tip_3',
              'The ChatGPT desktop app’s MCP servers setting belongs to Codex, not the web chat.'
            ),
            t(
              'conn_chatgpt_tip_app_1',
              'Codex, OpenAI’s coding agent, is a different product and is set up on its own.'
            ),
          ],
          fixes: [
            {
              symptom: t('conn_chatgpt_fix_1', 'There is no Developer mode option'),
              fix: t(
                'conn_chatgpt_fix_1_detail',
                'Turn it on under Settings > Security and login. On Business, Enterprise and Edu an admin allows it first under Workspace settings > Permissions & roles.'
              ),
            },
            {
              symptom: t(
                'conn_chatgpt_fix_2',
                'A guide says Settings > Apps > Advanced settings'
              ),
              fix: t(
                'conn_chatgpt_fix_2_detail',
                'That is the older path. Add PostQueen at chatgpt.com/plugins.'
              ),
            },
            {
              symptom: t(
                'conn_chatgpt_fix_3',
                'The desktop app’s MCP servers setting does nothing in chat'
              ),
              fix: t(
                'conn_chatgpt_fix_3_detail',
                'That setting belongs to Codex. Add PostQueen to ChatGPT on the web.'
              ),
            },
            {
              symptom: t('conn_chatgpt_fix_4', '“Only an admin can approve”'),
              fix: t(
                'conn_chatgpt_fix_4_detail',
                'Ask a PostQueen workspace admin to sign in and approve, or to set it up with the key address.'
              ),
            },
          ],
          routes: [
            {
              name: t('conn_route_name_sign_in', 'Sign-in'),
              address: `${mcpSignInUrl}`,
              need: 'none',
              bestFor: t('conn_route_best_no_key', 'Not copying or storing a key'),
              how: t(
                'conn_chatgpt_route_1_how',
                'Authentication set to OAuth. You sign in to PostQueen and approve.'
              ),
            },
            {
              name: t('conn_route_name_key_url', 'Key in the address'),
              address: `${mcpUrl}/YOUR_API_KEY`,
              need: 'key',
              bestFor: t('conn_route_best_skip_sign_in', 'Skipping the sign-in'),
              how: t(
                'conn_chatgpt_route_2_how',
                'Authentication set to No Authentication. The key is part of the address.'
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
          section: 'bots',
          way: way.connector,
          site: `${SITE}/grok`,
          short: t('conn_grok_line', 'Works on grok.com and in the Grok apps'),
          teamNote: t(
            'conn_grok_team_note',
            'On Business and Enterprise, an admin first adds it at console.x.ai under Grok Business > Connectors > + Add Connector > Other. Members then connect at grok.com/connectors.'
          ),
          docs: [
            {
              label: t('conn_docs_full_guide', 'Full guide in the docs'),
              href: `${DOCS}/agents/grok`,
            },
          ],
          steps: [
            keyStep,
            {
              title: t('conn_grok_step_2', 'Open grok.com/connectors.'),
              detail: t('conn_grok_step_2_detail', 'Choose New Connector, then Custom.'),
            },
            {
              title: t('conn_grok_step_3', 'Paste this address.'),
              detail: t(
                'conn_grok_step_3_detail',
                'Use it as the MCP server URL and save. With your key in it, no extra sign-in is needed.'
              ),
              code: `MCP server URL: ${mcpUrlWithKey}`,
              codeLabel: t('conn_grok_step_3_code_label', 'custom connector'),
            },
            {
              title: t('conn_grok_step_4', 'Check it.'),
              detail: t('conn_grok_step_4_detail', 'In a Grok chat, ask:'),
              inline: 'ask',
              ask: chip.channels,
            },
          ],
          demo: {
            ask: t(
              'conn_grok_demo_ask',
              'How did our X posts do this week? Draft three more like the best one.'
            ),
            rows: [
              { tool: 'analyticsPostsTool', result: t('conn_grok_demo_row_1', 'X, last 7 days') },
              { tool: 'integrationSchema', result: t('conn_grok_demo_row_2', 'X rules') },
              { tool: 'integrationSchedulePostTool', result: t('conn_grok_demo_row_3', '3 drafts') },
            ],
            answer: t(
              'conn_grok_demo_answer',
              'Your Tuesday thread did best. Three drafts in the same style are waiting on your calendar, and none goes out until you schedule it.'
            ),
          },
          tryChips: [chip.channels, chip.thisWeek, chip.lastMonth],
          goodToKnow: [
            t(
              'conn_grok_tip_1',
              'Grok on grok.com is separate from Grok Bot and Grok Build; each is set up on its own.'
            ),
            t(
              'conn_grok_tip_2',
              'The link carries your API key, so keep it private. If it leaks, a workspace admin can rotate the key under API key in this panel.'
            ),
            t(
              'conn_grok_tip_app_1',
              'Grok connects from xAI’s servers, so your PostQueen address must be reachable over the public internet.'
            ),
          ],
          fixes: [
            {
              symptom: t('conn_grok_fix_1', 'The key is rejected'),
              fix: t(
                'conn_grok_fix_1_detail',
                'Copy it again from Your API key, at the top of this panel. Only workspace admins see it.'
              ),
            },
            {
              symptom: t('conn_grok_fix_2', 'The address with your key leaked'),
              fix: t(
                'conn_grok_fix_2_detail',
                'A workspace admin can rotate the key under API key in this panel. Then update the connector.'
              ),
            },
            {
              symptom: t(
                'conn_grok_fix_3',
                'On Business or Enterprise, you cannot add it'
              ),
              fix: t(
                'conn_grok_fix_3_detail',
                'An admin adds it first at console.x.ai under Grok Business > Connectors.'
              ),
            },
            {
              symptom: t('conn_grok_fix_4', 'You are using Grok Bot or Grok Build'),
              fix: t(
                'conn_grok_fix_4_detail',
                'Each one is set up on its own. Open its page in this panel.'
              ),
            },
          ],
          routes: [
            {
              name: t('conn_route_name_key_url', 'Key in the address'),
              address: `${mcpUrl}/YOUR_API_KEY`,
              need: 'key',
              bestFor: t('conn_grok_route_1_best', 'grok.com and the Grok apps'),
              how: t(
                'conn_grok_route_1_how',
                'Paste it as the MCP server URL of a custom connector at grok.com/connectors.'
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
          way: way.message,
          isNew: true,
          site: `${SITE}/grok-bot`,
          ask: t(
            'conn_grok_bot_ask',
            'Every Friday at 4pm, write our week in review for LinkedIn and save it as a PostQueen draft.'
          ),
          short: t(
            'conn_grok_bot_line',
            'Routines write and schedule posts while your laptop is closed'
          ),
          setupAccent: t('conn_grok_bot_setup_accent', 'with one message.'),
          soonNote: t('conn_grok_bot_soon_note', 'Marketplace plugin soon'),
          docs: [
            {
              label: t('conn_docs_full_guide', 'Full guide in the docs'),
              href: `${DOCS}/agents/grok-bot`,
            },
          ],
          steps: [
            keyStep,
            {
              title: t('conn_grok_bot_step_2', 'Send this message to your Bot.'),
              detail: t(
                'conn_grok_bot_step_2_detail',
                'Open a Bot chat in the Grok Bot desktop app or on your phone.'
              ),
              code: `Connect PostQueen as an MCP server at\n${mcpUrl}`,
              codeLabel: t('conn_grok_bot_step_2_code_label', 'message to your Bot'),
            },
            {
              title: t('conn_grok_bot_step_3', 'Choose Connect on the card.'),
              detail: t(
                'conn_grok_bot_step_3_detail',
                'Paste the key into the secure prompt, never into the chat.'
              ),
            },
            {
              title: t('conn_grok_bot_step_4', 'Check the tools.'),
              detail: t(
                'conn_grok_bot_step_4_detail',
                'Ask this. If nothing shows, turn PostQueen on under Marketplace > Your plugins.'
              ),
              inline: 'ask',
              ask: chip.channels,
            },
            {
              title: t('conn_grok_bot_step_5', 'Put it on a routine.'),
              detail: t(
                'conn_grok_bot_step_5_detail',
                'Ask for one, saved as a draft so you see it before it goes out.'
              ),
              inline: 'ask',
              ask: t(
                'conn_grok_bot_step_5_ask',
                'Every Friday at 4pm, draft our week in review for LinkedIn.'
              ),
            },
          ],
          demo: {
            ask: t(
              'conn_grok_bot_demo_ask',
              'Every Friday at 4pm, write our week in review for LinkedIn and save it as a PostQueen draft.'
            ),
            rows: [
              { tool: 'integrationList', result: t('conn_grok_bot_demo_row_1', 'LinkedIn') },
              { tool: 'integrationSchedulePostTool', result: t('conn_grok_bot_demo_row_2', 'draft, Fri 16:00') },
            ],
            answer: t(
              'conn_grok_bot_demo_answer',
              'Routine saved. Every Friday at 16:00 I will draft it and leave it on your PostQueen calendar for you to schedule.'
            ),
          },
          tryChips: [chip.channels, chip.tomorrow, t('conn_grok_bot_chip_3', 'Make an image for Friday’s post')],
          goodToKnow: [
            t(
              'conn_grok_bot_tip_1',
              'Never paste the key into the chat itself; the Bot’s secure prompt keeps it out of the chat history.'
            ),
            t(
              'conn_grok_bot_tip_2',
              'If the tools do not show up, open Marketplace > Your plugins and make sure the PostQueen server is enabled.'
            ),
            t(
              'conn_grok_bot_tip_3',
              'On Enterprise, PostQueen’s address must be on your team’s MCP allowlist.'
            ),
            t(
              'conn_grok_bot_tip_4',
              'PostQueen is coming to the Grok Bot Marketplace soon. Until then, connect it in chat as Setup shows.'
            ),
            t(
              'conn_grok_bot_tip_app_1',
              'Grok Bot runs in the cloud, so your PostQueen address must be public HTTPS. A localhost address does not work.'
            ),
            t(
              'conn_grok_bot_tip_app_2',
              'Grok Bot is not Grok on grok.com and not Grok Build; each is set up on its own.'
            ),
          ],
          fixes: [
            {
              symptom: t('conn_grok_bot_fix_1', 'The tools do not show up'),
              fix: t(
                'conn_grok_bot_fix_1_detail',
                'Open Marketplace > Your plugins and make sure the PostQueen server is enabled.'
              ),
            },
            {
              symptom: t('conn_grok_bot_fix_2', 'You pasted the key into the chat'),
              fix: t(
                'conn_grok_bot_fix_2_detail',
                'Use the secure prompt on the Connect card instead. A workspace admin can rotate the key under API key in this panel.'
              ),
            },
            {
              symptom: t(
                'conn_grok_bot_fix_3',
                'On Enterprise, the connection is blocked'
              ),
              fix: t(
                'conn_grok_bot_fix_3_detail',
                'Ask your admin to add PostQueen’s address to the team’s MCP allowlist.'
              ),
            },
            {
              symptom: t('conn_grok_bot_fix_4', 'The sign-in address fails'),
              fix: t(
                'conn_grok_bot_fix_4_detail',
                'Use `{{mcp}}` with the key in the secure prompt instead.',
                urlVars
              ),
            },
          ],
          routes: [
            {
              name: t('conn_grok_bot_route_1', 'Ask in chat'),
              address: `${mcpUrl}`,
              need: 'key',
              bestFor: t('conn_grok_bot_route_1_best', 'The desktop app and your phone'),
              how: t(
                'conn_grok_bot_route_1_how',
                'Send the message from Setup, then paste your key into the Bot’s secure card.'
              ),
            },
            {
              name: t('conn_grok_bot_route_2', 'Grok Bot Marketplace plugin'),
              address: '',
              need: 'soon',
              bestFor: t('conn_grok_bot_route_2_best', 'Installing from the Marketplace'),
              how: t(
                'conn_grok_bot_route_2_how',
                'PostQueen is coming to the Grok Bot Marketplace. Until then, connect it in chat.'
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
          way: way.signIn,
          site: `${SITE}/claude-cowork`,
          short: t(
            'conn_claude_cowork_line',
            'Hand Cowork a week of posts and review the drafts'
          ),
          docs: [
            {
              label: t('conn_docs_full_guide', 'Full guide in the docs'),
              href: `${DOCS}/agents/claude-cowork`,
            },
          ],
          steps: [
            keyStep,
            {
              title: t('conn_claude_cowork_step_2', 'Add the connector in Claude.'),
              detail: t(
                'conn_claude_cowork_step_2_detail',
                'Customize > Connectors > + > Add custom connector. Name it PostQueen and use this as the URL, with your key in it. Skip this if Claude already has it.'
              ),
              code: `Name: PostQueen\nURL:  ${mcpUrlWithKey}`,
              codeLabel: t('conn_claude_cowork_step_2_code_label', 'custom connector'),
            },
            {
              title: t('conn_claude_cowork_step_3', 'Turn it on in Cowork.'),
              detail: t(
                'conn_claude_cowork_step_3_detail',
                'In a Cowork session, switch PostQueen on from the + menu in the chat box, or from Customize > Connectors. Then ask:'
              ),
              inline: 'ask',
              ask: chip.channels,
            },
          ],
          signInSteps: [
            {
              title: t(
                'conn_claude_cowork_signin_step_1',
                'Add the connector in Claude.'
              ),
              detail: t(
                'conn_claude_cowork_signin_step_1_detail',
                'Customize > Connectors > + > Add custom connector. Name it PostQueen and use this as the URL. Skip this if Claude already has it.'
              ),
              code: `Name: PostQueen\nURL:  ${mcpSignInUrl}`,
              codeLabel: t(
                'conn_claude_cowork_signin_step_1_code_label',
                'custom connector'
              ),
            },
            {
              title: t('conn_claude_cowork_signin_step_2', 'Sign in and approve.'),
              detail: t(
                'conn_claude_cowork_signin_step_2_detail',
                'Click Connect and sign in to PostQueen. Only a workspace admin can approve.'
              ),
            },
            {
              title: t('conn_claude_cowork_signin_step_3', 'Turn it on in Cowork.'),
              detail: t(
                'conn_claude_cowork_signin_step_3_detail',
                'In a Cowork session, switch PostQueen on from the + menu in the chat box, or from Customize > Connectors. Then ask:'
              ),
              inline: 'ask',
              ask: chip.channels,
            },
          ],
          demo: {
            ask: t(
              'conn_claude_cowork_demo_ask',
              'Go through this week’s product notes and schedule three posts for our Instagram and Facebook pages.'
            ),
            rows: [
              { tool: 'integrationList', result: t('conn_claude_cowork_demo_row_1', 'Instagram, Facebook') },
              { tool: 'generateImageTool', result: t('conn_claude_cowork_demo_row_2', '3 images') },
              { tool: 'integrationSchedulePostTool', result: t('conn_claude_cowork_demo_row_3', '6 posts, Wed to Fri') },
            ],
            answer: t(
              'conn_claude_cowork_demo_answer',
              'I wrote three posts from your notes, made an image for each and scheduled them on both pages, one a day from Wednesday.'
            ),
          },
          tryChips: [chip.channels, chip.thisWeek, chip.lastMonth],
          goodToKnow: [
            t(
              'conn_claude_cowork_tip_1',
              'An environment variable or a terminal command on your own computer does not reach Cowork’s cloud sessions; use the connector.'
            ),
            t(
              'conn_claude_cowork_tip_2',
              'Only a workspace admin can connect PostQueen: admins alone see the API key and approve the sign-in.'
            ),
            t(
              'conn_claude_cowork_tip_3',
              'Interactive connectors work in Cowork, so the upload widget can add a file from your device.'
            ),
            t(
              'conn_claude_cowork_tip_app_1',
              'Cowork is on the Pro, Max, Team and Enterprise plans.'
            ),
          ],
          fixes: [
            {
              symptom: t(
                'conn_claude_cowork_fix_1',
                'PostQueen is missing in a Cowork session'
              ),
              fix: t(
                'conn_claude_cowork_fix_1_detail',
                'Turn it on from the + menu in the chat box, or from Customize > Connectors.'
              ),
            },
            {
              symptom: t(
                'conn_claude_cowork_fix_2',
                'A key you set on your computer does nothing'
              ),
              fix: t(
                'conn_claude_cowork_fix_2_detail',
                'Cowork’s cloud sessions do not see your computer’s environment. Add PostQueen as a connector.'
              ),
            },
            {
              symptom: t('conn_claude_cowork_fix_3', '“Only an admin can approve”'),
              fix: t(
                'conn_claude_cowork_fix_3_detail',
                'Ask a PostQueen workspace admin to sign in and approve.'
              ),
            },
            {
              symptom: t(
                'conn_claude_cowork_fix_4',
                'Cowork is missing on the web or mobile'
              ),
              fix: t(
                'conn_claude_cowork_fix_4_detail',
                'On Enterprise, an admin turns on Cowork for the web and mobile.'
              ),
            },
          ],
          routes: [
            {
              name: t('conn_route_name_sign_in', 'Sign-in'),
              address: `${mcpSignInUrl}`,
              need: 'none',
              bestFor: t('conn_route_best_no_key', 'Not copying or storing a key'),
              how: t(
                'conn_claude_cowork_route_1_how',
                'You sign in to PostQueen and approve access, once for Claude and Cowork.'
              ),
            },
            {
              name: t('conn_route_name_key_url', 'Key in the address'),
              address: `${mcpUrl}/YOUR_API_KEY`,
              need: 'key',
              bestFor: t('conn_route_best_skip_sign_in', 'Skipping the sign-in'),
              how: t(
                'conn_claude_cowork_route_2_how',
                'The key is part of the address, so there is no sign-in step.'
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
          way: way.config,
          site: `${SITE}/cursor`,
          short: t(
            'conn_cursor_line',
            'Ask the agent to draft and schedule posts while you code'
          ),
          docs: [
            {
              label: t('conn_docs_full_guide', 'Full guide in the docs'),
              href: `${DOCS}/agents/cursor`,
            },
          ],
          steps: [
            {
              title: t('conn_cursor_step_1', 'Open mcp.json.'),
              detail: t(
                'conn_cursor_step_1_detail',
                '`~/.cursor/mcp.json` covers all projects, `.cursor/mcp.json` one project. In the app, MCP servers live under Customize > MCPs.'
              ),
            },
            {
              title: t('conn_cursor_step_2', 'Add this entry.'),
              detail: t(
                'conn_cursor_step_2_detail',
                'Save the file, with your key in the address.'
              ),
              code: `{\n  "mcpServers": {\n    "postqueen": {\n      "url": "${mcpUrlWithKey}"\n    }\n  }\n}`,
              codeLabel: 'mcp.json',
            },
            {
              title: t('conn_cursor_step_3', 'Check it.'),
              detail: t('conn_cursor_step_3_detail', 'Ask the agent:'),
              inline: 'ask',
              ask: chip.channels,
            },
          ],
          demo: {
            ask: t(
              'conn_cursor_demo_ask',
              'We just shipped dark mode. Post a short update to X and Threads now.'
            ),
            rows: [
              { tool: 'postqueen · integrationList', result: t('conn_cursor_demo_row_1', 'x, threads') },
              { tool: 'postqueen · integrationSchedulePostTool', result: t('conn_cursor_demo_row_2', '2 posts, now') },
            ],
            answer: t(
              'conn_cursor_demo_answer',
              'Posted to X and Threads. Want a longer LinkedIn version for tomorrow morning?'
            ),
          },
          tryChips: [chip.channels, chip.thisWeek, chip.lastMonth],
          goodToKnow: [
            t(
              'conn_cursor_tip_1',
              'Header form: `"url": "{{mcp}}"` with `"headers": {"Authorization": "Bearer ${env:POSTQUEEN_API_KEY}"}`; `${env:NAME}` works in `url` and `headers`.',
              urlVars
            ),
            t(
              'conn_cursor_tip_2',
              'Prefer to sign in? Set `"url"` to `{{signin}}` with no headers. Cursor opens the PostQueen sign-in, which a workspace admin approves.',
              urlVars
            ),
            t(
              'conn_cursor_tip_3',
              'The Cursor CLI runs the same sign-in with `agent mcp login postqueen`.'
            ),
            t(
              'conn_cursor_tip_app_1',
              'PostQueen is not in the Cursor Marketplace; add it to mcp.json as Setup shows.'
            ),
          ],
          fixes: [
            {
              symptom: t('conn_cursor_fix_1', 'The agent does not list PostQueen'),
              fix: t(
                'conn_cursor_fix_1_detail',
                'Check that the `postqueen` entry is in `~/.cursor/mcp.json` or `.cursor/mcp.json`, and look under Customize > MCPs.'
              ),
            },
            {
              symptom: t('conn_cursor_fix_2', 'It works in one project only'),
              fix: t(
                'conn_cursor_fix_2_detail',
                '`.cursor/mcp.json` covers one project. Use `~/.cursor/mcp.json` for all of them.'
              ),
            },
            {
              symptom: t('conn_cursor_fix_3', 'The Cursor CLI does not sign in'),
              fix: t('conn_cursor_fix_3_detail', 'Run `agent mcp login postqueen`.'),
            },
            {
              symptom: t('conn_cursor_fix_4', 'The key is rejected'),
              fix: t(
                'conn_cursor_fix_4_detail',
                'Copy it again from Your API key, at the top of this panel. Only workspace admins see it.'
              ),
            },
          ],
          routes: [
            {
              name: t('conn_route_name_key_url', 'Key in the address'),
              address: `${mcpUrl}/YOUR_API_KEY`,
              need: 'key',
              bestFor: t('conn_route_best_quickest', 'The quickest setup'),
              how: t(
                'conn_cursor_route_1_how',
                'The key is part of the address in `mcp.json`.'
              ),
            },
            {
              name: t('conn_route_name_header', 'Authorization header'),
              address: `${mcpUrl}`,
              need: 'key',
              bestFor: t('conn_cursor_route_2_best', 'Keeping the key out of mcp.json'),
              how: t(
                'conn_cursor_route_2_how',
                '`headers` sends `Bearer ${env:POSTQUEEN_API_KEY}`.'
              ),
            },
            {
              name: t('conn_route_name_sign_in', 'Sign-in'),
              address: `${mcpSignInUrl}`,
              need: 'none',
              bestFor: t('conn_route_best_no_key', 'Not copying or storing a key'),
              how: t(
                'conn_cursor_route_3_how',
                'Cursor opens the PostQueen sign-in, which a workspace admin approves.'
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
          way: way.mcpJson,
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
            'conn_vscode_step_json_body',
            'The key is `servers`, not `mcpServers`, and `type` must be `http`. The API key goes in the URL, as here, or in an Authorization Bearer header.'
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
          icon: '/icons/connections/devin-desktop.svg',
          kind: 'MCP',
          method: 'MCP',
          cred: 'mcp',
          exampleKind: 'agent',
          section: 'editors',
          way: way.oneCommand,
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
            'conn_devin_desktop_step_ui_body',
            'PostQueen is not in the Devin Desktop marketplace. Run this once. `-s user` makes the server available in every project; without it, it is saved for the current project only.'
          ),
              code: `devin mcp add -s user postqueen ${mcpUrlWithKey}`,
              codeLabel: 'terminal',
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
          way: way.settings,
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
            'conn_zed_step_json_body',
            'The key is `context_servers`. This form sends the key in an Authorization header on the bare /mcp URL. A url with the key in the path also works on its own, without headers.'
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
          way: way.oneCommand,
          site: `${SITE}/gemini-cli`,
          short: t('conn_gemini_line', 'Free with a personal Google account'),
          docs: [
            {
              label: t('conn_docs_full_guide', 'Full guide in the docs'),
              href: `${DOCS}/agents/gemini-cli`,
            },
          ],
          steps: [
            keyStep,
            {
              title: t('conn_gemini_step_2', 'Run this in your terminal.'),
              detail: t(
                'conn_gemini_step_2_detail',
                'It adds PostQueen for every folder you open Gemini CLI in.'
              ),
              code: `gemini mcp add --transport http --scope user \\\n  postqueen ${mcpUrlWithKey}`,
              codeLabel: 'terminal',
            },
            {
              title: t('conn_gemini_step_3', 'Check it.'),
              detail: t(
                'conn_gemini_step_3_detail',
                'Start Gemini CLI and type `/mcp` to see the PostQueen tools.'
              ),
              code: `/mcp`,
              codeLabel: 'gemini',
            },
          ],
          demo: {
            ask: t(
              'conn_gemini_demo_ask',
              'Make a short video about our new feature for TikTok, Reels and Shorts on Friday at 6pm'
            ),
            rows: [
              { tool: 'postqueen · generateVideoTool', result: t('conn_gemini_demo_row_1', '8 s, with sound') },
              { tool: 'postqueen · integrationSchedulePostTool', result: t('conn_gemini_demo_row_2', '3 posts, Fri 18:00') },
            ],
            answer: t(
              'conn_gemini_demo_answer',
              'The video is ready and scheduled on TikTok, Instagram and YouTube for Friday at 18:00, with a caption for each.'
            ),
          },
          tryChips: [chip.channels, chip.thisWeek, chip.lastMonth],
          goodToKnow: [
            t(
              'conn_gemini_tip_1',
              'The default scope is project (`.gemini/settings.json`); `--scope user` writes `~/.gemini/settings.json`.'
            ),
            t(
              'conn_gemini_tip_2',
              'The command writes `"url"` with `"type": "http"`, which works. The older key is `httpUrl`.'
            ),
            t(
              'conn_gemini_tip_3',
              'Header form: `gemini mcp add --transport http --scope user --header "Authorization: Bearer YOUR_API_KEY" postqueen {{mcp}}`',
              urlVars
            ),
            t(
              'conn_gemini_tip_app_1',
              'This is Gemini CLI in your terminal. It does not add PostQueen to gemini.google.com or the Gemini apps.'
            ),
          ],
          fixes: [
            {
              symptom: t('conn_gemini_fix_1', 'The sign-in address fails'),
              fix: t(
                'conn_gemini_fix_1_detail',
                'Gemini CLI refuses PostQueen’s sign-in. Use the key address from Setup.'
              ),
            },
            {
              symptom: t('conn_gemini_fix_2', 'PostQueen is missing in another folder'),
              fix: t(
                'conn_gemini_fix_2_detail',
                'The default scope is project. Add it again with `--scope user`.'
              ),
            },
            {
              symptom: t('conn_gemini_fix_3', 'A guide says your `url` setting is wrong'),
              fix: t(
                'conn_gemini_fix_3_detail',
                '`url` with `"type": "http"` works. `httpUrl` is the older key.'
              ),
            },
            {
              symptom: t('conn_gemini_fix_4', 'The key is rejected'),
              fix: t(
                'conn_gemini_fix_4_detail',
                'Copy it again from Your API key, at the top of this panel. Only workspace admins see it.'
              ),
            },
          ],
          routes: [
            {
              name: t('conn_route_name_key_url', 'Key in the address'),
              address: `${mcpUrl}/YOUR_API_KEY`,
              need: 'key',
              bestFor: t('conn_route_best_quickest', 'The quickest setup'),
              how: t('conn_route_how_key_url', 'The key is part of the address.'),
            },
            {
              name: t('conn_route_name_header', 'Authorization header'),
              address: `${mcpUrl}`,
              need: 'key',
              bestFor: t(
                'conn_gemini_route_2_best',
                'Keeping the key out of the address'
              ),
              how: t(
                'conn_gemini_route_2_how',
                '`--header` sends the key as a Bearer token.'
              ),
            },
          ],
        },
        {
          id: 'perplexity-computer',
          name: 'Perplexity Computer',
          glyph: 'Px',
          icon: '/icons/connections/perplexity-computer.svg',
          kind: 'MCP',
          method: 'MCP',
          cred: 'mcp',
          exampleKind: 'chat',
          section: 'bots',
          way: way.connector,
          site: `${SITE}/perplexity-computer`,
          short: t(
            'conn_perplexity_line',
            'Describe a single post or a whole campaign'
          ),
          teamNote: t(
            'conn_perplexity_team_note',
            'On Enterprise, an admin first turns on Allow members to add custom connectors under Enterprise settings > Permissions, or adds PostQueen for the whole organization there.'
          ),
          docs: [
            {
              label: t('conn_docs_full_guide', 'Full guide in the docs'),
              href: `${DOCS}/agents/perplexity-computer`,
            },
          ],
          steps: [
            keyStep,
            {
              title: t('conn_perplexity_step_2', 'Add a custom connector.'),
              detail: t(
                'conn_perplexity_step_2_detail',
                'In Perplexity on the web, open Account settings > Connectors, click + Custom connector and choose Remote.'
              ),
            },
            {
              title: t('conn_perplexity_step_3', 'Fill it in like this.'),
              detail: t(
                'conn_perplexity_step_3_detail',
                'Tick the acknowledgement box, click Add, then click the PostQueen card to enable it.'
              ),
              code: `Name:           PostQueen\nMCP Server URL: ${mcpUrlWithKey}\nAuthentication: None\nTransport:      Streamable HTTP`,
              codeLabel: t('conn_perplexity_step_3_code_label', 'custom connector'),
            },
            {
              title: t('conn_perplexity_step_4', 'Check it in Computer.'),
              detail: t(
                'conn_perplexity_step_4_detail',
                'Make sure PostQueen is on under Connectors, then ask:'
              ),
              inline: 'ask',
              ask: chip.channels,
            },
          ],
          demo: {
            ask: t(
              'conn_perplexity_demo_ask',
              'Draft three LinkedIn posts from this week’s blog articles and keep them as drafts.'
            ),
            rows: [
              { tool: 'integrationList', result: t('conn_perplexity_demo_row_1', 'LinkedIn') },
              { tool: 'integrationSchema', result: t('conn_perplexity_demo_row_2', 'LinkedIn rules') },
              { tool: 'integrationSchedulePostTool', result: t('conn_perplexity_demo_row_3', '3 drafts') },
            ],
            answer: t(
              'conn_perplexity_demo_answer',
              'Three drafts are on your PostQueen calendar. None goes out until you schedule it.'
            ),
          },
          tryChips: [chip.channels, chip.thisWeek, chip.lastMonth],
          goodToKnow: [
            t(
              'conn_perplexity_tip_1',
              'Keep Authentication on None: the key is already in the address.'
            ),
            t(
              'conn_perplexity_tip_2',
              'Use the key address, not PostQueen’s sign-in address, which does not work with Perplexity yet.'
            ),
            t(
              'conn_perplexity_tip_3',
              'Add PostQueen under Connectors, not under Settings, then MCP servers: that setting is for servers on your own device, which cloud Computer tasks do not use.'
            ),
            t(
              'conn_perplexity_tip_4',
              'Use the connector rather than the PostQueen CLI: Computer keeps saved keys in its Credential vault and never passes them into its sandbox.'
            ),
            t(
              'conn_perplexity_tip_5',
              'Perplexity Computer is not Perplexity search, and not the Perplexity Computer MCP server, which lets other apps use Computer.'
            ),
          ],
          fixes: [
            {
              symptom: t(
                'conn_perplexity_fix_1',
                'PostQueen tools do not show up in a task'
              ),
              fix: t(
                'conn_perplexity_fix_1_detail',
                'Click the PostQueen card under Account settings, then Connectors to enable it, and check that it is on under Connectors in Computer.'
              ),
            },
            {
              symptom: t(
                'conn_perplexity_fix_2',
                'You added it under Settings, then MCP servers'
              ),
              fix: t(
                'conn_perplexity_fix_2_detail',
                'That setting is for servers on your own device. Add PostQueen as a custom connector under Connectors instead.'
              ),
            },
            {
              symptom: t('conn_perplexity_fix_3', 'The connection is refused'),
              fix: t(
                'conn_perplexity_fix_3_detail',
                'Use the key address with Authentication set to None, and copy the key again from Your API key, at the top of this panel.'
              ),
            },
            {
              symptom: t('conn_perplexity_fix_4', 'On Enterprise you cannot add it'),
              fix: t(
                'conn_perplexity_fix_4_detail',
                'Ask an admin to turn on Allow members to add custom connectors under Enterprise settings, then Permissions.'
              ),
            },
          ],
          routes: [
            {
              name: t('conn_route_name_key_url', 'Key in the address'),
              address: `${mcpUrl}/YOUR_API_KEY`,
              need: 'key',
              bestFor: t(
                'conn_perplexity_route_1_best',
                'Computer on the web, iOS and Android'
              ),
              how: t(
                'conn_perplexity_route_1_how',
                'Paste it as the MCP Server URL, with Authentication set to None.'
              ),
            },
          ],
        },
        {
          id: 'nanoclaw',
          name: 'NanoClaw',
          glyph: 'NC',
          icon: '/icons/connections/nanoclaw.svg',
          kind: 'MCP',
          method: 'MCP',
          cred: 'mcp',
          exampleKind: 'bot',
          section: 'bots',
          way: way.threeCommands,
          keywords: chatAppWords,
          chatApps: true,
          site: `${SITE}/nanoclaw`,
          short: t(
            'conn_nanoclaw_line',
            'Ask from WhatsApp, Telegram, Slack or Discord'
          ),
          docs: [
            {
              label: t('conn_docs_full_guide', 'Full guide in the docs'),
              href: `${DOCS}/agents/nanoclaw`,
            },
            {
              label: t('conn_docs_chat_apps', 'Chat apps guide'),
              href: `${DOCS}/agents/chat-channels`,
            },
          ],
          steps: [
            keyStep,
            {
              title: t('conn_nanoclaw_step_2', 'Save the key in the OneCLI vault.'),
              detail: t(
                'conn_nanoclaw_step_2_detail',
                'On the machine that runs NanoClaw. NanoClaw then adds it to the agent’s requests, so the agent never sees it.'
              ),
              code: `onecli secrets create --name PostQueen --type generic \\\n  --value ${apiKey} --host-pattern ${apiHost(backendUrl)} \\\n  --header-name Authorization --value-format "Bearer {value}"`,
              codeLabel: 'terminal',
            },
            {
              title: t('conn_nanoclaw_step_3', 'Add PostQueen to your agent group.'),
              detail: t(
                'conn_nanoclaw_step_3_detail',
                'Find the group with `ncl groups list`, then add the server and restart the group.'
              ),
              code: `ncl groups config add-mcp-server --id YOUR_GROUP_ID \\\n  --name postqueen --url ${mcpUrl}\n\nncl groups restart --id YOUR_GROUP_ID`,
              codeLabel: 'terminal',
            },
            {
              title: t('conn_nanoclaw_step_4', 'Check it.'),
              detail: t('conn_nanoclaw_step_4_detail', 'Message the agent and ask:'),
              inline: 'ask',
              ask: chip.channels,
            },
          ],
          demo: {
            ask: t(
              'conn_nanoclaw_demo_ask',
              'Draft two posts about Saturday’s event for Instagram and Facebook.'
            ),
            rows: [
              { tool: 'integrationList', result: t('conn_nanoclaw_demo_row_1', 'Instagram, Facebook') },
              { tool: 'integrationSchedulePostTool', result: t('conn_nanoclaw_demo_row_2', '2 drafts') },
            ],
            answer: t(
              'conn_nanoclaw_demo_answer',
              'Two drafts are waiting on your PostQueen calendar. Nothing goes out until you schedule them.'
            ),
          },
          tryChips: [chip.channels, chip.thisWeek, chip.lastMonth],
          goodToKnow: [
            t(
              'conn_nanoclaw_tip_1',
              'If the PostQueen tools do not load, add the server with the key as a header instead: `ncl groups config add-mcp-server --id YOUR_GROUP_ID --name postqueen --url {{mcp}} --headers \'{"Authorization":"Bearer YOUR_API_KEY"}\'`, then restart the group. The key then sits in the group’s config, where the agent can read it.',
              urlVars
            ),
            t(
              'conn_nanoclaw_tip_2',
              'Do not use the address with the key in it: NanoClaw expects keys in the OneCLI vault, not in a URL.'
            ),
            t(
              'conn_nanoclaw_tip_3',
              'NanoClaw has no sign-in flow for MCP servers, so use the API key rather than PostQueen’s sign-in address.'
            ),
            t(
              'conn_nanoclaw_tip_4',
              'The PostQueen CLI and skill do not work inside NanoClaw’s containers; use the MCP server.'
            ),
            t(
              'conn_nanoclaw_tip_5',
              'NanoClaw is not OpenClaw; each has its own setup.'
            ),
          ],
          fixes: [
            {
              symptom: t('conn_nanoclaw_fix_1', 'PostQueen tools do not load'),
              fix: t(
                'conn_nanoclaw_fix_1_detail',
                'Restart the group with `ncl groups restart`. If they still do not load, add the server with the key as a header, as Good to know shows.'
              ),
            },
            {
              symptom: t('conn_nanoclaw_fix_2', 'You put the key in the address'),
              fix: t(
                'conn_nanoclaw_fix_2_detail',
                'NanoClaw expects keys in the OneCLI vault. Save it there and use `{{mcp}}`.',
                urlVars
              ),
            },
            {
              symptom: t(
                'conn_nanoclaw_fix_3',
                'The PostQueen CLI does nothing inside NanoClaw'
              ),
              fix: t(
                'conn_nanoclaw_fix_3_detail',
                'Its containers never get your environment. Use the MCP server.'
              ),
            },
            {
              symptom: t('conn_nanoclaw_fix_4', 'You followed an OpenClaw guide'),
              fix: t(
                'conn_nanoclaw_fix_4_detail',
                'OpenClaw is a different app with its own setup. Open its page in this panel.'
              ),
            },
          ],
          routes: [
            {
              name: t('conn_nanoclaw_route_1', 'Key in the vault'),
              address: `${mcpUrl}`,
              need: 'key',
              bestFor: t(
                'conn_nanoclaw_route_1_best',
                'Keeping the key away from the agent'
              ),
              how: t(
                'conn_nanoclaw_route_1_how',
                'The OneCLI vault adds the key to each request, so the agent never sees it.'
              ),
            },
            {
              name: t('conn_nanoclaw_route_2', 'Key as a header'),
              address: `${mcpUrl}`,
              need: 'key',
              bestFor: t(
                'conn_nanoclaw_route_2_best',
                'When the tools do not load through the vault'
              ),
              how: t(
                'conn_nanoclaw_route_2_how',
                '`--headers` keeps the key in the group’s config, where the agent can read it.'
              ),
            },
          ],
        },
        {
          id: 'paperclip',
          name: 'Paperclip',
          glyph: 'Pc',
          icon: '/icons/connections/paperclip.svg',
          kind: 'MCP',
          method: 'MCP',
          cred: 'mcp',
          exampleKind: 'agent',
          section: 'agents',
          way: way.appsPanel,
          site: `${SITE}/paperclip`,
          short: t(
            'conn_paperclip_line',
            'Any agent in your Paperclip company can post'
          ),
          docs: [
            {
              label: t('conn_docs_full_guide', 'Full guide in the docs'),
              href: `${DOCS}/agents/paperclip`,
            },
          ],
          steps: [
            keyStep,
            {
              title: t('conn_paperclip_step_2', 'Connect your own MCP server.'),
              detail: t(
                'conn_paperclip_step_2_detail',
                'In Paperclip, open Apps > Connect an app > Connect your own MCP server, enter this address and press Check link.'
              ),
              code: `${mcpUrl}`,
              codeLabel: 'value',
            },
            {
              title: t('conn_paperclip_step_3', 'Paste the key.'),
              detail: t(
                'conn_paperclip_step_3_detail',
                'Under Advanced authentication choose Key or token and paste the key on its own, without the word Bearer.'
              ),
            },
            {
              title: t('conn_paperclip_step_4', 'Turn on the tools you want.'),
              detail: t(
                'conn_paperclip_step_4_detail',
                'Reading tools start on. Tools that change something, such as scheduling a post, start off until you turn them on, and then ask for approval.'
              ),
            },
            {
              title: t('conn_paperclip_step_5', 'Give it to your agents.'),
              detail: t(
                'conn_paperclip_step_5_detail',
                'Give an agent, a project or the whole company access to PostQueen, then assign a task such as:'
              ),
              inline: 'ask',
              ask: chip.channels,
            },
          ],
          demo: {
            ask: t(
              'conn_paperclip_demo_ask',
              'Plan next week’s launch posts for LinkedIn and X and save them as drafts.'
            ),
            rows: [
              { tool: 'integrationList', result: t('conn_paperclip_demo_row_1', 'LinkedIn, X') },
              { tool: 'integrationSchema', result: t('conn_paperclip_demo_row_2', 'LinkedIn and X rules') },
              { tool: 'integrationSchedulePostTool', result: t('conn_paperclip_demo_row_3', 'Approved by you, 4 drafts') },
            ],
            answer: t(
              'conn_paperclip_demo_answer',
              'Four drafts are on your PostQueen calendar, two for each network. Your Claude Code agent wrote them and you approved the save.'
            ),
          },
          tryChips: [chip.channels, chip.thisWeek, chip.lastMonth],
          goodToKnow: [
            t(
              'conn_paperclip_tip_1',
              'Paperclip hands PostQueen’s tools to its Claude Code and Codex agents. Other agent types in Paperclip use their own MCP settings.'
            ),
            t(
              'conn_paperclip_tip_2',
              'Every value you enter becomes an encrypted Paperclip secret and is never shown again.'
            ),
            t(
              'conn_paperclip_tip_3',
              'When Paperclip manages MCP servers for a Claude Code agent, that agent ignores servers added on the same machine with `claude mcp add`.'
            ),
            t(
              'conn_paperclip_tip_4',
              'Agents that run commands can use the PostQueen CLI instead: install it with `npm install -g postqueen` where they run, bind a company secret to `POSTQUEEN_API_KEY` and import the skill in the Skills Store.'
            ),
            t(
              'conn_paperclip_tip_5',
              'There is no `paperclipai` command for MCP connections yet; use the Apps page.'
            ),
          ],
          fixes: [
            {
              symptom: t(
                'conn_paperclip_fix_1',
                'A Claude Code agent does not see PostQueen'
              ),
              fix: t(
                'conn_paperclip_fix_1_detail',
                'Give that agent, its project or the company access in Apps. Servers added with `claude mcp add` are ignored while Paperclip manages MCP.'
              ),
            },
            {
              symptom: t('conn_paperclip_fix_2', 'Scheduling a post does nothing'),
              fix: t(
                'conn_paperclip_fix_2_detail',
                'Tools that change something start off. Turn them on in Apps, then approve each call when Paperclip asks.'
              ),
            },
            {
              symptom: t('conn_paperclip_fix_3', 'The key is rejected'),
              fix: t(
                'conn_paperclip_fix_3_detail',
                'Paste the key on its own, without the word Bearer, copied from Your API key, at the top of this panel.'
              ),
            },
            {
              symptom: t(
                'conn_paperclip_fix_4',
                'Another agent type cannot use PostQueen'
              ),
              fix: t(
                'conn_paperclip_fix_4_detail',
                'Only Claude Code and Codex agents get the Apps connection. Give other agents the PostQueen CLI instead.'
              ),
            },
          ],
          routes: [
            {
              name: t('conn_paperclip_route_1', 'Key or token in Apps'),
              address: `${mcpUrl}`,
              need: 'key',
              bestFor: t('conn_route_best_quickest', 'The quickest setup'),
              how: t(
                'conn_paperclip_route_1_how',
                'Paperclip sends the key as a Bearer token and keeps it as an encrypted secret.'
              ),
            },
            {
              name: t('conn_route_name_sign_in', 'Sign-in'),
              address: `${mcpSignInUrl}`,
              need: 'none',
              bestFor: t('conn_route_best_no_key', 'Not copying or storing a key'),
              how: t(
                'conn_paperclip_route_2_how',
                'Choose Sign in to continue and approve as a PostQueen admin.'
              ),
            },
            {
              name: t('conn_paperclip_route_3', 'CLI and skill'),
              address: 'npm install -g postqueen',
              need: 'key',
              bestFor: t('conn_paperclip_route_3_best', 'Agent types that run commands'),
              how: t(
                'conn_paperclip_route_3_how',
                '`POSTQUEEN_API_KEY` from a company secret, with the skill from the Skills Store.'
              ),
            },
          ],
        },
        {
          id: 'muse',
          name: 'Muse',
          glyph: 'Mu',
          icon: '/icons/connections/muse.svg',
          kind: 'MCP',
          method: 'MCP',
          cred: 'mcp',
          exampleKind: 'chat',
          section: 'bots',
          way: way.message,
          isNew: true,
          site: `${SITE}/muse`,
          ask: t(
            'conn_muse_ask',
            'Plan three Instagram posts for next week about our new menu, make an image for each, and save them as drafts.'
          ),
          short: t(
            'conn_muse_line',
            'Works in the Muse app, on muse.ai and in WhatsApp'
          ),
          setupAccent: t('conn_muse_setup_accent', 'with one message.'),
          docs: [
            {
              label: t('conn_docs_full_guide', 'Full guide in the docs'),
              href: `${DOCS}/agents/muse`,
            },
          ],
          steps: [
            keyStep,
            {
              title: t('conn_muse_step_2', 'Send this message to Muse.'),
              detail: t(
                'conn_muse_step_2_detail',
                'Start a new chat in the Muse app, on muse.ai or in WhatsApp.'
              ),
              code: `Create a custom connector for PostQueen, my social media scheduler.\nIts MCP server is ${mcpUrl} and it takes my PostQueen API key as a Bearer token.\nAsk me for the key in a secure prompt, not in this chat.\nSave a skill so every request to post, schedule or check my social media goes through PostQueen.\nWhen you are connected, list my PostQueen channels.`,
              codeLabel: t('conn_muse_step_2_code_label', 'new message to Muse'),
              fold: 4,
            },
            {
              title: t('conn_muse_step_3', 'Use the secure prompt.'),
              detail: t(
                'conn_muse_step_3_detail',
                'When Muse asks for the key, paste it there, never into the chat. Muse then asks before it acts: Allow once, Allow for this task or Always allow.'
              ),
            },
            {
              title: t('conn_muse_step_4', 'Start asking.'),
              detail: t(
                'conn_muse_step_4_detail',
                'Muse lists your channels. Ask it to write, schedule or check your posts.'
              ),
              inline: 'ask',
              ask: t(
                'conn_muse_step_4_ask',
                'Plan three Instagram posts for next week, with an image for each.'
              ),
            },
          ],
          demo: {
            ask: t(
              'conn_muse_demo_ask',
              'Plan three Instagram posts for next week about our new menu, make an image for each, and save them as drafts.'
            ),
            rows: [
              { tool: 'integrationList', result: t('conn_muse_demo_row_1', 'Instagram') },
              { tool: 'generateImageTool', result: t('conn_muse_demo_row_2', '3 images') },
              { tool: 'integrationSchedulePostTool', result: t('conn_muse_demo_row_3', '3 drafts') },
            ],
            answer: t(
              'conn_muse_demo_answer',
              'Done. Three drafts with images are on your PostQueen calendar for Monday, Wednesday and Friday at 11:00. Want me to add Facebook too?'
            ),
          },
          tryChips: [chip.channels, chip.thisWeek, chip.lastMonth],
          goodToKnow: [
            t(
              'conn_muse_tip_1',
              'Listed connectors are added under Settings > Connectors after Meta reviews them. PostQueen is not listed there yet.'
            ),
            t(
              'conn_muse_tip_2',
              'Meta does not review custom connectors or how they use your information, so grant access with care.'
            ),
            t(
              'conn_muse_tip_3',
              'Muse is not Muse Code. Muse Code, Meta’s coding agent for the terminal, connects to PostQueen’s MCP address directly; the MCP server guide covers it.'
            ),
          ],
          fixes: [
            {
              symptom: t(
                'conn_muse_fix_1',
                'PostQueen is not under Settings > Connectors'
              ),
              fix: t(
                'conn_muse_fix_1_detail',
                'It is not in Meta’s reviewed directory yet. Ask Muse in chat to create a custom connector instead.'
              ),
            },
            {
              symptom: t('conn_muse_fix_2', 'Muse asks for the key in the chat'),
              fix: t(
                'conn_muse_fix_2_detail',
                'Do not paste it there; use the secure prompt. If the key was sent in a chat, a workspace admin can rotate it under API key in this panel.'
              ),
            },
            {
              symptom: t('conn_muse_fix_3', 'You wanted Meta’s terminal agent'),
              fix: t(
                'conn_muse_fix_3_detail',
                'That is Muse Code. It connects to PostQueen’s MCP address; follow the MCP server guide.'
              ),
            },
            {
              symptom: t('conn_muse_fix_4', 'Muse is not available to you'),
              fix: t(
                'conn_muse_fix_4_detail',
                'Muse is rolling out in the US and is not in every location yet.'
              ),
            },
          ],
          routes: [
            {
              name: t('conn_muse_route_1', 'Custom connector in chat'),
              address: `${mcpUrl}`,
              need: 'key',
              bestFor: t('conn_muse_route_1_best', 'The Muse app, muse.ai and WhatsApp'),
              how: t(
                'conn_muse_route_1_how',
                'Muse builds the connector from your message and asks for the key in its secure prompt.'
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
          section: 'editors',
          way: way.address,
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
          setupTitle: t('conn_n8n_setup_title', 'Set up n8n'),
          setupAccent: t('conn_n8n_setup_accent', 'in a few minutes.'),
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
            'conn_n8n_step_cred_body',
            'Create a PostQueen API credential and paste your key. n8n sends the Authorization header for you.'
          ),
              inline: 'key',
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
          setupTitle: t('conn_zapier_setup_title', 'Use Zapier'),
          setupAccent: t('conn_zapier_setup_accent', 'over HTTP today.'),
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
          setupTitle: t('conn_make_setup_title', 'Use Make'),
          setupAccent: t('conn_make_setup_accent', 'over HTTP today.'),
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
          symbol: 'hook',
          kind: 'FLOW',
          method: 'HTTP',
          cred: 'none',
          exampleKind: 'http',
          section: 'automation',
          setupTitle: t('conn_webhooks_setup_title', 'Set up a webhook'),
          setupAccent: t('conn_webhooks_setup_accent', 'in Settings.'),
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
          symbol: 'rss',
          kind: 'FLOW',
          method: 'HTTP',
          cred: 'none',
          exampleKind: 'workflow',
          section: 'automation',
          setupTitle: t('conn_rss_setup_title', 'Set up RSS AutoPost'),
          setupAccent: t('conn_rss_setup_accent', 'in Settings.'),
          short: t(
            'conn_rss_line',
            'Post new feed items for you, or keep them as drafts to review'
          ),
          intro: t(
            'conn_rss_about',
            'Add feeds under Settings → Autopost. Each new item becomes a post on the channels you pick: published automatically, at the next free slot or right away, or saved as a draft to review. Feeds are checked every hour.'
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
            'conn_rss_step_channels_body',
            'Choose the channels, then whether each new item is published automatically, at the next free slot or right away, or saved as a draft for review.'
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
          symbol: 'terminal',
          kind: 'API',
          method: 'CLI',
          cred: 'env',
          exampleKind: 'cli',
          section: 'developer',
          setupTitle: t('conn_cli_setup_title', 'Set up the CLI'),
          setupAccent: t('conn_cli_setup_accent', 'in about a minute.'),
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
              codeLabel: 'terminal',
            },
            {
              title: t('conn_cli_step_login', 'Authenticate'),
              detail: t(
            'conn_cli_step_login_body',
            'Export your key where you run the CLI. The CLI logs in with the API key only.'
          ),
              code: `export POSTQUEEN_API_KEY="${apiKey}"`,
              codeLabel: 'terminal',
            },
            ...apiUrlStep,
            {
              title: t('conn_cli_step_try', 'Try it'),
              detail: t(
                'conn_cli_step_try_detail',
                'First command that reaches the API, lists your connected channels as JSON.'
              ),
              code: 'postqueen integrations:list',
              codeLabel: 'terminal',
            },
          ],
        },
        {
          id: 'api',
          name: t('conn_api_name', 'Public API'),
          glyph: 'API',
          symbol: 'code',
          kind: 'API',
          method: 'API',
          cred: 'api',
          exampleKind: 'api',
          section: 'developer',
          setupTitle: t('conn_api_setup_title', 'Use the Public API'),
          setupAccent: t('conn_api_setup_accent', 'from any language.'),
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
              codeLabel: 'terminal',
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
          symbol: 'package',
          kind: 'API',
          method: 'API',
          cred: 'env',
          exampleKind: 'api',
          section: 'developer',
          setupTitle: t('conn_sdk_setup_title', 'Use the Node SDK'),
          setupAccent: t('conn_sdk_setup_accent', 'in your own code.'),
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
              codeLabel: 'terminal',
            },
            {
              title: t('conn_sdk_step_key', 'Authenticate'),
              detail: t(
            'conn_sdk_step_key_body',
            'Pass your API key when you construct the client, or set it in the environment.'
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
          symbol: 'key',
          kind: 'API',
          method: 'API',
          cred: 'none',
          exampleKind: 'api',
          section: 'developer',
          setupTitle: t('conn_oauth_setup_title', 'Build an OAuth app'),
          setupAccent: t('conn_oauth_setup_accent', 'for your users.'),
          short: t('conn_oauth_short', 'Let other apps post for your users'),
          intro: t(
            'conn_oauth_intro',
            'If you are building a product rather than automating your own account, register an OAuth app under Developers. Users approve access and you receive a pos_ token. That token works on the Public API (raw key header) and on MCP as a Bearer token on /mcp. The URL form /mcp/KEY only accepts API keys.'
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
            'conn_oauth_step_create_body',
            'Open OAuth apps in this panel, or Settings → Developers, and set your redirect URL there. This is not the workspace API key; that lives under API key.'
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
