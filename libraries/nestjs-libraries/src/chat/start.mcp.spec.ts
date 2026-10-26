import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const startMcp = readFileSync(
  fileURLToPath(new URL('./start.mcp.ts', import.meta.url)),
  'utf8',
);

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
    assert.doesNotMatch(
      startMcp,
      /const serverConfig = \{[^}]*protocolVersion/,
    );
  });

  it('ends a subscriptions/listen stream instead of holding it open', () => {
    assert.equal(startMcp.match(/endListenStream\(req, res\);/g)?.length, 3);
  });
});
