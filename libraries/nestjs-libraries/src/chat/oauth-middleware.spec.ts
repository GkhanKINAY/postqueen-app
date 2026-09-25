import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type * as http from 'node:http';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createOAuthMiddleware } from './oauth-middleware.ts';
import {
  authorizationResponseUrl,
  authorizationServerIssuer,
  joinBaseUrl,
  oauthAppIssuer,
} from './oauth-types.ts';

// The same wiring start.mcp.ts builds for each OAuth-protected MCP path
const middlewareFor = (baseUrl: string, mcpPath: string) =>
  createOAuthMiddleware({
    resourceMetadataUrl: joinBaseUrl(
      baseUrl,
      `/.well-known/oauth-protected-resource${mcpPath}`
    ),
    oauth: {
      resource: joinBaseUrl(baseUrl, mcpPath),
      authorizationServers: [joinBaseUrl(baseUrl, '/mcp-oauth')],
      validateToken: async () => ({ valid: false, error: 'invalid_token' }),
    },
    mcpPath,
  });

const fakeResponse = () => {
  const sent = {
    status: 0,
    headers: {} as Record<string, string>,
    body: '',
  };
  const res = {
    writeHead: (status: number, headers: Record<string, string> = {}) => {
      sent.status = status;
      sent.headers = headers;
    },
    end: (body = '') => {
      sent.body = body;
    },
  } as unknown as http.ServerResponse;
  return { res, sent };
};

const request = (method: string, authorization?: string) =>
  ({
    method,
    headers: authorization ? { authorization } : {},
  }) as unknown as http.IncomingMessage;

// The paths the backend sees after the proxy has stripped /api
const call = async (baseUrl: string, method: string, pathname: string) => {
  const { res, sent } = fakeResponse();
  await middlewareFor(baseUrl, '/mcp-oauth')(
    request(method),
    res,
    new URL(pathname, 'http://localhost')
  );
  return sent;
};

describe('joinBaseUrl', () => {
  it('keeps the path of a base that has one', () => {
    assert.equal(
      joinBaseUrl('https://app.postqueen.ai/api', '/mcp-oauth'),
      'https://app.postqueen.ai/api/mcp-oauth'
    );
    assert.equal(
      joinBaseUrl('https://app.postqueen.ai/api/', '/mcp-oauth'),
      'https://app.postqueen.ai/api/mcp-oauth'
    );
  });

  it('matches new URL for a base without a path', () => {
    for (const base of [
      'https://api.example.com',
      'https://api.example.com/',
      'https://api.example.com ',
    ]) {
      for (const path of [
        '/mcp-oauth',
        '/mcp-oauth-claude',
        '/.well-known/oauth-protected-resource/mcp-oauth',
      ]) {
        assert.equal(joinBaseUrl(base, path), new URL(path, base).toString());
      }
    }
  });
});

describe('OAuth discovery for an MCP resource', () => {
  it('points the 401 at metadata under the base path', async () => {
    const sent = await call('https://app.postqueen.ai/api', 'POST', '/mcp-oauth');
    assert.equal(sent.status, 401);
    assert.equal(
      sent.headers['WWW-Authenticate'],
      'Bearer resource_metadata="https://app.postqueen.ai/api/.well-known/oauth-protected-resource/mcp-oauth"'
    );
  });

  it('advertises the resource and issuer under the base path', async () => {
    const sent = await call(
      'https://app.postqueen.ai/api',
      'GET',
      '/.well-known/oauth-protected-resource'
    );
    assert.equal(sent.status, 200);
    const metadata = JSON.parse(sent.body);
    assert.equal(metadata.resource, 'https://app.postqueen.ai/api/mcp-oauth');
    assert.deepEqual(metadata.authorization_servers, [
      'https://app.postqueen.ai/api/mcp-oauth',
    ]);
  });

  it('is unchanged for a base without a path', async () => {
    const unauthorized = await call('https://api.example.com', 'POST', '/mcp-oauth');
    assert.equal(
      unauthorized.headers['WWW-Authenticate'],
      'Bearer resource_metadata="https://api.example.com/.well-known/oauth-protected-resource/mcp-oauth"'
    );

    const metadata = JSON.parse(
      (await call('https://api.example.com', 'GET', '/.well-known/oauth-protected-resource')).body
    );
    assert.equal(metadata.resource, 'https://api.example.com/mcp-oauth');
    assert.deepEqual(metadata.authorization_servers, ['https://api.example.com/mcp-oauth']);
  });

  it('defaults to the RFC 9728 path-inserted metadata url', async () => {
    const { res, sent } = fakeResponse();
    await createOAuthMiddleware({
      oauth: {
        resource: 'https://api.example.com/mcp-oauth',
        authorizationServers: ['https://api.example.com/mcp-oauth'],
      },
      mcpPath: '/mcp-oauth',
    })(request('POST'), res, new URL('/mcp-oauth', 'http://localhost'));
    assert.equal(
      sent.headers['WWW-Authenticate'],
      'Bearer resource_metadata="https://api.example.com/.well-known/oauth-protected-resource/mcp-oauth"'
    );
  });

  it('still demands a token on the mcp path', async () => {
    const { res, sent } = fakeResponse();
    const result = await middlewareFor('https://app.postqueen.ai/api', '/mcp-oauth')(
      request('POST', 'Bearer pos_unknown'),
      res,
      new URL('/mcp-oauth', 'http://localhost')
    );
    assert.equal(result.proceed, false);
    assert.equal(sent.status, 401);
  });
});

