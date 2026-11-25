import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ThreadsProvider } from './threads.provider.ts';

const provider = new ThreadsProvider();
const media = (count: number, ext = 'jpg') =>
  Array.from({ length: count }, (_, i) => ({ path: `https://cdn.test/${i}.${ext}` }));
const text = (...texts: string[]) =>
  provider.checkValidity(texts.map(() => []), {}, [], texts);

describe('Threads media', () => {
  it('takes carousels of up to 20 items, per post and per reply', async () => {
    assert.equal(await provider.checkValidity([media(20)], {}, []), true);
    assert.equal(
      await provider.checkValidity([media(1), media(21)], {}, []),
      'Threads carousels can have up to 20 items'
    );
  });

  it('takes JPEG and PNG images, and videos', async () => {
    assert.equal(
      await provider.checkValidity(
        [[...media(1, 'jpg'), ...media(1, 'jpeg'), ...media(1, 'png'), ...media(1, 'mp4')]],
        {},
        []
      ),
      true
    );
    for (const ext of ['gif', 'webp', 'avif', 'bmp', 'tiff']) {
      assert.equal(
        await provider.checkValidity([media(1, ext)], {}, []),
        'Threads accepts JPEG or PNG images only',
        ext
      );
    }
  });
});

describe('Threads text', () => {
  it('allows 5 distinct links, not 6', async () => {
    const links = (n: number) =>
      Array.from({ length: n }, (_, i) => `https://site${i}.test/page`).join(' ');
    assert.equal(await text(links(5)), true);
    // The same link twice is one link.
    assert.equal(await text(`${links(5)} https://site0.test/page`), true);
    assert.equal(await text(links(6)), 'Threads allows up to 5 links per post');
    assert.equal(
      await text('first post', `${links(5)} www.sixth.test`),
      'Threads allows up to 5 links per post'
    );
  });

  it('leaves the length, in characters, to the generic too-long check', async () => {
    assert.equal(await text('a'.repeat(600)), true);
    assert.equal(await text('😀'.repeat(200)), true);
  });
});

describe('Threads errors', () => {
  it('names an invalid link attachment (4279047) instead of an unknown error', () => {
    const answer = new ThreadsProvider().handleErrors(
      JSON.stringify({
        error: {
          message: 'Invalid parameter',
          type: 'THApiException',
          code: 100,
          error_subcode: 4279047,
          is_transient: false,
          error_user_title: 'Invalid Link Attachment',
        },
      })
    );
    assert.equal(answer?.type, 'bad-body');
    assert.match(String(answer?.value), /invalid link attachment/);
  });
});

// What each Threads container call carries, with every call answered here.
const containerCalls = async (
  settings: Record<string, unknown>,
  mediaList: { path: string }[]
) => {
  const provider = new ThreadsProvider();
  const calls: { url: string; form?: Record<string, string> }[] = [];
  (provider as any).fetch = async (url: string, init: RequestInit = {}) => {
    calls.push({
      url,
      ...(init.body instanceof FormData
        ? { form: Object.fromEntries(init.body as any) }
        : {}),
    });
    return new Response(JSON.stringify({ id: `c-${calls.length}` }));
  };
  const [response] = await provider.postPending(
    'user',
    'token',
    [{ id: 'p', message: 'hello', settings, media: mediaList }] as any,
    { internalId: 'user', profile: 'me' } as any
  );
  return { provider, calls, response };
};

describe('Threads Made with AI', () => {
  it('leaves a post without the setting exactly as before', async () => {
    for (const mediaList of [[], media(1), media(3)]) {
      const { calls, response } = await containerCalls({}, mediaList);
      for (const call of calls) {
        assert.doesNotMatch(call.url, /is_made_with_ai/);
        assert.equal(call.form?.is_made_with_ai, undefined);
      }
      assert.equal('madeWithAi' in (response.pendingData || {}), false);
    }
  });

  it('labels a text post and a single media post', async () => {
    const textPost = await containerCalls({ made_with_ai: true }, []);
    assert.equal(textPost.calls[0].form?.is_made_with_ai, 'true');
    const imagePost = await containerCalls({ made_with_ai: 'true' }, media(1));
    assert.match(imagePost.calls[0].url, /is_made_with_ai=true/);
  });

  it('labels a carousel on its container, never on the items', async () => {
    const { provider, calls, response } = await containerCalls(
      { made_with_ai: true },
      media(3)
    );
    assert.equal(calls.length, 3);
    for (const call of calls) {
      assert.doesNotMatch(call.url, /is_made_with_ai/);
    }
    assert.equal(response.pendingData?.madeWithAi, true);

    (provider as any).fetch = async (url: string) => {
      calls.push({ url });
      return new Response(JSON.stringify({ id: 'carousel' }));
    };
    await provider.finalizePost('token', response.pendingData as any, {
      internalId: 'user',
    } as any);
    assert.match(calls.at(-1)!.url, /media_type=CAROUSEL/);
    assert.match(calls.at(-1)!.url, /is_made_with_ai=true/);
  });

  it('does not label a carousel whose pending data predates the setting', async () => {
    const provider = new ThreadsProvider();
    let url = '';
    (provider as any).fetch = async (u: string) => {
      url = u;
      return new Response(JSON.stringify({ id: 'carousel' }));
    };
    await provider.finalizePost(
      'token',
      { step: 'children', childIds: ['a', 'b'], message: 'hi' },
      { internalId: 'user' } as any
    );
    assert.match(url, /media_type=CAROUSEL/);
    assert.doesNotMatch(url, /is_made_with_ai/);
  });
});
