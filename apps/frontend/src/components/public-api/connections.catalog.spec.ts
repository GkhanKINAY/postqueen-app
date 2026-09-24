import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  AGENTS_DISPLAY_ORDER,
  BOTS_DISPLAY_ORDER,
  EDITORS_DISPLAY_ORDER,
  AUTOMATION_CHILD_IDS,
  FEATURED_IDS,
  FEATURED_CATCHALL_ID,
  ALL_PAGE_NAV_IDS,
  CONNECT_AUTOMATION_SHORTCUTS,
  CONNECT_NAV_CONNECTORS,
  CONNECT_NAV_DEVELOP,
  CONNECT_NAV_ACCOUNT,
  CONNECT_SETTINGS_EXITS,
  DEVELOP_NAV_ITEM,
  buildConnectionsCatalog,
  connectionsForNav,
  restGroupsForAllPage,
  defaultNavForConnection,
  findConnection,
  isAutomationShortcut,
  resolveConnectNavId,
  resolveConnectorId,
  settingsExitHref,
} from './connections.catalog.ts';

const catalog = buildConnectionsCatalog({
  t: (_key, fallback) => fallback,
  backendUrl: 'https://api.postqueen.ai',
  mcpUrl: 'https://api.postqueen.ai/mcp',
  apiKey: 'test-key',
});

const all = catalog.flatMap((g) => g.items);
const byId = (id: string) => {
  const found = findConnection(catalog, id);
  assert.ok(found, `missing catalog item ${id}`);
  return found;
};