describe('RFC 9207 issuer', () => {
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

  it('builds each issuer under the backend base path', () => {
    setEnv('NEXT_PUBLIC_BACKEND_URL', 'https://app.postqueen.ai/api');
    setEnv('NEXT_PUBLIC_OVERRIDE_BACKEND_URL', undefined);
    assert.equal(
      authorizationServerIssuer('/mcp-oauth-dynamic'),
      'https://app.postqueen.ai/api/mcp-oauth-dynamic',
    );
    assert.equal(
      authorizationServerIssuer('/mcp-oauth-chatgpt'),
      'https://app.postqueen.ai/api/mcp-oauth-chatgpt',
    );
  });

  it('prefers the override backend url, like the rest of the discovery', () => {
    setEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3000');
    setEnv('NEXT_PUBLIC_OVERRIDE_BACKEND_URL', 'https://api.example.com/');
    assert.equal(
      authorizationServerIssuer('/mcp-oauth-dynamic'),
      'https://api.example.com/mcp-oauth-dynamic',
    );
  });

  it('names the DCR issuer for dynamic clients and the other one for static apps', () => {
    setEnv('NEXT_PUBLIC_BACKEND_URL', 'https://app.postqueen.ai/api');
    setEnv('NEXT_PUBLIC_OVERRIDE_BACKEND_URL', undefined);
    assert.equal(
      oauthAppIssuer({ dynamic: true }),
      authorizationServerIssuer('/mcp-oauth-dynamic'),
    );
    assert.equal(
      oauthAppIssuer({ dynamic: false }),
      authorizationServerIssuer('/mcp-oauth-chatgpt'),
    );
  });

  it('is what the metadata advertises and what both redirects carry', () => {
    const read = (rel: string) =>
      readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
    const startMcp = read('./start.mcp.ts');
    const controller = read(
      '../../../../apps/backend/src/api/routes/oauth.controller.ts',
    );

    assert.match(
      startMcp,
      /issuer: authorizationServerIssuer\('\/mcp-oauth-chatgpt'\)/,
    );
    assert.match(
      startMcp,
      /issuer: authorizationServerIssuer\('\/mcp-oauth-dynamic'\)/,
    );
    assert.match(
      startMcp,
      /authorization_response_iss_parameter_supported: true/,
    );

    assert.match(controller, /const iss = oauthAppIssuer\(app\);/);
    assert.equal(
      controller.match(
        /authorizationResponseUrl\(redirectTarget, \{[^}]*\biss,\s*\}\)/g,
      )?.length,
      2,
    );
  });
});

describe('authorizationResponseUrl', () => {
  const iss = 'https://app.postqueen.ai/api/mcp-oauth-dynamic';

  it('adds code, state and an encoded iss', () => {
    const url = authorizationResponseUrl(
      'http://localhost:7777/oauth/callback',
      {
        code: 'abc',
        state: 'xyz',
        iss,
      },
    );
    assert.equal(
      url,
      'http://localhost:7777/oauth/callback?code=abc&state=xyz&iss=https%3A%2F%2Fapp.postqueen.ai%2Fapi%2Fmcp-oauth-dynamic',
    );
    assert.equal(new URL(url).searchParams.get('iss'), iss);
  });

  it('keeps the query the redirect uri already has', () => {
    const url = new URL(
      authorizationResponseUrl('https://client.example.com/cb?tenant=a&x=1', {
        code: 'abc',
        state: 'xyz',
        iss,
      }),
    );
    assert.equal(url.origin + url.pathname, 'https://client.example.com/cb');
    assert.deepEqual(
      [...url.searchParams],
      [
        ['tenant', 'a'],
        ['x', '1'],
        ['code', 'abc'],
        ['state', 'xyz'],
        ['iss', iss],
      ],
    );
  });

  it('carries iss on an error response and leaves out a missing state', () => {
    const url = new URL(
      authorizationResponseUrl('cursor://anysphere.cursor-mcp/oauth/callback', {
        error: 'access_denied',
        state: undefined,
        iss,
      }),
    );
    assert.equal(url.searchParams.get('error'), 'access_denied');
    assert.equal(url.searchParams.has('state'), false);
    assert.equal(url.searchParams.get('iss'), iss);
  });
});
