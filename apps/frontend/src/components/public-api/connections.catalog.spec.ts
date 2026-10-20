import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  joinBaseUrl,
  mcpOAuthBaseUrl,
} from '../../../../../libraries/nestjs-libraries/src/chat/oauth-types.ts';
import {
  AGENTS_DISPLAY_ORDER,
  BOTS_DISPLAY_ORDER,
  EDITORS_DISPLAY_ORDER,
  DEVELOPER_DISPLAY_ORDER,
  AUTOMATION_CHILD_IDS,
  FEATURED_IDS,
  HERO_LOGO_IDS,
  ALL_PAGE_NAV_IDS,
  CONNECT_NAV_BROWSE,
  CONNECT_NAV_ACCOUNT,
  LEGACY_NAV_CONNECTOR,
  buildConnectionsCatalog,
  connectionAddresses,
  connectionsForNav,
  searchConnections,
  defaultNavForConnection,
  findConnection,
  resolveConnectNavId,
  resolveConnectorId,
  settingsExitHref,
  type CatalogTranslate,
} from './connections.catalog.ts';

// i18next's own interpolation, as the panel's t does it
const interpolate: CatalogTranslate = (_key, fallback, options) =>
  fallback.replace(/\{\{(\w+)\}\}/g, (_, name) =>
    String((options as Record<string, unknown> | undefined)?.[name] ?? '')
  );

const catalog = buildConnectionsCatalog({
  t: interpolate,
  backendUrl: 'https://api.postqueen.ai',
  mcpUrl: 'https://api.postqueen.ai/mcp',
  mcpSignInUrl: 'https://api.postqueen.ai/mcp-oauth-dynamic',
  apiKey: 'test-key',
});

const all = catalog.flatMap((g) => g.items);
const byId = (id: string) => {
  const found = findConnection(catalog, id);
  assert.ok(found, `missing catalog item ${id}`);
  return found;
};

