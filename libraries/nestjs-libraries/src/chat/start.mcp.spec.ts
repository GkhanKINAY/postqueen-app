import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const startMcp = read('./start.mcp.ts');

describe('MCP over SSE', () => {
  // An MCPServer holds a single SSE transport. A server built per request
  // never saw the stream its POSTs belonged to, and answered each with 503.
  it('sends the messages of a session to the server that opened its stream', () => {
    assert.doesNotMatch(startMcp, /new MCPServer\(serverConfig\)\.startSSE/);
    assert.match(
      startMcp,
      /sseSessions\.get\(String\(req\.query\.sessionId\)\)/,
    );
    assert.match(startMcp, /session\.id !== req\.params\.id/);
    // It forgets a session when its stream closes, and never keeps one whose
    // stream closed first
    assert.match(startMcp, /sessionId && !res\.destroyed\)/);
    assert.match(
      startMcp,
      /res\.on\('close', \(\) => sseSessions\.delete\(sessionId\)\)/,
    );
  });

  // Behind nginx's default proxy buffering (the container's own nginx) the
  // stream's events never reached the client, and every request timed out
  it('tells nginx not to buffer the stream', () => {
    assert.match(startMcp, /res\.setHeader\('X-Accel-Buffering', 'no'\)/);
  });

  // The endpoint event is a path on the client's origin
  it('keeps the base path in the address it sends messages to', () => {
    assert.match(
      startMcp,
      /const messagePath = `\$\{ssePrefix\}\/message\/\$\{req\.params\.id\}`/,
    );
  });
});

describe('MCP over streamable HTTP', () => {
  // Mastra's dual-era mode serves 2026-07-28 clients natively and 2025-era
  // ones through the SDK's stateless fallback; it refuses response-mode
  // options, so enableJsonResponse has to stay out
  it('runs the three streamable servers in dual-era mode', () => {
    assert.equal(startMcp.match(/protocolVersion: '2026-07-28'/g)?.length, 3);
    assert.doesNotMatch(startMcp, /enableJsonResponse/);
  });

  it('leaves the SSE server on the 2025 era', () => {
    assert.match(startMcp, /sseServer = new MCPServer\(serverConfig\)/);
    const serverConfig = startMcp.match(/const serverConfig = \{[\s\S]*?\n  \};/)?.[0];
    assert.ok(serverConfig, 'serverConfig not found');
    assert.doesNotMatch(serverConfig, /protocolVersion/);
  });

  it('ends a subscriptions/listen stream instead of holding it open', () => {
    assert.equal(startMcp.match(/endListenStream\(req, res\);/g)?.length, 3);
  });
});

// Every tool of the list by the name MCP shows, and whether it can be left
// out (`available()`). The list cannot be loaded under tsx (an import maps to
// a .d.ts), so it is read.
const listedTools = () => {
  const list = read('./tools/tool.list.ts');
  const files = new Map(
    [
      ...list.matchAll(
        /import \{ (\w+) \} from '(?:@gitroom\/nestjs-libraries\/chat\/tools\/|\.\/)([\w.]+)';/g,
      ),
    ].map((m) => [m[1], m[2]]),
  );
  const body = list.match(/export const toolList = \[([\s\S]*?)\];/)?.[1];
  assert.ok(body, 'toolList not found');
  return body
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((cls) => {
      assert.ok(files.has(cls), `no import for ${cls}`);
      const source = read(`./tools/${files.get(cls)}.ts`);
      const name = source.match(/^\s+name = '(\w+)';/m)?.[1];
      assert.ok(name, `no name in ${cls}`);
      return { name, optional: /^\s+available\(\) \{/m.test(source) };
    });
};

describe('MCP tool lists', () => {
  // The clipping tools are the only ones an install can lack; clipping is
  // off in production, and the counts below are without them
  it('leaves out only the clipping tools when clipping is off', () => {
    const tools = listedTools();
    assert.equal(tools.length, 30);
    assert.deepEqual(
      tools.filter((t) => t.optional).map((t) => t.name),
      ['clippingTool', 'clippingStatusTool', 'clippingWidgetTicketTool'],
    );
  });

  // The app, the docs and the site publish these counts, so a tool added or
  // dropped breaks this test until they are updated with it
  it('serves 28 tools with a key, 27 with sign-in and 22 to the Claude directory', () => {
    const tools = listedTools()
      .filter((t) => !t.optional)
      .map((t) => t.name);
    const hidden = [
      ...(startMcp.match(/const claudeHiddenTools = \[([\s\S]*?)\];/)?.[1] || '').matchAll(
        /'(\w+)'/g,
      ),
    ].map((m) => m[1]);
    // and ask_postqueen on top with a key: 28
    assert.equal(tools.length, 27);
    assert.equal(tools.filter((name) => !hidden.includes(name)).length, 22);
  });

  // MCPServer's own `agents` option answered every question with the whole
  // run; ask_postqueen is a tool of its own, on the servers a key and the SSE
  // endpoint reach, and never on the directory-facing ones
  it('gives ask_postqueen to the key and SSE servers only', () => {
    assert.doesNotMatch(startMcp, /agents:/);
    assert.match(
      startMcp,
      /const serverConfig = \{\s*name: 'PostQueen MCP',\s*version: '1\.0\.0',\s*tools: \{ \.\.\.tools, ask_postqueen: askAgentTool\('postqueen', agent\) \},\s*appResources,\s*\};/,
    );
    assert.match(
      startMcp,
      /const server = new MCPServer\(\{\s*\.\.\.serverConfig,\s*protocolVersion: '2026-07-28',\s*\}\);/,
    );
    assert.match(startMcp, /sseServer = new MCPServer\(serverConfig\)/);
    // /mcp and /mcp/:id
    assert.equal(startMcp.match(/await server\.startHTTP\(/g)?.length, 2);
    assert.match(
      startMcp,
      /const oauthServer = new MCPServer\(\{[^}]*protocolVersion: '2026-07-28',\s*tools,\s*appResources,\s*\}\);/,
    );
    assert.match(
      startMcp,
      /const claudeOauthServer = new MCPServer\(\{[^}]*tools: claudeTools,\s*appResources: claudeAppResources,\s*\}\);/,
    );
  });
});
