import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  consoleWarningsAndErrorsOnly,
  scrubForSentry,
} from './sentry.scrub.ts';

// Shapes taken from what @sentry/nestjs 10.69 sent to a stand-in ingest for a
// Graph API style call (`?access_token=`) inside a sampled trace.
const graph = 'https://graph.facebook.com/v20.0/me/accounts';

describe('scrubForSentry', () => {
  it('cuts the token out of every place the SDK copies a URL to', () => {
    const transaction = {
      request: {
        url: `${graph}?access_token=SECRET&fields=id`,
        query_string: 'access_token=SECRET&fields=id',
        cookies: {},
      },
      spans: [
        {
          data: {
            'url.full': `${graph}?access_token=SECRET`,
            'http.url': `${graph}?access_token=SECRET`,
            'http.target': '/v20.0/me/accounts?access_token=SECRET',
            'url.query': '?access_token=SECRET',
            'http.query': 'access_token=SECRET',
            'url.path': '/v20.0/me/accounts',
          },
        },
      ],
      breadcrumbs: [
        { category: 'http', data: { url: graph, 'http.query': '?access_token=SECRET' } },
      ],
    };

    const out = scrubForSentry(transaction);

    assert.doesNotMatch(JSON.stringify(out), /SECRET/);
    assert.equal(out.request.url, graph);
    assert.equal(out.spans[0].data['http.target'], '/v20.0/me/accounts');
    assert.equal(out.spans[0].data['url.path'], '/v20.0/me/accounts');
    assert.equal(out.breadcrumbs[0].data.url, graph);
  });

  it('cuts a URL inside a message and a fragment token', () => {
    const out = scrubForSentry({
      message: `Request to ${graph}?access_token=SECRET failed with 400`,
      logentry: { message: 'redirected to https://app.example/cb#access_token=SECRET.' },
    });
    assert.equal(out.message, `Request to ${graph} failed with 400`);
    assert.equal(out.logentry.message, 'redirected to https://app.example/cb');
  });

  it('leaves text that is not a URL alone', () => {
    const event = {
      message: 'Is the channel connected? Reconnect it.',
      transaction: 'GET /integrations/social/:provider',
      tags: { 'organization.id': 'org_1' },
      level: 'error',
      count: 3,
    };
    assert.deepEqual(scrubForSentry(event), event);
  });

  it('keeps the source lines around a frame as they are', () => {
    const frame = {
      context_line: "  await fetch(`https://graph.facebook.com/me?access_token=${token}`);",
      pre_context: ['const load = async (token) => {'],
    };
    assert.deepEqual(scrubForSentry({ frames: [frame] }), { frames: [frame] });
  });

  it('drops the session cookie and credential headers', () => {
    // A Next.js server transaction carried the request's cookies with
    // sendDefaultPii off; signed in, that includes the `auth` session token.
    const out = scrubForSentry({
      request: {
        url: 'https://app.postqueen.ai/launches',
        cookies: { auth: 'JWT', mode: 'dark' },
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Cookie: 'auth=JWT; mode=dark',
          auth: 'JWT',
          Authorization: 'Bearer API-KEY',
        },
      },
      contexts: {
        trace: {
          data: {
            'http.request.header.authorization': 'Bearer API-KEY',
            // One attribute per cookie, as the Next.js server SDK writes them.
            'http.request.header.cookie.auth': 'JWT',
            'http.request.header.cookie.showorg': 'ORG-COOKIE',
            'http.request.method': 'GET',
          },
        },
      },
    });

    assert.doesNotMatch(JSON.stringify(out), /JWT|API-KEY|ORG-COOKIE/);
    assert.deepEqual(out.contexts.trace.data, { 'http.request.method': 'GET' });
    assert.deepEqual(out.request.headers, { 'User-Agent': 'Mozilla/5.0' });
    assert.equal(out.request.url, 'https://app.postqueen.ai/launches');
  });

  it("drops the visitor's IP in every spelling a proxied request brings", () => {
    const out = scrubForSentry({
      request: {
        headers: {
          'X-Forwarded-For': '203.0.113.7, 172.19.0.1',
          'X-Real-IP': '203.0.113.7',
          Host: 'api.postqueen.ai',
        },
      },
      contexts: {
        trace: {
          data: {
            'http.request.header.x_forwarded_for': '203.0.113.7',
            'http.request.header.x_api_key': 'API-KEY',
            'http.client_ip': '203.0.113.7',
            'client.address': '203.0.113.7',
            'network.peer.address': '127.0.0.1',
          },
        },
      },
    });

    assert.doesNotMatch(JSON.stringify(out), /203\.0\.113\.7|API-KEY/);
    assert.deepEqual(out.request.headers, { Host: 'api.postqueen.ai' });
    assert.deepEqual(out.contexts.trace.data, { 'network.peer.address': '127.0.0.1' });
  });

  it('drops request bodies and fields named like a secret', () => {
    // @sentry/nestjs 10.69 attached the body of POST /auth/login, password
    // and all, to the error event and to sampled transactions.
    const out = scrubForSentry({
      request: {
        method: 'POST',
        url: 'https://api.postqueen.ai/auth/login',
        data: '{"email":"a@b.c","password":"PASSWORD"}',
      },
      breadcrumbs: [
        {
          category: 'console',
          level: 'error',
          data: {
            arguments: [
              { access_token: 'TOKEN', refresh_token: 'TOKEN', client_secret: 'SECRET', name: 'x' },
            ],
          },
        },
      ],
    });

    assert.doesNotMatch(JSON.stringify(out), /PASSWORD|TOKEN|SECRET/);
    assert.deepEqual(out.request, { method: 'POST', url: 'https://api.postqueen.ai/auth/login' });
    assert.deepEqual(out.breadcrumbs[0].data.arguments, [{ name: 'x' }]);
  });

  it('filters credentials written into text', () => {
    // A log body is the stringified error, so its keys never reach the
    // key-based drop.
    const out = scrubForSentry({
      body: 'Request failed {"config":{"headers":{"Authorization":"Bearer abcdefgh12345678","x":"y"}},"password":"hunter2hunter2"} grant_type=refresh&client_secret=SECRET123',
    });

    assert.doesNotMatch(out.body, /abcdefgh12345678|hunter2hunter2|SECRET123/);
    assert.match(out.body, /"x":"y"/);
    assert.match(out.body, /grant_type=refresh/);
  });

  it('filters keys in a URL path and the password of a connection string', () => {
    const out = scrubForSentry({
      telegram: 'POST https://api.telegram.org/bot123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw/sendMessage',
      webhook: 'https://discord.com/api/webhooks/123/k3yLooksLikeThis9QwErTy12345',
      reset: '/auth/forgot/a1b2c3d4e5f6a7b8c9d0e1f2',
      span: 'GET /auth/forgot/a1b2c3d4e5f6a7b8c9d0e1f2?x=1',
      database: 'postgresql://postqueen:PASSWORD@postgres:5432/postqueen',
      route: 'https://graph.facebook.com/v20.0/me/accounts',
    });

    assert.equal(out.telegram, 'POST https://api.telegram.org/[Filtered]/sendMessage');
    assert.equal(out.webhook, 'https://discord.com/api/webhooks/123/[Filtered]');
    assert.equal(out.reset, '/auth/forgot/[Filtered]');
    assert.equal(out.span, 'GET /auth/forgot/[Filtered]');
    assert.equal(out.database, 'postgresql://postgres:5432/postqueen');
    assert.equal(out.route, 'https://graph.facebook.com/v20.0/me/accounts');
  });

  it('keeps the rest of a message that starts with a path', () => {
    assert.equal(
      scrubForSentry('/launches?code=OAUTH failed because the state expired'),
      '/launches failed because the state expired'
    );
  });

  it('drops what it cannot reach instead of passing it through', () => {
    let deep: Record<string, unknown> = { link: `${graph}?access_token=SECRET` };
    for (let i = 0; i < 40; i++) {
      deep = { next: deep };
    }
    assert.doesNotMatch(JSON.stringify(scrubForSentry(deep)), /SECRET/);
  });

  it('stays fast on input built to make a pattern backtrack', () => {
    // The first version took 7.9 s on 100 KB of `a-a-...` and 131 ms inside
    // beforeSendTransaction for a 15 KB request path.
    for (const value of ['a-'.repeat(50000), 'a://'.repeat(25000), `/${'a-'.repeat(50000)}`]) {
      const started = performance.now();
      scrubForSentry({ message: value, 'http.target': value });
      assert.ok(performance.now() - started < 100, `${value.slice(0, 8)}… took too long`);
    }
  });

  it('never changes an object the application still holds', () => {
    const post = { link: `${graph}?access_token=SECRET` };
    const error = new Error(`${graph}?access_token=SECRET`);
    const out = scrubForSentry({ extra: { post, error } });

    assert.equal(post.link, `${graph}?access_token=SECRET`);
    assert.equal(out.extra.post.link, graph);
    assert.equal(out.extra.error, error);
  });
});

describe('consoleWarningsAndErrorsOnly', () => {
  it('keeps console warnings and errors and every other kind of breadcrumb', () => {
    for (const breadcrumb of [
      { category: 'console', level: 'warning' },
      { category: 'console', level: 'error' },
      { category: 'http', level: 'info' },
      { category: 'navigation' },
    ]) {
      assert.equal(consoleWarningsAndErrorsOnly(breadcrumb), breadcrumb);
    }
  });

  it('drops console log, info and debug lines', () => {
    for (const level of ['log', 'info', 'debug']) {
      assert.equal(consoleWarningsAndErrorsOnly({ category: 'console', level }), null);
    }
  });
});
