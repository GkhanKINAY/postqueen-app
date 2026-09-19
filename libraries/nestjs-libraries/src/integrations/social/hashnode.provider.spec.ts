import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { HashnodeProvider } from './hashnode.provider.ts';

/**
 * Hashnode moved its GraphQL API and put every call behind the Pro plan
 * (2026-05-13). The old host answered with a 301 to an HTML page, which the
 * provider read as "Invalid credentials", and the old publishPost input
 * (`tags: [{ id }]`, `coverImageOptions`) now fails validation. Hashnode answers
 * a bad token and a missing plan with HTTP 200, so these pin down which
 * message each one becomes.
 */

type Call = { url: string; body: any; headers: Record<string, string> };

const realFetch = globalThis.fetch;
let calls: Call[] = [];

const answer = (body: unknown, status = 200) => {
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({
      url: String(url),
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      headers: (init.headers || {}) as Record<string, string>,
    });
    return new Response(
      typeof body === 'string' ? body : JSON.stringify(body),
      { status }
    );
  }) as typeof fetch;
};

const code = (apiKey: string) =>
  Buffer.from(JSON.stringify({ apiKey })).toString('base64');

const PRO_MESSAGE =
  'Publication does not have an active Pro plan. Upgrade in your dashboard to access this via the API.';

afterEach(() => {
  globalThis.fetch = realFetch;
  calls = [];
});

describe('Hashnode connect', () => {
  it('asks gql-beta for the profile and returns it', async () => {
    answer({
      data: {
        me: {
          id: 'u1',
          name: 'Ada',
          username: 'ada',
          profilePicture: 'https://cdn.hashnode.com/a.png',
        },
      },
    });

    const auth = await new HashnodeProvider().authenticate({
      code: code('token-1'),
      codeVerifier: '',
    });

    assert.equal(calls[0].url, 'https://gql-beta.hashnode.com');
    assert.equal(calls[0].headers.Authorization, 'token-1');
    assert.match(calls[0].body.query, /me\s*{/);
    assert.deepEqual(
      typeof auth === 'string'
        ? auth
        : {
            id: auth.id,
            name: auth.name,
            username: auth.username,
            picture: auth.picture,
            accessToken: auth.accessToken,
          },
      {
        id: 'u1',
        name: 'Ada',
        username: 'ada',
        picture: 'https://cdn.hashnode.com/a.png',
        accessToken: 'token-1',
      }
    );
  });

  it('calls a rejected token invalid credentials', async () => {
    answer({
      errors: [
        {
          message: 'You must be logged in',
          extensions: { code: 'UNAUTHENTICATED' },
          path: ['me'],
        },
      ],
      data: { me: null },
    });

    assert.equal(
      await new HashnodeProvider().authenticate({
        code: code('wrong'),
        codeVerifier: '',
      }),
      'Invalid credentials'
    );
  });

  it('passes on the Pro plan message instead of blaming the token', async () => {
    answer({
      errors: [{ message: PRO_MESSAGE, extensions: { code: 'FORBIDDEN' } }],
      data: { me: null },
    });

    assert.equal(
      await new HashnodeProvider().authenticate({
        code: code('token-1'),
        codeVerifier: '',
      }),
      PRO_MESSAGE
    );
  });

  it('says the API is unreachable when the answer is not JSON', async () => {
    answer('<!doctype html><title>GraphQL API is moving</title>');

    assert.equal(
      await new HashnodeProvider().authenticate({
        code: code('token-1'),
        codeVerifier: '',
      }),
      'Could not reach the Hashnode API. Please try again later.'
    );
  });
});

describe('Hashnode publications', () => {
  it('reads them from gql-beta', async () => {
    answer({
      data: {
        me: {
          publications: { edges: [{ node: { id: 'p1', title: 'Blog' } }] },
        },
      },
    });

    assert.deepEqual(await new HashnodeProvider().publications('token-1'), [
      { id: 'p1', name: 'Blog' },
    ]);
    assert.equal(calls[0].url, 'https://gql-beta.hashnode.com');
  });
});

describe('Hashnode publish', () => {
  const details = [
    {
      id: 'post-1',
      message: '# Hello',
      settings: {
        title: 'Hello world',
        publication: 'p1',
        // The objectID the composer stores, and a slug as the MCP tool may send.
        tags: [
          { value: '56744721958ef13879b94cad', label: 'JavaScript' },
          { value: 'python', label: 'Python' },
        ],
        main_image: { path: 'https://cdn.example.com/cover.png' },
      },
      media: [],
    },
  ] as any;

  it('sends tags as slugs and the cover as coverImage', async () => {
    answer({
      data: {
        publishPost: {
          post: { id: 'h1', url: 'https://ada.hashnode.dev/hello-world' },
        },
      },
    });

    const result = await new HashnodeProvider().post(
      'u1',
      'token-1',
      details,
      {} as any
    );

    assert.equal(calls[0].url, 'https://gql-beta.hashnode.com');
    const query: string = calls[0].body.query;
    assert.match(
      query,
      /tags: \[{slug: "javascript", name: "JavaScript"}, {slug: "python", name: "Python"}\]/
    );
    assert.match(query, /coverImage: "https:\/\/cdn\.example\.com\/cover\.png"/);
    assert.doesNotMatch(query, /coverImageOptions|\bid: "5674/);
    assert.deepEqual(result, [
      {
        id: 'post-1',
        status: 'completed',
        postId: 'h1',
        releaseURL: 'https://ada.hashnode.dev/hello-world',
      },
    ]);
  });

  it('fails the post with the Pro plan message when the plan is missing', async () => {
    answer({
      errors: [
        {
          message: PRO_MESSAGE,
          extensions: { code: 'FORBIDDEN' },
          path: ['publishPost'],
        },
      ],
      data: null,
    });

    await assert.rejects(
      new HashnodeProvider().post('u1', 'token-1', details, {} as any),
      (err: any) => err.type === 'bad_body' && err.message === PRO_MESSAGE
    );
  });

  it('names the field when Hashnode rejects the input shape', async () => {
    // The answer the old `coverImageOptions` input gets, as HTTP 400.
    const message =
      'Field "coverImageOptions" is not defined by type "PublishPostInput". Did you mean "coverImage"?';
    answer(
      {
        errors: [
          { message, extensions: { code: 'GRAPHQL_VALIDATION_FAILED' } },
        ],
      },
      400
    );

    await assert.rejects(
      new HashnodeProvider().post('u1', 'token-1', details, {} as any),
      (err: any) => err.type === 'bad_body' && err.message === message
    );
  });

  it('asks for a reconnect when the token is rejected', async () => {
    answer({
      errors: [
        {
          message:
            'Authentication required. Pass your Personal Access Token in the Authorization header.',
          extensions: { code: 'UNAUTHENTICATED' },
          path: ['publishPost'],
        },
      ],
      data: null,
    });

    await assert.rejects(
      new HashnodeProvider().post('u1', 'token-1', details, {} as any),
      (err: any) => err.type === 'refresh_token'
    );
  });
});