describe('Connect marketplace catalog', () => {
  it('shows every category on All, the featured four leading Assistants and bots', () => {
    assert.deepEqual([...ALL_PAGE_NAV_IDS], [
      'bots',
      'agents',
      'editors',
      'automation',
      'developer',
    ]);
    const shown = ALL_PAGE_NAV_IDS.flatMap((nav) =>
      connectionsForNav(catalog, nav).map((c) => c.id)
    );
    for (const id of FEATURED_IDS) {
      assert.ok(
        connectionsForNav(catalog, 'bots').some((c) => c.id === id),
        `${id} leads Assistants and bots`
      );
    }
    assert.ok(shown.includes('claude-apps'));
    assert.ok(
      connectionsForNav(catalog, 'agents').some((c) => c.id === 'gemini'),
      'Gemini CLI is a terminal agent, not an editor'
    );
    assert.ok(connectionsForNav(catalog, 'editors').some((c) => c.id === 'other-mcp'));
    assert.ok(
      connectionsForNav(catalog, 'automation').some((c) => c.id === 'webhooks'),
      'Webhooks and RSS AutoPost are cards, their page leads to Settings'
    );
    assert.ok(
      !shown.some((id) =>
        ['whatsapp', 'telegram', 'slack-chat', 'discord-chat', 'heygen', 'reelfarm'].includes(id)
      ),
      'chat front doors open from the bots you host, media by link'
    );
    assert.equal(new Set(shown).size, shown.length, 'no card appears twice on All');
  });

  it('features Grok Bot, Muse, OpenClaw and Hermes, each with a prompt to try', () => {
    assert.deepEqual(
      [...FEATURED_IDS],
      ['grok-bot', 'muse', 'openclaw', 'hermes']
    );
    for (const id of FEATURED_IDS) {
      assert.ok(byId(id).ask, `${id} needs a prompt to try`);
      assert.ok(byId(id).way, `${id} needs a way to connect`);
    }
    assert.equal(byId('grok-bot').isNew, true);
    assert.equal(byId('muse').isNew, true);
    assert.equal(byId('openclaw').isNew, undefined);
    for (const id of HERO_LOGO_IDS) byId(id);
    const hub = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'connect-hub.tsx'),
      'utf8'
    );
    assert.match(hub, /data-pq="conn-chat-apps"/);
  });

  it('orders each category and puts every item in the right one', () => {
    assert.deepEqual(
      [...BOTS_DISPLAY_ORDER],
      [
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
      ]
    );
    assert.deepEqual(
      [...AGENTS_DISPLAY_ORDER],
      ['claude-code', 'codex', 'cursor', 'gemini', 'grok-build', 'paperclip']
    );
    assert.deepEqual(
      [...EDITORS_DISPLAY_ORDER],
      ['vscode', 'devin-desktop', 'zed', 'muse-code', 'other-mcp']
    );
    for (const id of BOTS_DISPLAY_ORDER)
      assert.equal(byId(id).section, 'bots', id);
    for (const id of AGENTS_DISPLAY_ORDER)
      assert.equal(byId(id).section, 'agents', id);
    for (const id of EDITORS_DISPLAY_ORDER)
      assert.equal(byId(id).section, 'editors', id);
    for (const id of DEVELOPER_DISPLAY_ORDER)
      assert.equal(byId(id).section, 'developer', id);
    assert.equal(byId('hermes').name, 'Hermes Agent');
    assert.equal(byId('muse').soon, undefined);
    assert.equal(byId('muse-code').soon, undefined);
    assert.ok(!all.some((c) => (c.section as string) === 'featured'));
  });

  it('has a Browse menu of categories and an Account menu', () => {
    assert.deepEqual(CONNECT_NAV_BROWSE, [
      'all',
      'bots',
      'agents',
      'editors',
      'automation',
      'developer',
    ]);
    assert.deepEqual(CONNECT_NAV_ACCOUNT, [
      'api-keys',
      'oauth-apps',
      'approved-apps',
    ]);
    assert.equal(connectionsForNav(catalog, 'bots').length, 10);
    assert.equal(connectionsForNav(catalog, 'agents').length, 6);
    assert.equal(connectionsForNav(catalog, 'editors').length, 5);
    assert.equal(connectionsForNav(catalog, 'automation').length, 5);
    assert.deepEqual(
      connectionsForNav(catalog, 'developer').map((c) => c.id),
      ['api', 'cli', 'sdk', 'oauth']
    );
    for (const id of CONNECT_NAV_ACCOUNT) {
      assert.equal(connectionsForNav(catalog, id).length, 0);
    }
    assert.equal(LEGACY_NAV_CONNECTOR['public-api'], 'api');
    assert.equal(LEGACY_NAV_CONNECTOR.cli, 'cli');
    assert.equal(LEGACY_NAV_CONNECTOR.sdk, 'sdk');
    assert.equal(defaultNavForConnection(byId('api')), 'developer');
    assert.equal(defaultNavForConnection(byId('oauth')), 'developer');
    assert.equal(defaultNavForConnection(byId('n8n')), 'automation');
    assert.equal(defaultNavForConnection(byId('whatsapp')), 'bots');
    assert.equal(defaultNavForConnection(byId('heygen')), 'all');
  });

  it('marks Make and Zapier coming soon, n8n live, and sends Webhooks and RSS to Settings', () => {
    assert.deepEqual(
      [...AUTOMATION_CHILD_IDS],
      ['n8n', 'zapier', 'make', 'webhooks', 'rss']
    );
    assert.equal(byId('n8n').soon, undefined);
    assert.equal(byId('n8n').exampleKind, 'workflow');
    assert.equal(byId('make').soon, true);
    assert.equal(byId('make').exampleKind, 'http');
    assert.equal(byId('zapier').soon, true);
    assert.match(byId('make').steps[1].code || '', /^Authorization: test-key$/);
    assert.doesNotMatch(byId('make').steps[1].code || '', /Bearer/);
    assert.deepEqual(
      connectionsForNav(catalog, 'automation').map((c) => c.id),
      ['n8n', 'zapier', 'make', 'webhooks', 'rss']
    );
    assert.equal(settingsExitHref('webhooks'), '/settings?tab=webhooks');
    assert.equal(settingsExitHref('rss'), '/settings?tab=autopost');
    assert.equal(settingsExitHref('autopost'), '/settings?tab=autopost');
    assert.equal(resolveConnectorId('autopost'), 'rss');
    assert.equal(resolveConnectorId('rss-autopost'), 'rss');
  });

  it('finds the bots you host by the chat app you reach them from', () => {
    const ids = searchConnections(catalog, 'whatsapp').map((c) => c.id);
    for (const id of ['openclaw', 'hermes', 'nanoclaw']) {
      assert.ok(ids.includes(id), `searching WhatsApp should find ${id}`);
    }
    assert.deepEqual(searchConnections(catalog, 'zzzz'), []);
    assert.deepEqual(searchConnections(catalog, '  '), []);
    assert.ok(
      searchConnections(catalog, 'grok').some((c) => c.id === 'grok-bot')
    );
  });

  // The agent pages follow the site's (postqueen.ai/<slug>), checked 2026-09-25.
  const SITE_AGENTS = [
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
    'claude-code',
    'codex',
    'cursor',
    'gemini',
    'grok-build',
    'paperclip',
  ];
  const stepText = (steps: { title: string; detail?: string }[] = []) =>
    steps.map((s) => `${s.title} ${s.detail || ''}`).join('\n');
  const codes = (steps: { code?: string }[] = []) =>
    steps.map((s) => s.code || '').join('\n');
  const pageText = (id: string) => {
    const c = byId(id);
    return [
      c.short,
      stepText(c.steps),
      stepText(c.signInSteps),
      ...(c.goodToKnow || []),
      ...(c.fixes || []).flatMap((f) => [f.symptom, f.fix]),
      ...(c.routes || []).flatMap((r) => [r.name, r.bestFor, r.how]),
      c.demo?.ask || '',
      c.demo?.answer || '',
      ...(c.tryChips || []),
      c.teamNote || '',
      c.soonNote || '',
    ].join('\n');
  };

  it('gives every agent page a setup path, an example, tips, fixes and its routes', () => {
    for (const id of SITE_AGENTS) {
      const c = byId(id);
      assert.ok(c.steps.length >= 2, `${id} needs steps`);
      assert.ok(c.demo?.rows.length, `${id} needs a worked example`);
      assert.ok((c.tryChips || []).length >= 3, `${id} needs prompts to try`);
      assert.ok((c.goodToKnow || []).length, `${id} needs Good to know`);
      assert.ok((c.fixes || []).length, `${id} needs fixes`);
      assert.ok((c.routes || []).length, `${id} needs its routes`);
      assert.match(c.docs[0]?.href || '', /^https:\/\/docs\.postqueen\.ai\/agents\//);
      assert.match(c.site || '', /^https:\/\/postqueen\.ai\//);
      assert.equal(c.intro, undefined, `${id} still carries the old intro`);
      assert.ok(!c.examples?.length, `${id} still carries the old examples`);
    }
    assert.equal(byId('hermes').site, 'https://postqueen.ai/hermes-agent');
    assert.equal(byId('claude-apps').docs[0].href, 'https://docs.postqueen.ai/agents/claude');
    assert.equal(byId('gemini').site, 'https://postqueen.ai/gemini-cli');
  });

  it('speaks from inside the panel, not from the site', () => {
    for (const id of SITE_AGENTS) {
      const text = pageText(id);
      assert.doesNotMatch(text, /Connections [>→]|API Keys\b/, `${id} points at a menu the panel does not have`);
      assert.doesNotMatch(text, /from the box|guide below|as shown above/, `${id} points at the site's layout`);
      assert.doesNotMatch(text, /[—–]| - /, `${id} has a dash`);
      assert.doesNotMatch(text, /not tested|awaiting review|limited until/i, `${id} carries a status hedge`);
    }
    // Addresses in tips follow the server the panel runs against.
    assert.match(
      byId('grok-bot').fixes?.at(-1)?.fix || '',
      /`https:\/\/api\.postqueen\.ai\/mcp` with the key in the secure prompt/
    );
  });

  it('puts the key in the step that needs it, and never on the sign-in route', () => {
    for (const id of ['grok-bot', 'muse', 'claude-code', 'codex', 'gemini', 'grok-build', 'paperclip']) {
      assert.equal(byId(id).steps[0].inline, 'key', `${id} starts with the key`);
    }
    // The CLI signs in through the browser; the key is for a gateway without one.
    for (const id of ['openclaw', 'cli', 'whatsapp', 'telegram', 'slack-chat', 'discord-chat']) {
      const steps = byId(id).steps;
      const signIn = steps.findIndex((s) => s.code === 'postqueen auth:login');
      const key = steps.findIndex((s) => /^export POSTQUEEN_API_KEY=/.test(s.code || ''));
      assert.ok(signIn >= 0, `${id} signs the CLI in`);
      assert.ok(key > signIn, `${id} offers the key after the sign-in`);
      // The key is in the command, so the page adds the key row only for members.
      assert.ok(!steps.some((s) => s.inline === 'key'), `${id} repeats the key in a row`);
    }
    for (const id of ['claude-apps', 'chatgpt', 'claude-cowork']) {
      const c = byId(id);
      assert.ok(c.signInSteps?.length, `${id} offers sign-in`);
      assert.ok(!c.signInSteps?.some((s) => s.inline === 'key'), `${id} sign-in needs no key`);
      assert.match(codes(c.signInSteps), /https:\/\/api\.postqueen\.ai\/mcp-oauth-dynamic/);
      assert.match(codes(c.steps), /https:\/\/api\.postqueen\.ai\/mcp\/test-key/);
    }
    assert.match(codes(byId('hermes').steps), /mcp_servers:\n  postqueen:\n    url: "https:\/\/api\.postqueen\.ai\/mcp\/test-key"/);
    assert.match(stepText(byId('hermes').steps), /\/reload-mcp/);
    assert.match(codes(byId('hermes').steps), /hermes mcp test postqueen/);
  });

  it('keeps Claude chat and Claude Code, ChatGPT and Codex, Gemini CLI and gemini.google.com apart', () => {
    const claude = byId('claude-apps');
    const code = byId('claude-code');
    assert.equal(claude.section, 'bots');
    assert.equal(code.section, 'agents');
    assert.match((claude.goodToKnow || []).join('\n'), /Claude Code, the terminal agent, is set up on its own/);
    assert.match((claude.goodToKnow || []).join('\n'), /mcp-remote/);
    assert.match((claude.fixes || []).map((f) => f.fix).join('\n'), /not in Anthropic’s directory/);
    assert.ok(!codes(claude.steps).includes('claude mcp add'));
    assert.match(codes(code.steps), /claude mcp add --transport http postqueen/);
    assert.match(
      (code.goodToKnow || []).join('\n'),
      /show up in Claude Code when you log in with your claude\.ai account, not with an API key/
    );
    assert.match((byId('chatgpt').goodToKnow || []).join('\n'), /Codex, OpenAI’s coding agent, is a different product/);
    assert.match((byId('codex').fixes || []).map((f) => f.symptom).join('\n'), /ChatGPT on the web does not see it/);
    // ChatGPT adds custom MCP servers from Plugins with no Developer mode step.
    const chatgpt = byId('chatgpt');
    for (const steps of [chatgpt.steps, chatgpt.signInSteps]) {
      assert.doesNotMatch(stepText(steps), /Developer mode|Drafts/);
      assert.match(stepText(steps), /chatgpt\.com\/plugins, select \+, then Add custom MCP server/);
      assert.match(stepText(steps), /I understand and want to continue, select Create as a plugin/);
      assert.match(stepText(steps), /type @ and pick PostQueen/);
    }
    assert.match(codes(chatgpt.steps), /Server URL: +https:\/\/api\.postqueen\.ai\/mcp\/test-key\nAuthentication: No authentication/);
    assert.match(codes(chatgpt.signInSteps), /Authentication: OAuth/);
    assert.doesNotMatch(pageText('chatgpt'), /older path|Plus\b/);
    assert.match(pageText('chatgpt'), /Business, Enterprise and Edu, on the web\. Pro can connect them with read and fetch tools only/);
    assert.match(chatgpt.teamNote || '', /Create plugins with MCPs/);
    // Claude asks for the connector in one screen or in two steps.
    assert.match(stepText(claude.steps), /If Claude asks in two steps, choose No sign-in/);
    assert.match(stepText(claude.signInSteps), /choose Sign in now, and under OAuth client choose Register automatically/);
    for (const id of ['claude-apps', 'claude-cowork']) {
      assert.match(byId(id).teamNote || '', /^On Team and Enterprise, only an Owner can add a custom connector/);
      assert.match(byId(id).teamNote || '', /gives everyone who uses it your workspace key’s access/);
    }
    const gemini = byId('gemini');
    assert.doesNotMatch(pageText('gemini'), /[Ff]ree with|refuses|1,000 a day/);
    assert.match((gemini.goodToKnow || [])[0] || '', /^Since June 18, 2026, free and Google AI Pro or Ultra accounts use Antigravity CLI/);
    assert.match(codes(gemini.steps), /gemini mcp add --transport http --scope user/);
    assert.match((gemini.goodToKnow || []).join('\n'), /"type": "http"/);
    assert.match((gemini.goodToKnow || []).join('\n'), /httpUrl/);
    assert.match((gemini.goodToKnow || []).join('\n'), /gemini\.google\.com/);
    assert.equal(resolveConnectorId('claude code'), 'claude-code');
  });

  it('keeps Grok, Grok Bot and Grok Build as three products', () => {
    const grok = byId('grok');
    const grokBot = byId('grok-bot');
    const grokBuild = byId('grok-build');
    assert.equal(grok.section, 'bots');
    assert.equal(grokBot.section, 'bots');
    assert.equal(grokBuild.section, 'agents');
    assert.match(stepText(grok.steps), /grok\.com\/connectors/);
    assert.match((grok.goodToKnow || []).join('\n'), /separate from Grok Bot and Grok Build/);
    assert.match(grok.teamNote || '', /console\.x\.ai/);
    assert.equal(
      grokBot.steps[1].code,
      'Connect PostQueen as an MCP server at\nhttps://api.postqueen.ai/mcp'
    );
    assert.doesNotMatch(codes(grokBot.steps), /test-key/);
    assert.match(stepText(grokBot.steps), /secure prompt, never into the chat/);
    assert.match((grokBot.goodToKnow || []).join('\n'), /not Grok on grok\.com and not Grok Build/);
    assert.match(grokBot.soonNote || '', /Connect apps/);
    assert.doesNotMatch(pageText('grok-bot'), /Marketplace/);
    assert.match(stepText(grokBot.steps), /open Connect apps in the sidebar, choose Your plugins and check PostQueen is under Installed/);
    assert.match((grokBot.goodToKnow || []).join('\n'), /Disabled by team admin/);
    assert.match(codes(grokBuild.steps), /grok mcp add --transport http postqueen/);
    assert.match(stepText(grokBuild.steps), /This is the terminal agent \(the `grok` CLI\), not Grok Build on grok\.com or in the apps/);
    assert.match((grokBuild.goodToKnow || []).join('\n'), /not Grok on grok\.com and not Grok Bot/);
    // PostQueen is not in xAI's marketplace: the plugin route adds its own first.
    const plugin = grokBuild.routes?.find((r) => /grok plugin/.test(`${r.address} ${r.how}`));
    assert.equal(plugin?.address, 'grok plugin marketplace add GkhanKINAY/postqueen-agent');
    assert.match(plugin?.how || '', /^Then `grok plugin install postqueen --trust`/);
    assert.equal(resolveConnectorId('grok-cli'), 'grok-build');
  });

  it('connects the bots you host the way their docs say', () => {
    const openclaw = byId('openclaw');
    assert.match(codes(openclaw.steps), /npm install -g postqueen/);
    // Without -g the skill goes into the current project only.
    assert.match(codes(openclaw.steps), /npx skills add GkhanKINAY\/postqueen-agent -g -a openclaw/);
    assert.match(codes(openclaw.steps), /openclaw skills list --eligible/);
    assert.match(stepText(openclaw.steps), /skills\.entries\.postqueen\.env/);
    assert.doesNotMatch((openclaw.goodToKnow || []).join('\n'), /eligible[^.]*POSTQUEEN_API_KEY/);
    assert.match((openclaw.fixes || []).map((f) => f.fix).join('\n'), /--transport streamable-http/);
    assert.ok(openclaw.routes?.some((r) => /openclaw mcp add/.test(r.how)));
    // OpenClaw assumes SSE, so every remote PostQueen address needs the transport.
    for (const route of (openclaw.routes || []).filter((r) => /openclaw mcp add/.test(r.how))) {
      assert.match(route.how, /--transport streamable-http/, route.name);
    }
    assert.match(
      openclaw.routes?.find((r) => r.need === 'none')?.how || '',
      /^`openclaw mcp add postqueen --url https:\/\/api\.postqueen\.ai\/mcp-oauth-dynamic --transport streamable-http --auth oauth`, then `openclaw mcp login postqueen`/
    );
    const nanoclaw = byId('nanoclaw');
    const nano = codes(nanoclaw.steps);
    assert.match(nano, /onecli secrets create .*\\\n  --value test-key --host-pattern api\.postqueen\.ai /);
    assert.match(nano, /ncl groups config add-mcp-server --id YOUR_GROUP_ID \\\n  --name postqueen --url https:\/\/api\.postqueen\.ai\/mcp\n/);
    assert.doesNotMatch(nano, /\/mcp\/test-key/);
    // A new OneCLI agent has only its Anthropic secret: grant PostQueen's after creating it.
    const created = nanoclaw.steps.findIndex((s) => /onecli secrets create/.test(s.code || ''));
    const granted = nanoclaw.steps.findIndex((s) => /onecli agents grants attach-secret --id /.test(s.code || ''));
    assert.equal(granted, created + 1, 'the grant follows the secret');
    assert.match(nanoclaw.steps[granted].detail || '', /OneCLI 2\.9 or later.*`onecli agents set-secrets`, which replaces the whole list/);
    assert.match((nanoclaw.goodToKnow || []).join('\n'), /rejects URLs that embed credentials/);
    for (const id of ['openclaw', 'hermes', 'nanoclaw']) {
      assert.equal(byId(id).chatApps, true);
    }
  });

  it('adds Muse, Cowork, Perplexity Computer and Paperclip through their own panels', () => {
    const muse = byId('muse');
    assert.match(codes(muse.steps), /Create a custom connector for PostQueen/);
    assert.match(codes(muse.steps), /secure prompt, not in this chat/);
    assert.equal(muse.steps[1].fold, 4);
    assert.match((muse.goodToKnow || []).join('\n'), /Muse is not Muse Code/);
    const cowork = byId('claude-cowork');
    assert.match(stepText(cowork.signInSteps), /Customize > Connectors > \+ > Add custom connector/);
    assert.match(stepText(cowork.signInSteps), /Skip this if Claude already has it/);
    assert.match((cowork.goodToKnow || []).join('\n'), /Pro, Max, Team and Enterprise/);
    assert.equal(resolveConnectorId('cowork'), 'claude-cowork');
    const perplexity = byId('perplexity-computer');
    assert.match(codes(perplexity.steps), /MCP Server URL: https:\/\/api\.postqueen\.ai\/mcp\/test-key/);
    assert.match(codes(perplexity.steps), /Authentication: None/);
    assert.match(stepText(perplexity.steps), /Open Plugins in the sidebar \(or Customize > Connectors if you don’t see Plugins yet\), then Add custom > Connector > Add MCP connector, and choose Remote/);
    assert.match(perplexity.teamNote || '', /Enterprise settings > Permissions > Connectors permissions and clicks \+ Custom connector/);
    // No Settings > MCP servers path, and no claim either way about signing in.
    assert.doesNotMatch(pageText('perplexity-computer'), /Settings, then MCP servers|Settings > MCP servers|Account settings|sign-in address/);
    const paperclip = byId('paperclip');
    assert.equal(paperclip.steps[1].code, 'https://api.postqueen.ai/mcp');
    assert.match(stepText(paperclip.steps), /without the word Bearer/);
    assert.ok(paperclip.routes?.some((r) => r.address === 'https://api.postqueen.ai/mcp-oauth-dynamic'));
    assert.equal(resolveConnectorId('perplexity'), 'perplexity-computer');
  });

  it('uses the official VS Code, Devin Desktop and Zed JSON keys', () => {
    const vscode = byId('vscode');
    const devin = byId('devin-desktop');
    const zed = byId('zed');
    const cursor = byId('cursor');
    const vscodeJson = codes(vscode.steps);
    const devinJson = codes(devin.steps);
    const zedJson = codes(zed.steps);

    // MCP: Add Server > Global > Copilot Global writes ~/.copilot/mcp-config.json.
    assert.match(vscodeJson, /"mcpServers": \{\n    "postqueen": \{\n      "type": "http",\n      "url": "https:\/\/api\.postqueen\.ai\/mcp\/test-key"/);
    assert.match(stepText(vscode.steps), /run MCP: Add Server and choose HTTP\. Paste this address, enter the ID postqueen, then choose Global and Copilot Global/);
    assert.match(stepText(vscode.steps), /`\.vscode\/mcp\.json` with `servers` in place of `mcpServers` still works for compatibility/);
    assert.match(vscode.intro || '', /Copilot Global/);
    assert.match(vscode.info || '', /your organization’s MCP servers in Copilot policy must allow it/);
    assert.doesNotMatch(`${vscode.info} ${stepText(vscode.steps)}`, /agent mode|different product/);
    assert.match(stepText(vscode.steps), /Do not look for PostQueen in an extension marketplace/);
    assert.match(stepText(cursor.steps), /Save the file and restart Cursor, then check Customize > MCPs/);

    assert.equal(devin.name, 'Devin Desktop');
    assert.match(devinJson, /devin mcp add -s user postqueen/);
    assert.match(devinJson, /"url"/);
    assert.doesNotMatch(devinJson, /"serverUrl"/);
    assert.match(devin.intro || '', /~\/\.config\/devin\/mcp_config\.json/);
    assert.match(devin.info || '', /Devin Local/);
    assert.match(stepText(devin.steps), /not in the Devin Desktop marketplace/);
    // the current name only: no old name, rename note, old icon or old docs path
    assert.doesNotMatch(JSON.stringify(catalog), /windsurf|cascade|formerly/i);

    assert.match(codes(cursor.steps), /"mcpServers"/);
    assert.match((cursor.goodToKnow || []).join('\n'), /not in the Cursor Marketplace/);

    assert.match(zedJson, /"context_servers"/);
    assert.match(zedJson, /Authorization/);
    assert.doesNotMatch(zedJson, /mcpServers/);
    assert.match(zed.intro || '', /context_servers/);
    assert.match(zed.info || '', /only when a server answers 401/);

    assert.match(byId('other-mcp').note || '', /Cline, Continue, Goose/);
    assert.match(byId('other-mcp').note || '', /Cline also needs `"type": "streamableHttp"`/);
    assert.equal(resolveConnectorId('vs-code'), 'vscode');
    assert.equal(resolveConnectorId('windsurf'), 'devin-desktop');
    assert.equal(resolveConnectorId('cascade'), 'devin-desktop');
  });

  it('matches chat-channel docs: CLI first, then per-app pairing', () => {
    const text = (id: string) =>
      byId(id)
        .steps.map((s) => `${s.detail || ''} ${s.code || ''}`)
        .join('\n');
    assert.match(text('whatsapp'), /npm install -g postqueen/);
    assert.match(text('whatsapp'), /npx skills add GkhanKINAY\/postqueen-agent -g -a openclaw/);
    assert.match(text('whatsapp'), /Hermes connects over MCP instead/);
    assert.match(text('whatsapp'), /channels add --channel whatsapp/);
    assert.match(text('whatsapp'), /channels login --channel whatsapp/);
    assert.match(text('telegram'), /BotFather/);
    assert.match(text('telegram'), /openclaw channels add --channel telegram --token <BOT_TOKEN>/);
    assert.match(text('slack-chat'), /@openclaw\/slack/);
    assert.match(text('discord-chat'), /Message Content Intent/);
    assert.match(text('discord-chat'), /@openclaw\/discord/);
    // The tokens do nothing until the channel is in OpenClaw's config.
    assert.match(text('slack-chat'), /slack: \{\n      enabled: true,\n      mode: "socket",/);
    assert.match(text('slack-chat'), /openclaw config patch --file \.\/slack\.socket\.patch\.json5\nopenclaw gateway/);
    assert.match(text('discord-chat'), /discord: \{\n      enabled: true,\n      token: /);
    assert.match(text('discord-chat'), /openclaw config patch --file \.\/discord\.patch\.json5\nopenclaw gateway/);
  });

  it('states CLI, API and OAuth capabilities without mixing surfaces', () => {
    assert.match(byId('cli').intro || '', /17 commands/);
    assert.match(byId('cli').info || '', /on the API and on MCP/);
    // postqueen 2.0.28 signs in through the browser; the key is for machines without one.
    assert.match(codes(byId('cli').steps), /^npm install -g postqueen\npostqueen auth:login\nexport POSTQUEEN_API_KEY=/);
    assert.match(stepText(byId('cli').steps), /a workspace admin approves/);
    assert.doesNotMatch(stepText(byId('cli').steps), /API key only/);
    assert.match(byId('cli').intro || '', /does not generate video/);
    assert.match(byId('api').intro || '', /Image generation is MCP only/);
    assert.doesNotMatch(byId('api').intro || '', /\d+ key authenticated operations/);
    assert.match(byId('oauth').intro || '', /pos_/);
    assert.match(byId('oauth').intro || '', /Bearer token on \/mcp/);
    // A pos_ token is refused nowhere by the URL form; it just must not travel in one.
    for (const text of [byId('oauth').intro || '', stepText(byId('oauth').steps)]) {
      assert.doesNotMatch(text, /only accepts API keys|only looks up API keys|under Developers\./);
      assert.match(text, /where it can end up in logs/);
    }
    assert.match(stepText(byId('sdk').steps), /Pass your API key to `new PostQueen\(\.\.\.\)`/);
    // n8n Cloud installs only verified community nodes.
    assert.match(byId('n8n').info || '', /^Self-hosted n8n only: n8n Cloud installs only verified community nodes, and this one is not verified yet\./);
    assert.match(byId('n8n').info || '', /HTTP Request node with a Header Auth credential/);
    assert.match(stepText(byId('make').steps), /Body content type application\/JSON, Body input method JSON string/);
    assert.match(codes(byId('zapier').steps), /^Authorization: test-key\nContent-Type: application\/json$/m);
    assert.doesNotMatch(JSON.stringify(catalog), /Custom Webhook|below Plugs|She checks|Settings → Autopost/);
    assert.match(byId('paperclip').short, /^Claude Code and Codex agents in Paperclip/);
    assert.doesNotMatch(byId('muse-code').intro || '', /does not take an MCP URL/);
    assert.match(byId('reelfarm').intro || '', /UGC and green-screen videos, not slideshows\. The Reel\.Farm API needs a Growth, Scale or Unlimited plan/);
    assert.match(byId('heygen').intro || '', /HeyGen API credits are bought separately/);
    assert.match(byId('zapier').intro || '', /Professional/);
    assert.match(codes(byId('codex').steps), /codex mcp add postqueen \\\n  --url https:\/\/api\.postqueen\.ai\/mcp\/test-key/);
    assert.match((byId('codex').goodToKnow || []).join('\n'), /network access off/);
    assert.ok(byId('gemini').steps.some((s) => s.code === '/mcp'));
    // RSS AutoPost can publish, not only draft.
    assert.match(byId('rss').short, /Post new feed items for you, or keep them as drafts/);
    assert.match(stepText(byId('rss').steps), /published automatically/);
  });

  it('keeps shorts dash-free for search, and every card line short and plain', () => {
    for (const item of all) {
      assert.ok(item.short.length > 0, `${item.id} is missing a short`);
      assert.doesNotMatch(item.short, /[—–]| - /, `${item.id} short has a dash`);
      assert.doesNotMatch(item.intro || '', /[—–]| - /, `${item.id} intro has a dash`);
    }
    assert.match(byId('openclaw').short, /WhatsApp/);
  });

  it('shows what an agent does, with tools an MCP client really sees', () => {
    assert.equal(byId('whatsapp').exampleKind, 'bot');
    assert.equal(byId('cli').exampleKind, 'cli');
    assert.equal(byId('sdk').exampleKind, 'api');
    assert.equal(byId('cli').examples?.[0]?.code, 'postqueen integrations:list');
    assert.match(byId('sdk').examples?.[0]?.code || '', /new PostQueen/);
    assert.ok(!byId('oauth').examples?.length);
    // MCP wire names, never the in-app agent's internal ids; CLI commands as typed.
    const allowed = new Set([
      'integrationSchedulePostTool',
      'generateImageTool',
      'generateVideoTool',
      'postsListTool',
      'analyticsSummaryTool',
      'analyticsPostsTool',
      'integrationList',
      'integrationSchema',
      'ask_postqueen',
      'postSettingsTool',
      'postqueen integrations:list',
      'postqueen posts:create',
      'hermes cron create',
    ]);
    const seen = new Set<string>();
    for (const item of all) {
      const tools = [
        ...(item.examples || []).map((ex) => ex.tool).filter((x): x is string => !!x),
        ...(item.demo?.rows || []).map((r) => r.tool.replace(/^postqueen · /, '')),
      ];
      for (const tool of tools) {
        assert.ok(allowed.has(tool), `${item.id} uses unknown tool ${tool}`);
        seen.add(tool);
      }
    }
    for (const need of ['integrationSchedulePostTool', 'generateImageTool', 'generateVideoTool', 'analyticsPostsTool']) {
      assert.ok(seen.has(need), `no example ever calls ${need}`);
    }
    for (const item of all) {
      for (const ex of item.examples || []) {
        assert.doesNotMatch(`${ex.body} ${ex.reply || ''}`, /[—–]| - /, `${item.id} example has a dash`);
      }
    }
  });

  it('example answers answer the prompt, they do not teach which product this is', () => {
    const banned =
      /not Claude Code|not Codex|not ChatGPT|not Grok Build|not grok\.com|not Cursor|Enable PostQueen from|used integrationSchedulePostTool|used schedulePostTool|used the skill|used the public MCP|JSON shape for the client|mcp\.json|connectors form/i;
    for (const item of all) {
      for (const ex of item.examples || []) {
        if (ex.reply && !['cli', 'api', 'sdk'].includes(item.id)) {
          assert.doesNotMatch(ex.reply, banned, `${item.id} reply talks about the product`);
        }
      }
      if (item.demo) {
        assert.doesNotMatch(item.demo.answer, banned, `${item.id} answer talks about the product`);
      }
    }
    assert.match(byId('claude-apps').demo?.answer || '', /LinkedIn post and a five-part X thread/);
  });

  it('maps each category to its items, in order', () => {
    assert.deepEqual(
      connectionsForNav(catalog, 'agents').map((c) => c.id),
      [...AGENTS_DISPLAY_ORDER]
    );
    assert.deepEqual(
      connectionsForNav(catalog, 'bots').map((c) => c.id),
      [...BOTS_DISPLAY_ORDER]
    );
    assert.deepEqual(
      connectionsForNav(catalog, 'editors').map((c) => c.id),
      [...EDITORS_DISPLAY_ORDER]
    );
    assert.deepEqual(
      connectionsForNav(catalog, 'all').map((c) => c.id),
      ALL_PAGE_NAV_IDS.flatMap((nav) =>
        connectionsForNav(catalog, nav).map((c) => c.id)
      )
    );
    assert.equal(connectionsForNav(catalog, 'api-keys').length, 0);
  });

  it('resolves older deep links onto the categories and the right page', () => {
    assert.equal(resolveConnectNavId('mcp'), 'all');
    assert.equal(resolveConnectNavId('ai-agents'), 'all');
    assert.equal(resolveConnectNavId('agent-skills'), 'all');
    assert.equal(resolveConnectNavId('chat'), 'all');
    assert.equal(resolveConnectNavId('assistants'), 'bots');
    assert.equal(resolveConnectNavId('agents'), 'agents');
    assert.equal(resolveConnectNavId('bots'), 'bots');
    assert.equal(resolveConnectNavId('automation'), 'automation');
    assert.equal(resolveConnectNavId('cli'), 'developer');
    assert.equal(resolveConnectNavId('api'), 'developer');
    assert.equal(resolveConnectNavId('build'), 'developer');
    assert.equal(resolveConnectNavId('public-api'), 'developer');
    assert.equal(resolveConnectNavId('developers'), 'oauth-apps');
    assert.equal(resolveConnectNavId('api-key'), 'api-keys');
    assert.equal(resolveConnectNavId('nonsense'), null);
    assert.equal(resolveConnectorId('claude'), 'claude-apps');
    assert.equal(resolveConnectorId('grok-bot'), 'grok-bot');
    assert.equal(resolveConnectorId('muse-app'), 'muse');
    assert.equal(resolveConnectorId('gemini-cli'), 'gemini');
    assert.equal(resolveConnectorId('hermes-agent'), 'hermes');
    assert.equal(defaultNavForConnection(byId('openclaw')), 'bots');
    assert.equal(defaultNavForConnection(byId('chatgpt')), 'bots');
    assert.equal(defaultNavForConnection(byId('claude-code')), 'agents');
    assert.equal(defaultNavForConnection(byId('vscode')), 'editors');
  });

  it('uses original Grok Bot, Muse, Codex, VS Code and Zed marks, not invented stand-ins', () => {
    assert.equal(byId('grok').icon, '/icons/connections/grok.svg');
    assert.equal(byId('grok-build').icon, '/icons/connections/grok.svg');
    assert.equal(byId('grok-bot').icon, '/icons/connections/grok-bot.svg');
    assert.equal(byId('muse').icon, '/icons/connections/muse.svg');
    assert.equal(byId('muse-code').icon, '/icons/connections/muse-code.svg');
    assert.equal(byId('codex').icon, '/icons/connections/codex.svg');
    assert.equal(byId('vscode').icon, '/icons/connections/vscode.svg');
    assert.equal(byId('zed').icon, '/icons/connections/zed.svg');
    // These four had letter tiles; their marks now come from the site's assets.
    for (const id of ['devin-desktop', 'perplexity-computer', 'nanoclaw', 'paperclip']) {
      assert.equal(byId(id).icon, `/icons/connections/${id}.svg`);
      assert.ok(
        existsSync(
          join(dirname(fileURLToPath(import.meta.url)), `../../../public/icons/connections/${id}.svg`)
        ),
        `missing icon for ${id}`
      );
    }

    const iconsDir = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../public/icons/connections'
    );
    const grok = readFileSync(join(iconsDir, 'grok.svg'), 'utf8');
    const grokBot = readFileSync(join(iconsDir, 'grok-bot.svg'), 'utf8');
    const muse = readFileSync(join(iconsDir, 'muse.svg'), 'utf8');
    const museCode = readFileSync(join(iconsDir, 'muse-code.svg'), 'utf8');
    const codex = readFileSync(join(iconsDir, 'codex.svg'), 'utf8');
    const vscode = readFileSync(join(iconsDir, 'vscode.svg'), 'utf8');
    const zed = readFileSync(join(iconsDir, 'zed.svg'), 'utf8');

    assert.doesNotMatch(grok, /M15 6\.5 17\.2 12\.3l6\.3\.5/);
    assert.match(grok, /24\.3186 12\.8506/);
    assert.doesNotMatch(grokBot, /M15 6\.5 17\.2 12\.3l6\.3\.5/);
    assert.match(grokBot, /pq-grok-bot-eyes/);
    assert.doesNotMatch(muse, /M15 7\.2c2\.4 2\.2 4\.8 2\.2 7\.2 0/);
    // The blue square with a straight white M was a stand-in, not Meta's mark.
    assert.doesNotMatch(muse, /#0033FF/);
    assert.doesNotMatch(muse, /M24 144V24l40 68 40-68v120/);
    // Muse's mark, the handwritten m in Meta blue, is embedded like the other logos.
    const museMark = Buffer.from(
      muse.match(/base64,([A-Za-z0-9+/=]+)/)?.[1] ?? '',
      'base64'
    ).toString('utf8');
    assert.match(museMark, /M24\.6257 16\.1214/);
    assert.match(museMark, /#0082FB/);
    assert.match(museMark, /#0040DC/);
    // Muse Code is Meta's coding agent; Meta's docs show it under the Meta symbol, not Muse's m.
    const museCodeMark = Buffer.from(
      museCode.match(/base64,([A-Za-z0-9+/=]+)/)?.[1] ?? '',
      'base64'
    ).toString('utf8');
    assert.match(museCodeMark, /M107\.654 0c-12\.3 0-21\.915 9\.264/);
    assert.doesNotMatch(museCodeMark, /M24\.6257 16\.1214/);
    assert.match(codex, /#3941FF/);
    assert.match(codex, /#7A9DFF/);
    assert.match(codex, /#B1A7FF/);
    // A white ">" on a blue square and a green "Z" on black were stand-ins.
    assert.doesNotMatch(vscode, /M8\.8 10\.1 13\.6 15/);
    assert.doesNotMatch(zed, /M9 9h12v2\.4L13\.6 18\.2/);
    // VS Code's blue icon (code.visualstudio.com/brand) and Zed's logomark (zed.dev/brand).
    const vscodeMark = Buffer.from(
      vscode.match(/base64,([A-Za-z0-9+/=]+)/)?.[1] ?? '',
      'base64'
    ).toString('utf8');
    assert.match(vscodeMark, /M70\.9119 99\.3171/);
    const zedMark = Buffer.from(
      zed.match(/base64,([A-Za-z0-9+/=]+)/)?.[1] ?? '',
      'base64'
    ).toString('utf8');
    assert.match(zedMark, /M8\.4375 5\.625C6\.8842 5\.625/);
  });
});

describe('Connection addresses', () => {
  // Production: the app calls its backend through app.postqueen.ai/api, while
  // the MCP server advertises api.postqueen.ai in its OAuth discovery.
  const production = {
    backendUrl: 'https://app.postqueen.ai/api',
    overrideBackendUrl: 'https://api.postqueen.ai',
  };

  const saved = {
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL,
    NEXT_PUBLIC_OVERRIDE_BACKEND_URL:
      process.env.NEXT_PUBLIC_OVERRIDE_BACKEND_URL,
  };

  const setEnv = (name: keyof typeof saved, value: string | undefined) => {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  };

  afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
      setEnv(name as keyof typeof saved, value);
    }
  });

  it('gives agents the host the MCP server advertises, not the one the app calls', () => {
    const expected = {
      apiUrl: 'https://api.postqueen.ai',
      mcpUrl: 'https://api.postqueen.ai/mcp',
      mcpSignInUrl: 'https://api.postqueen.ai/mcp-oauth-dynamic',
    };
    assert.deepEqual(connectionAddresses(production), expected);
    assert.deepEqual(
      connectionAddresses({
        ...production,
        overrideBackendUrl: 'https://api.postqueen.ai/',
      }),
      expected
    );
  });

  it('stays on the backend URL when no override is set', () => {
    assert.deepEqual(
      connectionAddresses({
        backendUrl: 'https://social.example.com/api',
        overrideBackendUrl: '',
      }),
      {
        apiUrl: 'https://social.example.com/api',
        mcpUrl: 'https://social.example.com/api/mcp',
        mcpSignInUrl: 'https://social.example.com/api/mcp-oauth-dynamic',
      }
    );
    // Relative resolves against the page, and outside a browser localhost
    assert.equal(
      connectionAddresses({ backendUrl: '/api' }).apiUrl,
      'http://localhost/api'
    );
  });

  it('lets MCP_URL move the /mcp addresses but never the sign-in address', () => {
    assert.deepEqual(
      connectionAddresses({
        ...production,
        mcpBaseUrl: 'https://mcp.example.com/',
      }),
      {
        apiUrl: 'https://api.postqueen.ai',
        mcpUrl: 'https://mcp.example.com/mcp',
        mcpSignInUrl: 'https://api.postqueen.ai/mcp-oauth-dynamic',
      }
    );
  });

  it('gives the exact resource the MCP server advertises for the same settings', () => {
    // start.mcp.ts: resource = joinBaseUrl(mcpBackendUrl, mcpPath), with
    // mcpBackendUrl = mcpOAuthBaseUrl(). Clients such as Codex refuse a
    // sign-in address that differs from it.
    const settings: [string, string | undefined][] = [
      ['https://app.postqueen.ai/api', 'https://api.postqueen.ai'],
      ['https://app.postqueen.ai/api', 'https://api.postqueen.ai/'],
      ['https://social.example.com/api', undefined],
      ['http://localhost:3000', undefined],
    ];
    for (const [backendUrl, overrideBackendUrl] of settings) {
      setEnv('NEXT_PUBLIC_BACKEND_URL', backendUrl);
      setEnv('NEXT_PUBLIC_OVERRIDE_BACKEND_URL', overrideBackendUrl);
      assert.equal(
        connectionAddresses({ backendUrl, overrideBackendUrl }).mcpSignInUrl,
        joinBaseUrl(mcpOAuthBaseUrl(), '/mcp-oauth-dynamic')
      );
    }
  });

  it('puts no address on the app host anywhere in the production catalog', () => {
    const addresses = connectionAddresses(production);
    const text = JSON.stringify(
      buildConnectionsCatalog({
        t: interpolate,
        backendUrl: addresses.apiUrl,
        mcpUrl: addresses.mcpUrl,
        mcpSignInUrl: addresses.mcpSignInUrl,
        apiKey: 'test-key',
      })
    );
    assert.doesNotMatch(text, /app\.postqueen\.ai\/api/);
    const signIns = text.match(/https?:\/\/[^\s"\\]*mcp-oauth[\w-]*/g) ?? [];
    assert.ok(signIns.length > 10, `only ${signIns.length} sign-in addresses`);
    for (const address of signIns) {
      assert.equal(address, 'https://api.postqueen.ai/mcp-oauth-dynamic');
    }
  });

  it('keeps hosts out of translations, which override the catalog fallbacks', () => {
    const locales = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../../libraries/react-shared-libraries/src/translation/locales'
    );
    for (const lang of readdirSync(locales)) {
      const file = join(locales, lang, 'translation.json');
      if (!existsSync(file)) continue;
      assert.doesNotMatch(
        readFileSync(file, 'utf8'),
        /\b(?:api|app)\.postqueen\.ai\b/,
        `${lang} hardcodes an address`
      );
    }
  });
});
