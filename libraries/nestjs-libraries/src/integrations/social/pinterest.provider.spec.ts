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

  it('calls production when compose passes it empty', async () => {
    process.env.PINTEREST_API_URL = '';
    await new PinterestProvider().boards('token');
    assert.deepEqual(calls, [
      'https://api.pinterest.com/v5/boards?page_size=250',
    ]);
  });

  it('sends the token exchange and every later call to the sandbox when it is set', async () => {
    process.env.PINTEREST_API_URL = 'https://api-sandbox.pinterest.com/';
    const provider = new PinterestProvider();
    await provider.authenticate({
      code: 'code',
      codeVerifier: '',
      refresh: '',
    });
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

describe('Pinterest errors', () => {
  const provider = new PinterestProvider();

  it("retries Pinterest's temporary error 2787", () => {
    assert.equal(
      provider.handleErrors(
        JSON.stringify({ code: 2787, message: 'Sorry! Something went wrong on our end.' })
      )?.type,
      'retry'
    );
  });

  it('talks about the board, not its ID', () => {
    for (const body of [
      `{"message":"'abc' does not match '^\\\\d+$'"}`,
      '{"code":2,"message":"Board not found."}',
      '{"code":29,"message":"You are not permitted to access that resource."}',
    ]) {
      const answer = provider.handleErrors(body);
      assert.equal(answer?.type, 'bad-body', body);
      assert.doesNotMatch(String(answer?.value), /board ID/, body);
    }
  });
});

describe('Pinterest video pins', () => {
  const provider = new PinterestProvider();
  const video = { path: 'https://cdn.test/a.mp4' };
  const cover = { path: 'https://cdn.test/a.jpg' };
  const message = 'A Pinterest video pin needs one video and one cover image';

  it('need one video and one cover image', async () => {
    assert.equal(await provider.checkValidity([[video, cover]] as any), true);
    assert.equal(await provider.checkValidity([[video]] as any), message);
    assert.equal(await provider.checkValidity([[video, video]] as any), message);
    assert.equal(await provider.checkValidity([[video, cover, cover]] as any), message);
  });
});
