import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { BskyAgent } from '@atproto/api';
import { guardedFetch } from './bluesky.provider.ts';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.DISABLE_SSRF_PROTECTION;
});

describe('Bluesky requests', () => {
  it('go through the SSRF-safe dispatcher, after login too', async () => {
    const seen: { url: string; dispatcher: unknown }[] = [];
    globalThis.fetch = (async (input: any, init: any) => {
      seen.push({ url: String(input?.url ?? input), dispatcher: init?.dispatcher });
      return new Response(
        JSON.stringify({ did: 'did:plc:x', availableUserDomains: [] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as typeof fetch;

    const agent = new BskyAgent({
      service: 'https://pds.example',
      fetch: guardedFetch,
    });
    await agent.com.atproto.server.describeServer();

    assert.equal(seen.length, 1);
    assert.match(seen[0].url, /^https:\/\/pds\.example\//);
    assert.ok(seen[0].dispatcher, 'no dispatcher on the request');
  });

  it('refuses an internal address a PDS could name', async () => {
    const server = createServer((_req, res) => res.end('{}'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as { port: number };
    try {
      // reachable without the guard
      assert.equal((await realFetch(`http://127.0.0.1:${port}/`)).status, 200);
      await assert.rejects(guardedFetch(`http://127.0.0.1:${port}/`));
    } finally {
      server.close();
    }
  });
});
