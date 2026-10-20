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

  // The endpoint event is a path on the client's origin
  it('keeps the base path in the address it sends messages to', () => {
    assert.match(
      startMcp,
      /const messagePath = `\$\{ssePrefix\}\/message\/\$\{req\.params\.id\}`/,
    );
  });
});
