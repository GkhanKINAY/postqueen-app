import assert from 'node:assert/strict';
import type * as http from 'node:http';
import { describe, it } from 'node:test';
import { createOAuthMiddleware } from './oauth-middleware.ts';
import { joinBaseUrl } from './oauth-types.ts';

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