describe('Connect marketplace catalog', () => {
  it('groups Connectors leftovers by category, without repeating Featured', () => {
    assert.deepEqual([...ALL_PAGE_NAV_IDS], [
      'agents',
      'bots',
      'chat',
      'editors',
      'automation',
    ]);
    const leftover = restGroupsForAllPage(catalog);
    assert.deepEqual(
      leftover.map((g) => g.nav),
      [...ALL_PAGE_NAV_IDS]
    );
    const leftoverIds = leftover.flatMap((g) => g.items.map((c) => c.id));
    for (const id of FEATURED_IDS) {
      assert.ok(
        !leftoverIds.includes(id),
        `${id} should stay in Featured, not repeat below`
      );
    }
    assert.ok(
      !leftoverIds.includes(FEATURED_CATCHALL_ID),
      'Any MCP client is the Featured catch-all, not a leftover card'
    );
    assert.ok(
      leftover.find((g) => g.nav === 'agents')?.items.some((c) => c.id === 'claude-code')
    );
    assert.ok(
      leftover.find((g) => g.nav === 'agents')?.items.some((c) => c.id === 'gemini'),
      'Gemini CLI is a terminal agent, not an editor'
    );
    assert.ok(
      leftover.find((g) => g.nav === 'bots')?.items.some((c) => c.id === 'openclaw')
    );
    assert.ok(
      leftover.find((g) => g.nav === 'editors')?.items.some((c) => c.id === 'vscode')
    );
    assert.ok(
      !leftover
        .find((g) => g.nav === 'editors')
        ?.items.some((c) => c.id === 'gemini' || c.id === 'other-mcp')
    );
    assert.ok(leftover.find((g) => g.nav === 'chat')?.items.some((c) => c.id === 'whatsapp'));
    assert.ok(!leftover.some((g) => g.items.some((c) => c.section === 'developer')));
    assert.ok(
      leftover.some((g) => g.items.some((c) => c.id === 'n8n')),
      'n8n stays a Connectors card and a left-rail shortcut'
    );
    assert.ok(
      !leftover.some((g) => g.items.some((c) => c.id === 'webhooks' || c.id === 'rss')),
      'Webhooks and RSS AutoPost belong on the left rail, not Connectors cards'
    );
  });

  it('features Claude, ChatGPT, Cursor and Grok as a 4-up; Any MCP is the catch-all', () => {
    assert.deepEqual([...FEATURED_IDS], [
      'claude-apps',
      'chatgpt',
      'cursor',
      'grok',
    ]);
    assert.equal(FEATURED_CATCHALL_ID, 'other-mcp');
    assert.ok(!(FEATURED_IDS as readonly string[]).includes(FEATURED_CATCHALL_ID));
    const panel = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'connect-panel.tsx'),
      'utf8'
    );
    assert.match(panel, /data-pq="featured-catchall"/);
    assert.match(panel, /FEATURED_CATCHALL_ID/);
  });

  it('puts coding agents under Agents, bots under Bots, editors last', () => {
    assert.deepEqual([...AGENTS_DISPLAY_ORDER], [
      'claude-code',
      'codex',
      'cursor',
      'grok-build',
      'muse-code',
      'gemini',
    ]);
    assert.deepEqual([...BOTS_DISPLAY_ORDER], [
      'openclaw',
      'grok-bot',
      'claude-cowork',
      'hermes',
      'perplexity-computer',
      'nanoclaw',
      'paperclip',
      'muse',
    ]);
    assert.deepEqual([...EDITORS_DISPLAY_ORDER], [
      'vscode',
      'devin-desktop',
      'zed',
    ]);
    assert.equal(byId('claude-code').section, 'agents');
    assert.equal(byId('codex').section, 'agents');
    assert.equal(byId('cursor').section, 'agents');
    assert.equal(byId('gemini').section, 'agents');
    assert.equal(byId('other-mcp').section, 'featured');
    assert.equal(byId('openclaw').section, 'bots');
    assert.equal(byId('grok-bot').section, 'bots');
    assert.equal(byId('hermes').section, 'bots');
    assert.equal(byId('claude-cowork').section, 'bots');
    assert.equal(byId('muse').section, 'bots');
    assert.equal(byId('perplexity-computer').section, 'bots');
    assert.equal(byId('nanoclaw').section, 'bots');
    assert.equal(byId('paperclip').section, 'bots');
    assert.equal(byId('vscode').section, 'editors');
    assert.equal(byId('devin-desktop').section, 'editors');
    assert.equal(byId('claude-apps').section, 'featured');
    assert.equal(byId('chatgpt').section, 'featured');
    assert.equal(byId('grok').section, 'featured');
    assert.ok(!FEATURED_IDS.includes('openclaw' as never));
    assert.ok(!FEATURED_IDS.includes('hermes' as never));
    assert.ok(!FEATURED_IDS.includes('gemini' as never));
    assert.equal(byId('muse').soon, undefined);
    assert.equal(byId('muse-code').soon, undefined);
  });

  it('exposes Public API, CLI and Node SDK as Develop nav; Developers under Account', () => {
    assert.deepEqual(
      CONNECT_NAV_DEVELOP.map((n) => n.id),
      ['public-api', 'cli', 'sdk']
    );
    assert.deepEqual(
      CONNECT_NAV_ACCOUNT.map((n) => n.id),
      ['api-keys', 'oauth-apps', 'approved-apps']
    );
    assert.equal(CONNECT_NAV_ACCOUNT[1]?.labelDefault, 'Developers');
    assert.equal(DEVELOP_NAV_ITEM['public-api'], 'api');
    assert.equal(DEVELOP_NAV_ITEM.cli, 'cli');
    assert.equal(DEVELOP_NAV_ITEM.sdk, 'sdk');
    assert.equal(DEVELOP_NAV_ITEM['oauth-apps'], undefined);
    assert.deepEqual(
      connectionsForNav(catalog, 'public-api').map((c) => c.id),
      ['api']
    );
    assert.deepEqual(
      connectionsForNav(catalog, 'cli').map((c) => c.id),
      ['cli']
    );
    assert.equal(connectionsForNav(catalog, 'oauth-apps').length, 0);
    assert.equal(defaultNavForConnection(byId('api')), 'public-api');
    assert.equal(defaultNavForConnection(byId('cli')), 'cli');
    assert.equal(defaultNavForConnection(byId('sdk')), 'sdk');
    assert.equal(defaultNavForConnection(byId('oauth')), 'oauth-apps');
  });

  it('marks Make and Zapier coming soon, n8n live', () => {
    assert.deepEqual([...AUTOMATION_CHILD_IDS], [
      'n8n',
      'zapier',
      'make',
      'webhooks',
      'rss',
    ]);
    assert.equal(byId('n8n').soon, undefined);
    assert.equal(byId('n8n').exampleKind, 'workflow');
    assert.equal(byId('make').soon, true);
    assert.equal(byId('make').exampleKind, 'http');
    assert.equal(byId('zapier').soon, true);
    assert.match(byId('make').steps[1].code || '', /^Authorization: test-key$/);
    assert.doesNotMatch(byId('make').steps[1].code || '', /Bearer/);
    assert.deepEqual(
      connectionsForNav(catalog, 'automation').map((c) => c.id),
      ['n8n', 'zapier', 'make']
    );
    assert.deepEqual(
      CONNECT_NAV_CONNECTORS.map((n) => n.id),
      ['all']
    );
    assert.equal(CONNECT_NAV_CONNECTORS[0].labelDefault, 'Connectors');
    assert.deepEqual(
      CONNECT_AUTOMATION_SHORTCUTS.map((x) => x.id),
      ['n8n', 'zapier', 'make']
    );
    assert.equal(isAutomationShortcut('n8n'), true);
    assert.equal(isAutomationShortcut('webhooks'), false);
    assert.deepEqual(
      CONNECT_SETTINGS_EXITS.map((x) => x.id),
      ['webhooks', 'rss']
    );
    assert.equal(settingsExitHref('webhooks'), '/settings?tab=webhooks');
    assert.equal(settingsExitHref('rss'), '/settings?tab=autopost');
    assert.equal(settingsExitHref('autopost'), '/settings?tab=autopost');
    assert.equal(resolveConnectorId('autopost'), 'rss');
    assert.equal(resolveConnectorId('rss-autopost'), 'rss');
  });

  it('uses Gemini url with type http and the current ChatGPT Plugins path', () => {
    const gemini = byId('gemini');
    const geminiCode = gemini.steps.map((s) => s.code).join('\n');
    assert.match(geminiCode, /"url"/);
    assert.match(geminiCode, /"type": "http"/);
    assert.doesNotMatch(geminiCode, /"httpUrl"/);
    assert.doesNotMatch(gemini.intro, /reserved for SSE/);
    assert.match(gemini.intro, /httpUrl key still works but is deprecated/);
    assert.match(gemini.intro, /not gemini\.google\.com/);

    const chatgpt = byId('chatgpt');
    const chatgptSteps = chatgpt.steps.map((s) => s.detail).join('\n');
    assert.match(chatgpt.intro, /Developer mode/);
    assert.match(chatgpt.intro, /chatgpt\.com\/plugins/);
    assert.match(chatgpt.intro, /not in the ChatGPT app store/);
    assert.doesNotMatch(chatgpt.intro, /Older builds/);
    assert.match(chatgptSteps, /Settings → Security and login → Developer mode/);
    assert.match(chatgptSteps, /chatgpt\.com\/plugins and press \+/);
    assert.match(chatgptSteps, /No Authentication/);
    assert.match(chatgptSteps, /\+ → Developer mode/);
    assert.doesNotMatch(chatgptSteps, /Apps → Create|Older builds/);
    assert.match(chatgptSteps, /Do not search the app store/);
    assert.match(chatgpt.info || '', /integrationSchedulePostTool may stay blocked/);
    assert.match(chatgpt.info || '', /not listed in the ChatGPT app store/i);
  });

  it('says 21 tools, 20 on the sign-in address, and points keys at Connections → API Keys', () => {
    const other = byId('other-mcp');
    assert.match(other.intro, /21 tools/);
    assert.match(other.intro, /Connections → API Keys \(workspace admins only\)/);
    const signIn = other.steps.find((s) => /sign in/i.test(s.title));
    assert.equal(signIn?.code, 'https://api.postqueen.ai/mcp-oauth-dynamic');
    assert.match(signIn?.detail || '', /20 tools, all but ask_postqueen/);
    assert.match(signIn?.detail || '', /Not tested by PostQueen yet/);
    assert.match(byId('gemini').steps.map((s) => s.detail).join('\n'), /21 tools/);
    const text = JSON.stringify(catalog);
    assert.doesNotMatch(text, /Settings → API Keys/);
    assert.doesNotMatch(text, /\b1[4-7] tools\b/);
    const claude = byId('claude-apps');
    assert.match(
      claude.steps.map((s) => s.detail).join('\n'),
      /mcp-remote/
    );
    assert.equal(claude.docs.length, 1);
    assert.match(claude.docs[0].href, /\/mcp\/clients\/claude$/);
    assert.ok(!claude.docs.some((d) => /hub/i.test(d.label)));
    assert.ok(!(claude.paths || []).length);
    const claudeHrefs = claude.docs.map((d) => d.href).join('\n');
    assert.doesNotMatch(
      claudeHrefs,
      /claude\.com\/connectors|claude\.ai\/directory/
    );
    assert.match(claude.intro, /not in Anthropic/);
    assert.match(claude.intro, /paste our public MCP URL/);
    assert.match(claude.info || '', /Not listed at claude\.com\/connectors/);
    assert.match(claude.info || '', /mobile apps is in beta/);
    assert.match(claude.info || '', /Do not search the directory/);
    assert.match(
      claude.steps.map((s) => s.detail).join('\n'),
      /Do not browse Connectors/
    );
    assert.doesNotMatch(
      claude.steps.map((s) => s.title).join('\n'),
      /Connect Claude Desktop|Connect claude\.ai/
    );
  });

  it('keeps Claude chat and Claude Code as separate products', () => {
    const claude = byId('claude-apps');
    const code = byId('claude-code');
    assert.equal(claude.section, 'featured');
    assert.equal(code.section, 'agents');
    assert.ok(!FEATURED_IDS.includes('claude-code' as never));
    assert.match(claude.intro, /Claude Code is a different product/);
    assert.match(claude.intro, /Codex vs ChatGPT/);
    assert.match(claude.info || '', /does not install Claude Code/);
    assert.ok(!claude.steps.some((s) => /claude mcp add/i.test(s.code || '')));
    assert.match(code.intro, /not claude\.ai or Claude Desktop/);
    assert.match(code.intro, /Codex vs ChatGPT/);
    assert.match(
      code.steps.map((s) => s.code || '').join('\n'),
      /claude mcp add --transport http/
    );
    assert.match(code.info || '', /claude_desktop_config\.json/);
    assert.match(code.info || '', /does not replace that command/);
    assert.equal(resolveConnectorId('claude-code'), 'claude-code');
    assert.equal(resolveConnectorId('claude code'), 'claude-code');
  });

  it('keeps ChatGPT and Codex as separate products', () => {
    const chatgpt = byId('chatgpt');
    const codex = byId('codex');
    assert.equal(chatgpt.section, 'featured');
    assert.equal(codex.section, 'agents');
    assert.match(chatgpt.intro, /Codex is a different product/);
    assert.match(chatgpt.info || '', /does not install Codex/);
    assert.match(codex.intro, /not ChatGPT/);
  });

  it('keeps Grok chat and Grok Bot as separate products', () => {
    const grok = byId('grok');
    const grokBot = byId('grok-bot');
    assert.equal(grok.method, 'MCP');
    assert.equal(grokBot.method, 'MCP');
    assert.ok(!grok.steps.some((s) => /Grok Bot/i.test(s.title)));
    assert.match(grok.intro, /Grok Bot and Grok Build are different products/);
    assert.match(grok.intro, /not in xAI/);
    assert.match(grok.info || '', /does not install PostQueen on Grok Bot or Grok Build/);
    assert.match(grok.steps.map((s) => s.detail).join('\n'), /grok\.com\/connectors/);
    assert.doesNotMatch(grok.intro, /iOS\/Android|Settings → Connectors|\+ → Connectors/);
    assert.match(
      grok.steps.map((s) => s.detail).join('\n'),
      /Do not pick a catalog connector/
    );
    assert.match(grokBot.intro, /not grok\.com chat/);
    assert.doesNotMatch(grokBot.intro, /grok\.com\/connectors first/);
    assert.match(
      grokBot.steps.map((s) => s.detail).join('\n'),
      /secure prompt, never into the chat/
    );
    assert.equal(
      grokBot.steps[0].code,
      'Connect PostQueen as an MCP server at https://api.postqueen.ai/mcp'
    );
    assert.doesNotMatch(
      grokBot.steps.map((s) => s.code || '').join('\n'),
      /test-key/
    );
    assert.match(grokBot.info || '', /not a Grok Bot marketplace plugin/);
    assert.match(grokBot.info || '', /Plugins → Yours/);
    assert.equal(resolveConnectorId('grok-bot'), 'grok-bot');
  });

  it('keeps Grok Build as a third Grok product with grok mcp add', () => {
    const grok = byId('grok');
    const grokBot = byId('grok-bot');
    const grokBuild = byId('grok-build');
    assert.equal(grok.section, 'featured');
    assert.equal(grokBot.section, 'bots');
    assert.equal(grokBuild.section, 'agents');
    assert.ok(!FEATURED_IDS.includes('grok-build' as never));
    assert.match(grok.intro, /Grok Build are different products/);
    assert.match(grokBot.intro, /not Grok Build/);
    assert.match(grokBuild.intro, /not grok\.com chat and not Grok Bot/);
    assert.match(grokBuild.intro, /Claude Code vs Claude/);
    assert.match(
      grokBuild.steps.map((s) => s.code || '').join('\n'),
      /grok mcp add --transport http/
    );
    assert.match(grokBuild.info || '', /does not replace grok mcp add/);
    assert.doesNotMatch(grokBuild.intro, /grok\.com\/connectors first/);
    assert.equal(resolveConnectorId('grok-build'), 'grok-build');
    assert.equal(resolveConnectorId('grok-cli'), 'grok-build');
    assert.equal(resolveConnectorId('grok build'), 'grok-build');
  });

  it('uses the official VS Code, Devin Desktop and Zed JSON keys, not Cursor mcpServers', () => {
    const vscode = byId('vscode');
    const devin = byId('devin-desktop');
    const zed = byId('zed');
    const cursor = byId('cursor');
    const vscodeJson = vscode.steps.map((s) => s.code || '').join('\n');
    const devinJson = devin.steps.map((s) => s.code || '').join('\n');
    const zedJson = zed.steps.map((s) => s.code || '').join('\n');

    assert.match(vscodeJson, /"servers"/);
    assert.match(vscodeJson, /"type": "http"/);
    assert.doesNotMatch(vscodeJson, /mcpServers/);
    assert.match(vscode.intro, /not Cursor/);
    assert.match(vscode.info || '', /Copilot CLI is a different product/);
    assert.match(
      vscode.steps.map((s) => s.detail).join('\n'),
      /Do not look for PostQueen in an extension marketplace/
    );

    assert.equal(devin.name, 'Devin Desktop');
    assert.match(devinJson, /devin mcp add -s user postqueen/);
    assert.match(devinJson, /"url"/);
    assert.doesNotMatch(devinJson, /"serverUrl"/);
    assert.match(devin.intro, /~\/\.config\/devin\/mcp_config\.json/);
    assert.match(devin.info || '', /Devin Local/);
    assert.match(
      devin.steps.map((s) => s.detail).join('\n'),
      /not in the Devin Desktop marketplace/
    );
    // the current name only: no old name, rename note, old icon or old docs path
    assert.doesNotMatch(JSON.stringify(catalog), /windsurf|cascade|formerly/i);

    assert.match(cursor.intro, /not in the Cursor Marketplace/);
    assert.match(
      cursor.steps.map((s) => s.detail).join('\n'),
      /Do not search the Cursor Marketplace/
    );

    assert.match(zedJson, /"context_servers"/);
    assert.match(zedJson, /Authorization/);
    assert.doesNotMatch(zedJson, /mcpServers/);
    assert.match(zed.intro, /context_servers/);
    assert.doesNotMatch(zed.intro, /OAuth/);
    assert.match(zed.info || '', /OAuth/);
    assert.match(zed.info || '', /only when a server answers 401/);
    assert.doesNotMatch(zed.info || '', /not enough on its own/);

    const other = byId('other-mcp');
    assert.match(other.note || '', /Cline, Continue, Goose/);
    assert.equal(resolveConnectorId('vs-code'), 'vscode');
    assert.equal(resolveConnectorId('devin-desktop'), 'devin-desktop');
    assert.equal(resolveConnectorId('devin'), 'devin-desktop');
    // links written before the rename
    assert.equal(resolveConnectorId('windsurf'), 'devin-desktop');
    assert.equal(resolveConnectorId('cascade'), 'devin-desktop');
    assert.equal(resolveConnectorId('zed'), 'zed');
  });

  it('matches chat-channel docs: CLI first, then per-app pairing', () => {
    const whatsapp = byId('whatsapp');
    const telegram = byId('telegram');
    const slack = byId('slack-chat');
    const discord = byId('discord-chat');
    const whatsappText = whatsapp.steps
      .map((s) => `${s.detail || ''} ${s.code || ''}`)
      .join('\n');
    const telegramText = telegram.steps
      .map((s) => `${s.detail || ''} ${s.code || ''}`)
      .join('\n');
    const slackText = slack.steps
      .map((s) => `${s.detail || ''} ${s.code || ''}`)
      .join('\n');
    const discordText = discord.steps
      .map((s) => `${s.detail || ''} ${s.code || ''}`)
      .join('\n');

    assert.match(whatsappText, /npm install -g postqueen/);
    assert.match(whatsappText, /channels add --channel whatsapp/);
    assert.match(whatsappText, /channels login --channel whatsapp/);
    assert.match(telegramText, /BotFather/);
    assert.match(telegramText, /TELEGRAM_BOT_TOKEN/);
    assert.match(slackText, /@openclaw\/slack/);
    assert.match(discordText, /Message Content Intent/);
    assert.match(discordText, /@openclaw\/discord/);
    assert.equal(discord.examples?.[0]?.tool, undefined);
    assert.match(discord.examples?.[0]?.code || '', /posts:create/);
  });

  it('installs the CLI for skill bots and offers their native MCP route second', () => {
    const openclaw = byId('openclaw');
    const hermes = byId('hermes');
    assert.match(
      openclaw.steps.map((s) => s.code || '').join('\n'),
      /npm install -g postqueen/
    );
    assert.match(
      openclaw.steps.map((s) => s.code || '').join('\n'),
      /openclaw onboard/
    );
    assert.equal(openclaw.examples?.[0]?.tool, undefined);
    assert.match(openclaw.examples?.[0]?.code || '', /posts:create/);
    assert.equal(
      hermes.steps.find((s) => s.title === 'Check it worked')?.code,
      'postqueen integrations:list'
    );
    assert.doesNotMatch(
      hermes.steps.map((s) => s.code || '').join('\n'),
      /hermes tools list/
    );
    assert.match(
      hermes.steps.map((s) => s.code || '').join('\n'),
      /external_dirs/
    );
    assert.equal(hermes.examples?.[0]?.tool, undefined);

    const openclawCode = openclaw.steps.map((s) => s.code || '').join('\n');
    assert.match(openclawCode, /openclaw mcp set postqueen '/);
    assert.match(openclawCode, /"transport":"streamable-http"/);
    assert.match(openclawCode, /openclaw mcp probe postqueen/);
    assert.doesNotMatch(openclaw.intro, /not MCP/);
    assert.match(
      hermes.steps.map((s) => s.code || '').join('\n'),
      /mcp_servers:\n  postqueen:\n    url: /
    );
    assert.match(
      hermes.steps.map((s) => s.detail || '').join('\n'),
      /\/reload-mcp/
    );
  });

  it('adds Claude Cowork through the same custom connector as Claude', () => {
    const cowork = byId('claude-cowork');
    assert.equal(cowork.method, 'MCP');
    assert.match(cowork.intro, /same custom connector as the Claude card/);
    assert.match(cowork.intro, /Pro, Max, Team and Enterprise plans, not Free/);
    assert.match(
      cowork.steps.map((s) => s.detail).join('\n'),
      /Customize → Connectors → \+ → Add custom connector/
    );
    assert.equal(cowork.steps[0].code, 'https://api.postqueen.ai/mcp/test-key');
    assert.equal(resolveConnectorId('cowork'), 'claude-cowork');
    assert.equal(resolveConnectorId('claude cowork'), 'claude-cowork');
  });

  it('states CLI, API and OAuth capabilities without mixing surfaces', () => {
    assert.match(byId('cli').intro, /17 commands/);
    assert.match(byId('cli').info || '', /on the API and on MCP/);
    assert.doesNotMatch(byId('cli').info || '', /not on MCP/);
    assert.match(
      byId('cli').steps.map((s) => s.detail || '').join('\n'),
      /logs in with the API key only/
    );
    assert.doesNotMatch(
      byId('cli').steps.map((s) => s.detail || '').join('\n'),
      /auth:login|device flow/
    );
    assert.match(byId('cli').intro, /does not generate video/);
    assert.match(byId('api').intro, /generate video/);
    assert.match(byId('api').intro, /Image generation is MCP only/);
    assert.match(byId('oauth').intro, /pos_/);
    assert.match(byId('oauth').intro, /Bearer token on \/mcp/);
    assert.doesNotMatch(byId('oauth').intro, / and the CLI/);
    assert.match(byId('zapier').intro, /Professional/);
    const codex = byId('codex');
    assert.equal(codex.method, 'MCP');
    assert.match(codex.steps[0].code || '', /^codex mcp add postqueen --url /);
    assert.match(
      codex.steps.map((s) => s.detail || '').join('\n'),
      /network access turned off by default/
    );
    assert.equal(
      byId('gemini').steps.find((s) => s.title === 'Check it worked')?.code,
      '/mcp'
    );
  });

  it('says the Muse app cannot take PostQueen by URL yet, without promising it', () => {
    const muse = byId('muse');
    assert.match(muse.intro, /cannot be added to it by URL yet/);
    assert.match(muse.intro, /not tested by PostQueen yet/);
    assert.match(muse.intro, /Muse Code is a separate product/);
    assert.doesNotMatch(
      `${muse.short} ${muse.intro} ${muse.info} ${muse.steps.map((s) => s.detail).join(' ')}`,
      /coming soon|will add|when Meta ships/i
    );
    assert.equal(muse.cred, 'none');
  });

  it('adds Perplexity Computer, NanoClaw and Paperclip as not tested yet', () => {
    const perplexity = byId('perplexity-computer');
    const nanoclaw = byId('nanoclaw');
    const paperclip = byId('paperclip');
    for (const item of [perplexity, nanoclaw, paperclip]) {
      assert.equal(item.method, 'MCP');
      assert.match(item.info || '', /docs, not tested by PostQueen yet/);
      assert.match(
        item.steps.map((s) => s.detail || '').join('\n'),
        /Connections → API Keys \(workspace admins only\)/
      );
    }
    assert.equal(perplexity.steps[1].code, 'https://api.postqueen.ai/mcp/test-key');
    assert.match(perplexity.steps[1].detail || '', /Authentication to None/);
    const nanoclawCode = nanoclaw.steps.map((s) => s.code || '').join('\n');
    assert.match(
      nanoclawCode,
      /onecli secrets create .*--value "test-key" --host-pattern api\.postqueen\.ai /
    );
    assert.match(
      nanoclawCode,
      /ncl groups config add-mcp-server --id YOUR_GROUP_ID --name postqueen --url https:\/\/api\.postqueen\.ai\/mcp\n/
    );
    assert.doesNotMatch(nanoclawCode, /\/mcp\/test-key/);
    assert.equal(paperclip.steps[0].code, 'https://api.postqueen.ai/mcp');
    assert.match(paperclip.steps[1].detail || '', /without the word Bearer/);
    assert.equal(
      paperclip.steps.at(-1)?.code,
      'https://api.postqueen.ai/mcp-oauth-dynamic'
    );
    assert.equal(resolveConnectorId('perplexity'), 'perplexity-computer');
  });

  it('keeps catalog shorts dash-free for search, without a card-length cap', () => {
    for (const item of all) {
      assert.ok(item.short.length > 0, `${item.id} is missing a short`);
      assert.doesNotMatch(
        item.short,
        /[—–]| - /,
        `${item.id} short has a dash: ${item.short}`
      );
    }
    assert.match(byId('openclaw').short, /bot you host/i);
    assert.doesNotMatch(byId('openclaw').short, /terminal/i);
    assert.doesNotMatch(byId('openclaw').intro, /from your terminal/i);
    assert.match(byId('openclaw').intro, /WhatsApp/);
    for (const item of all) {
      assert.doesNotMatch(
        item.intro,
        /[—–]| - /,
        `${item.id} intro has a dash: ${item.intro}`
      );
    }
  });

  it('shows a surface-matched usage example, not the same three chat bubbles', () => {
    assert.equal(byId('claude-apps').exampleKind, 'chat');
    assert.equal(byId('chatgpt').exampleKind, 'chat');
    assert.equal(byId('openclaw').exampleKind, 'bot');
    assert.equal(byId('whatsapp').exampleKind, 'bot');
    assert.equal(byId('cursor').exampleKind, 'agent');
    assert.equal(byId('vscode').exampleKind, 'agent');
    assert.equal(byId('claude-code').exampleKind, 'cli');
    assert.equal(byId('codex').exampleKind, 'cli');
    assert.equal(byId('cli').exampleKind, 'cli');
    assert.equal(byId('sdk').exampleKind, 'api');
    assert.equal(byId('muse-code').exampleKind, 'agent');

    assert.equal(byId('claude-code').examples?.[0]?.code, 'claude');
    assert.doesNotMatch(byId('claude-code').examples?.[0]?.code || '', /mcp list/);
    assert.equal(byId('grok-build').examples?.[0]?.code, 'grok');
    assert.match(byId('codex').examples?.[0]?.code || '', /^codex "/);
    assert.equal(byId('cli').examples?.[0]?.code, 'postqueen integrations:list');
    assert.match(byId('sdk').examples?.[0]?.code || '', /new PostQueen/);
    assert.ok(!byId('muse').examples?.length);
    assert.ok(!byId('oauth').examples?.length);

    const bodies = all
      .flatMap((item) => (item.examples || []).map((ex) => `${item.id}:${ex.body}`));
    const justBodies = all.flatMap((item) => (item.examples || []).map((ex) => ex.body));
    const dupes = justBodies.filter((b, i) => justBodies.indexOf(b) !== i);
    assert.deepEqual(dupes, [], `duplicate example bodies: ${dupes.join(', ')}`);
    assert.ok(
      (byId('whatsapp').examples?.length || 0) >= 3,
      'WhatsApp should show several sample messages'
    );
    assert.deepEqual(
      (byId('whatsapp').examples || []).map((e) => e.title),
      ['One channel: Instagram', 'One channel: X', 'Several channels']
    );
    const wa = (byId('whatsapp').examples || []).map((e) => `${e.body} ${e.reply}`).join('\n');
    assert.match(wa, /Voice note/);
    assert.match(wa, /Instagram/);
    assert.match(wa, /\bX\b/);
    assert.match(wa, /LinkedIn/);
    const igOnly = (byId('whatsapp').examples || []).filter((e) =>
      /Instagram/i.test(`${e.body} ${e.reply}`) && !/\bX\b/.test(e.body) && !/LinkedIn/.test(e.body)
    );
    assert.ok(igOnly.length >= 1, 'one WhatsApp sample should be Instagram only');
    const xOnly = (byId('whatsapp').examples || []).filter((e) =>
      /\bX\b/.test(e.body) && !/Instagram/.test(e.body) && !/LinkedIn/.test(e.body)
    );
    assert.ok(xOnly.length >= 1, 'one WhatsApp sample should be X only');
    const multi = (byId('whatsapp').examples || []).filter((e) =>
      /Instagram/.test(e.body) && /\bX\b/.test(e.body) && /LinkedIn/.test(e.body)
    );
    assert.ok(multi.length >= 1, 'one WhatsApp sample should name several channels');
    const talkers = all.filter((c) =>
      ['chat', 'bot', 'agent', 'cli'].includes(c.exampleKind) && (c.examples?.length || 0) > 0
    );
    for (const item of talkers) {
      if (item.id === 'cli' || item.id === 'api' || item.id === 'sdk') continue;
      assert.ok(
        (item.examples?.length || 0) >= 3,
        `${item.id} should show three samples, not one LinkedIn bubble`
      );
      const titles = (item.examples || []).map((e) => e.title || '').join(' | ');
      assert.match(titles, /Instagram|X|Several|calendar/i, `${item.id} samples need labeled jobs`);
    }
    for (const item of all) {
      for (const ex of item.examples || []) {
        assert.doesNotMatch(
          `${ex.body} ${ex.reply || ''}`,
          /[—–]| - /,
          `${item.id} example has a dash`
        );
        assert.doesNotMatch(
          `${ex.title || ''} ${ex.body} ${ex.reply || ''}`,
          /changelog|CHANGELOG|GitHub Release|README|PR title/i,
          `${item.id} example still sounds like a developer changelog`
        );
        assert.doesNotMatch(
          ex.body,
          /Ask the client|from Copilot Chat|In Cascade,|In the Agent Panel|from Gemini CLI/i,
          `${item.id} example is a stage direction, not a prompt: ${ex.body}`
        );
        assert.doesNotMatch(
          ex.body,
          /Make a short (video|clip)|Make a visual|Make one visual|make a photo and draft|Make a cafe photo|Make a 15 second|Make a product photo/i,
          `${item.id} example is a generic make-me-a-photo prompt: ${ex.body}`
        );
      }
    }
    const mcpTools = new Set(
      all.flatMap((item) =>
        (item.examples || []).map((ex) => ex.tool).filter((tool): tool is string => !!tool)
      )
    );
    for (const need of [
      'integrationSchedulePostTool',
      'generateImageTool',
      'generateVideoTool',
      'postsListTool',
      'analyticsSummaryTool',
      'analyticsPostsTool',
    ]) {
      assert.ok(mcpTools.has(need), `catalog examples never call ${need}`);
    }
    // MCP wire names, never the in-app agent's internal ids
    const allowedTools = new Set([
      'integrationSchedulePostTool',
      'generateImageTool',
      'generateVideoTool',
      'postsListTool',
      'analyticsSummaryTool',
      'analyticsPostsTool',
      'integrationList',
      'ask_postqueen',
      'postSettingsTool',
    ]);
    for (const item of all) {
      for (const ex of item.examples || []) {
        if (!ex.tool) continue;
        assert.ok(
          allowedTools.has(ex.tool),
          `${item.id} example uses unknown tool ${ex.tool}`
        );
      }
    }
  });

  it('example replies answer the prompt, they do not teach which product this is', () => {
    const banned =
      /not Claude Code|not Codex|not ChatGPT|not Grok Build|not grok\.com|not Cursor|not the consumer Muse|Enable PostQueen from|Settings then Apps|Claude chat, not|ChatGPT web, not|Grok chat, not|Grok Bot, not|Muse Code, not|Agent mode, not|VS Code Copilot, not|Windsurf Cascade, not|used integrationSchedulePostTool|used schedulePostTool|used the skill|used the public MCP|JSON shape for the client|Same MCP URL as|Cline, Continue, Goose|httpUrl in settings|Bearer header, not only|mcp\.json|connectors form|Write tools can stay blocked|Claude Code used|grok mcp add registered/i;
    for (const item of all) {
      if (item.id === 'cli' || item.id === 'api' || item.id === 'sdk') continue;
      for (const ex of item.examples || []) {
        if (!ex.reply) continue;
        assert.doesNotMatch(
          ex.reply,
          banned,
          `${item.id} reply still talks about the product: ${ex.reply}`
        );
      }
    }
    const claudeIg = (byId('claude-apps').examples || []).find((e) =>
      /passport stamp/i.test(e.body)
    );
    assert.match(claudeIg?.reply || '', /passport/i);
    assert.match(claudeIg?.reply || '', /Instagram/i);
    assert.match(claudeIg?.reply || '', /19:00/);
    const claudeMulti = (byId('claude-apps').examples || []).find((e) =>
      /LinkedIn/.test(e.body)
    );
    assert.match(claudeMulti?.reply || '', /Instagram/);
    assert.match(claudeMulti?.reply || '', /\bX\b/);
    assert.match(claudeMulti?.reply || '', /LinkedIn/);
    assert.doesNotMatch(claudeMulti?.reply || '', /Claude Code/i);
  });

  it('maps nav filters to the job groups', () => {
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
    assert.ok(
      connectionsForNav(catalog, 'automation').some((c) => c.id === 'n8n')
    );
    assert.equal(connectionsForNav(catalog, 'api-keys').length, 0);
  });

  it('resolves legacy deep-links onto Connectors / Develop and the right card', () => {
    assert.equal(resolveConnectNavId('mcp'), 'all');
    assert.equal(resolveConnectNavId('ai-agents'), 'all');
    assert.equal(resolveConnectNavId('assistants'), 'all');
    assert.equal(resolveConnectNavId('agent-skills'), 'all');
    assert.equal(resolveConnectNavId('agents'), 'all');
    assert.equal(resolveConnectNavId('bots'), 'all');
    assert.equal(resolveConnectNavId('automation'), 'all');
    assert.equal(resolveConnectNavId('cli'), 'cli');
    assert.equal(resolveConnectNavId('api'), 'public-api');
    assert.equal(resolveConnectNavId('build'), 'public-api');
    assert.equal(resolveConnectNavId('developers'), 'oauth-apps');
    assert.equal(resolveConnectorId('claude'), 'claude-apps');
    assert.equal(resolveConnectorId('grok-bot'), 'grok-bot');
    assert.equal(resolveConnectorId('muse-app'), 'muse');
    assert.equal(resolveConnectorId('gemini-cli'), 'gemini');
    assert.equal(defaultNavForConnection(byId('n8n')), 'all');
    assert.equal(defaultNavForConnection(byId('openclaw')), 'all');
    assert.equal(defaultNavForConnection(byId('chatgpt')), 'all');
    assert.equal(defaultNavForConnection(byId('claude-code')), 'all');
    assert.equal(defaultNavForConnection(byId('vscode')), 'all');
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
