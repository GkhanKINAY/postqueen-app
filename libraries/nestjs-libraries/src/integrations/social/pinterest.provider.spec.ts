import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PinterestProvider } from './pinterest.provider.ts';

describe('Pinterest description', () => {
  it('takes the 800 characters Create Pin allows, on the server', () => {
    assert.equal(new PinterestProvider().maxLength(), 800);
  });

  it('and in the editor', () => {
    const component = readFileSync(
      fileURLToPath(
        new URL(
          '../../../../../apps/frontend/src/components/new-launch/providers/pinterest/pinterest.provider.tsx',
          import.meta.url
        )
      ),
      'utf8'
    );
    assert.match(component, /maximumCharacters: 800,/);
  });
});

describe('Pinterest API host', () => {
  const realFetch = globalThis.fetch;
  const realHost = process.env.PINTEREST_API_URL;
  let calls: string[];

  beforeEach(() => {
    calls = [];
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      const body = String(url).includes('/oauth/token')
        ? {
            access_token: 'token',
            refresh_token: 'refresh',
            expires_in: 3600,
            scope: new PinterestProvider().scopes.join(','),
          }
        : String(url).includes('/boards')
        ? { items: [{ id: 'b1', name: 'Travel in Japan' }] }
        : { id: 'u1', username: 'forceplayco', profile_image: '' };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    if (realHost === undefined) delete process.env.PINTEREST_API_URL;
    else process.env.PINTEREST_API_URL = realHost;
  });

  it('calls production when PINTEREST_API_URL is not set', async () => {
    delete process.env.PINTEREST_API_URL;
    await new PinterestProvider().boards('token');
    assert.deepEqual(calls, [
      'https://api.pinterest.com/v5/boards?page_size=250',
    ]);
  });

  it('sends the token exchange and every later call to the sandbox when it is set', async () => {
    process.env.PINTEREST_API_URL = 'https://api-sandbox.pinterest.com/';
    const provider = new PinterestProvider();
    await provider.authenticate({ code: 'code', codeVerifier: '', refresh: '' });
    await provider.boards('token');
    assert.deepEqual(calls, [
      'https://api-sandbox.pinterest.com/v5/oauth/token',
      'https://api-sandbox.pinterest.com/v5/user_account',
      'https://api-sandbox.pinterest.com/v5/boards?page_size=250',
    ]);
  });

  it('has no API address written out anywhere else in the provider', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./pinterest.provider.ts', import.meta.url)),
      'utf8'
    );
    assert.equal(source.match(/api\.pinterest\.com/g)?.length, 1);
  });
});
