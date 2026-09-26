import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { ResendNewsletterProvider } from './resend.provider.ts';

/**
 * Measured against the Resend API on 2026-09-26: creating a contact that
 * already exists answers 201 with the same id and clears its "unsubscribed"
 * flag, so a second sign-up at the same address would quietly undo an
 * unsubscribe. These pin down that an existing contact only joins the segment,
 * and how the Settings switch reads and writes the choice.
 */

type Call = { method: string; path: string; body: any };

const realFetch = globalThis.fetch;
let calls: Call[] = [];

/** Answers by "METHOD /path"; anything unlisted is a 200 with `{}`. */
const answer = (routes: Record<string, [number, unknown]>) => {
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const method = init.method || 'GET';
    const path = String(url).replace('https://api.resend.com', '');
    calls.push({
      method,
      path,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    const [status, body] = routes[`${method} ${path}`] || [200, {}];
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
};

const CONTACT = '/contacts/ada%2Bnews%40example.com';
const EMAIL = 'ada+news@example.com';
const missing: [number, unknown] = [404, { message: 'Contact not found' }];

beforeEach(() => {
  process.env.RESEND_CONTACTS_API_KEY = 're_test';
  process.env.RESEND_NEWS_SEGMENT_ID = 'segment-1';
  process.env.RESEND_NEWS_TOPIC_ID = 'topic-1';
});

afterEach(() => {
  globalThis.fetch = realFetch;
  calls = [];
  delete process.env.RESEND_CONTACTS_API_KEY;
  delete process.env.RESEND_NEWS_SEGMENT_ID;
  delete process.env.RESEND_NEWS_TOPIC_ID;
});

describe('ResendNewsletterProvider.register', () => {
  it('creates a new contact inside the segment', async () => {
    answer({ [`GET ${CONTACT}`]: missing });

    await new ResendNewsletterProvider().register(EMAIL);

    assert.deepEqual(
      calls.map((c) => `${c.method} ${c.path}`),
      [`GET ${CONTACT}`, 'POST /contacts'],
    );
    assert.deepEqual(calls[1].body, {
      email: EMAIL,
      segments: [{ id: 'segment-1' }],
    });
  });

  it('only adds an existing contact to the segment, keeping its unsubscribe', async () => {
    answer({ [`GET ${CONTACT}`]: [200, { email: EMAIL, unsubscribed: true }] });

    await new ResendNewsletterProvider().register(EMAIL);

    assert.deepEqual(
      calls.map((c) => `${c.method} ${c.path}`),
      [`GET ${CONTACT}`, `POST ${CONTACT}/segments/segment-1`],
    );
  });

  it('never fails the sign-up when Resend does', async () => {
    answer({ [`GET ${CONTACT}`]: [500, {}] });

    await assert.doesNotReject(new ResendNewsletterProvider().register(EMAIL));
  });
});

describe('ResendNewsletterProvider.subscribed', () => {
  it('is off for an address that is not on the list', async () => {
    answer({ [`GET ${CONTACT}`]: missing });

    assert.equal(await new ResendNewsletterProvider().subscribed(EMAIL), false);
  });

  it('is off after an unsubscribe from Resend’s page', async () => {
    answer({ [`GET ${CONTACT}`]: [200, { unsubscribed: true }] });

    assert.equal(await new ResendNewsletterProvider().subscribed(EMAIL), false);
  });

  it('follows the topic', async () => {
    const topics = (subscription: string): [number, unknown] => [
      200,
      { data: [{ id: 'topic-1', subscription }] },
    ];
    const provider = new ResendNewsletterProvider();

    answer({
      [`GET ${CONTACT}`]: [200, { unsubscribed: false }],
      [`GET ${CONTACT}/topics`]: topics('opt_in'),
    });
    assert.equal(await provider.subscribed(EMAIL), true);

    answer({
      [`GET ${CONTACT}`]: [200, { unsubscribed: false }],
      [`GET ${CONTACT}/topics`]: topics('opt_out'),
    });
    assert.equal(await provider.subscribed(EMAIL), false);
  });

  it('throws rather than answering off when Resend fails', async () => {
    answer({ [`GET ${CONTACT}`]: [500, {}] });

    await assert.rejects(new ResendNewsletterProvider().subscribed(EMAIL));
  });
});

describe('ResendNewsletterProvider.setSubscribed', () => {
  it('turning off only opts out of the topic', async () => {
    answer({ [`GET ${CONTACT}`]: [200, { unsubscribed: false }] });

    await new ResendNewsletterProvider().setSubscribed(EMAIL, false);

    const patches = calls.filter((c) => c.method === 'PATCH');
    assert.deepEqual(patches, [
      {
        method: 'PATCH',
        path: `${CONTACT}/topics`,
        body: [{ id: 'topic-1', subscription: 'opt_out' }],
      },
    ]);
  });

  it('turning on also clears an unsubscribe', async () => {
    answer({ [`GET ${CONTACT}`]: [200, { unsubscribed: true }] });

    await new ResendNewsletterProvider().setSubscribed(EMAIL, true);

    const patches = calls.filter((c) => c.method === 'PATCH');
    assert.deepEqual(
      patches.map((c) => [c.path, c.body]),
      [
        [`${CONTACT}/topics`, [{ id: 'topic-1', subscription: 'opt_in' }]],
        [CONTACT, { unsubscribed: false }],
      ],
    );
  });

  it('fails on a wrong segment id instead of reporting a save', async () => {
    answer({
      [`GET ${CONTACT}`]: [200, { unsubscribed: false }],
      [`POST ${CONTACT}/segments/segment-1`]: [
        404,
        { message: 'Audience not found' },
      ],
    });

    await assert.rejects(
      new ResendNewsletterProvider().setSubscribed(EMAIL, false),
    );
  });

  it('tries once more after a rate limit', async () => {
    let limited = true;
    globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
      calls.push({
        method: init.method || 'GET',
        path: String(url),
        body: undefined,
      });
      if (limited) {
        limited = false;
        return new Response('{}', {
          status: 429,
          headers: { 'retry-after': '0' },
        });
      }
      return new Response(JSON.stringify({ unsubscribed: false, data: [] }), {
        status: 200,
      });
    }) as typeof fetch;

    assert.equal(await new ResendNewsletterProvider().subscribed(EMAIL), true);
    assert.equal(calls.length, 3);
  });

  it('fails loudly, so Settings can put the switch back', async () => {
    answer({
      [`GET ${CONTACT}`]: [200, { unsubscribed: false }],
      [`PATCH ${CONTACT}/topics`]: [500, {}],
    });

    await assert.rejects(
      new ResendNewsletterProvider().setSubscribed(EMAIL, false),
    );
  });
});
