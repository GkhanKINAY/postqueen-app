import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { BskyAgent } from '@atproto/api';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { BlueskyProvider, guardedFetch } from './bluesky.provider.ts';

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

describe('Bluesky mentions', () => {
  // Login, then the search, answered by whatever server the account named
  const search = async (service: string, accountServer?: string) => {
    process.env.JWT_SECRET ||= 'test-secret';
    globalThis.fetch = (async (input: any) => {
      const url = String(input?.url ?? input);
      const body = url.includes('createSession')
        ? {
            did: 'did:plc:x',
            handle: 'me.test',
            accessJwt: 'a',
            refreshJwt: 'r',
            // the server the account's identity names, which the agent
            // talks to from then on
            ...(accountServer && {
              didDoc: {
                '@context': ['https://www.w3.org/ns/did/v1'],
                id: 'did:plc:x',
                service: [
                  {
                    id: '#atproto_pds',
                    type: 'AtprotoPersonalDataServer',
                    serviceEndpoint: accountServer,
                  },
                ],
              },
            }),
          }
        : {
            actors: [
              {
                did: 'did:plc:y',
                handle: 'ana.test',
                displayName: 'Ana',
                avatar: 'https://cdn.test/a.jpg',
              },
            ],
          };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    const integration = {
      customInstanceDetails: AuthService.fixedEncryption(
        JSON.stringify({ service, identifier: 'me.test', password: 'p' })
      ),
    } as any;
    return new BlueskyProvider().mention(
      '',
      { query: 'ana' },
      'id',
      integration
    );
  };

  it('are cached for everyone only when bsky.social answered them', async () => {
    assert.deepEqual(await search('https://bsky.social'), [
      {
        label: 'Ana',
        id: 'ana.test',
        image: 'https://cdn.test/a.jpg',
        doNotCache: false,
      },
    ]);
    assert.equal(
      (
        await search(
          'https://bsky.social',
          'https://puffball.us-east.host.bsky.network'
        )
      )[0].doNotCache,
      false
    );
    // an account's own server can answer anything; other organizations must
    // not be shown it, also when the login went through bsky.social
    assert.equal((await search('https://pds.example'))[0].doNotCache, true);
    assert.equal(
      (await search('https://bsky.social', 'https://pds.example'))[0]
        .doNotCache,
      true
    );
    // a Bluesky name over plain HTTP is not Bluesky's server
    assert.equal(
      (await search('https://bsky.social', 'http://x.host.bsky.network'))[0]
        .doNotCache,
      true
    );
  });
});
