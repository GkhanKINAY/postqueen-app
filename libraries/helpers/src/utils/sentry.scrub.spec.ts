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
