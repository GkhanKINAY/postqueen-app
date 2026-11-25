import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LinkedinProvider } from './linkedin.provider.ts';
import { LinkedinPageProvider } from './linkedin.page.provider.ts';

const images = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ path: `https://cdn.test/${i}.jpg` }));

for (const [name, provider] of [
  ['LinkedIn', new LinkedinProvider()],
  ['LinkedIn Page', new LinkedinPageProvider()],
] as const) {
  describe(`${name} multi-image posts`, () => {
    it('take up to 20 images', async () => {
      assert.equal(await provider.checkValidity([images(20)], {}), true);
      assert.equal(
        await provider.checkValidity([images(21)], {}),
        'LinkedIn multi-image posts can have up to 20 images.'
      );
    });

    it('do not cap the PDF carousel, which is one document', async () => {
      assert.equal(
        await provider.checkValidity([images(21)], {
          post_as_images_carousel: true,
        }),
        true
      );
    });
  });
}

const source = (file: string) =>
  readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');

describe('LinkedIn API version', () => {
  it('sends the same current version on every versioned call of both tiles', () => {
    for (const file of ['./linkedin.provider.ts', './linkedin.page.provider.ts']) {
      const versions = [
        ...source(file).matchAll(/['"]Linked[Ii]n-Version['"]\s*:\s*'(\d{6})'/g),
      ].map((match) => match[1]);
      assert.ok(versions.length > 0, file);
      // 202306 was sunset on 2024-12-16, which broke the first comment
      assert.deepEqual([...new Set(versions)], ['202610'], file);
    }
  });
});

// Answers the company lookup the way LinkedIn does.
class MentionLinkedinProvider extends LinkedinProvider {
  override async fetch() {
    return new Response(
      JSON.stringify({
        elements: [
          {
            id: 1234,
            localizedName: 'PostQueen',
            logoV2: {
              'original~': {
                elements: [{ identifiers: [{ identifier: 'https://cdn.test/logo.png' }] }],
              },
            },
          },
        ],
      })
    );
  }
}

describe('LinkedIn storage rules', () => {
  it('looks company Pages up fresh instead of keeping them in the mention cache', async () => {
    const found = await new MentionLinkedinProvider().mention('token', {
      query: 'postqueen',
    });
    assert.deepEqual(found, [
      {
        id: '1234',
        label: 'PostQueen',
        image: 'https://cdn.test/logo.png',
        doNotCache: true,
      },
    ]);
  });

  it('keeps post statistics for at most a year on both tiles', () => {
    assert.equal(new LinkedinProvider().analyticsRetentionDays, 365);
    assert.equal(new LinkedinPageProvider().analyticsRetentionDays, 365);
  });

  it("reads a Page's name and logo again every eight weeks, and sets no limit for a member's own profile", () => {
    assert.equal(new LinkedinPageProvider().profileRetentionDays, 56);
    assert.equal(new LinkedinProvider().profileRetentionDays, undefined);
  });
});

for (const [name, provider] of [
  ['LinkedIn', new LinkedinProvider()],
  ['LinkedIn Page', new LinkedinPageProvider()],
] as const) {
  describe(`${name} errors`, () => {
    const answer = (body: object) => provider.handleErrors(JSON.stringify(body));

    it('tells an outage from a refused media file, and still retries both', () => {
      const outage = answer({ message: 'Service Unavailable', status: 503 });
      assert.equal(outage?.type, 'retry');
      assert.match(String(outage?.value), /temporarily unavailable/);
      assert.equal(answer({ code: 'SERVICE_UNAVAILABLE', status: 503 })?.type, 'retry');

      const forbidden = answer({ message: 'The resource is forbidden', status: 403 });
      assert.equal(forbidden?.type, 'retry');
      assert.match(String(forbidden?.value), /refused access to this post's media/);
    });

    it('retries a comment on a post LinkedIn has not finished', () => {
      assert.deepEqual(answer({ message: 'Unable to obtain activity urn:li:activity:1' }), {
        type: 'retry',
        value: 'LinkedIn was not ready to accept a comment on this post yet.',
      });
    });

    it('explains access, duplicate and length refusals without retrying', () => {
      for (const [body, text] of [
        [{ status: 403, code: 'ACCESS_DENIED', message: 'Not enough permissions' }, /cannot post here/],
        [{ status: 422, message: 'Content is a duplicate of urn:li:share:7000' }, /same text was posted recently/],
        [{ status: 422, code: 'FIELD_LENGTH_TOO_LONG' }, /under 3,000 characters/],
      ] as const) {
        const result = answer(body);
        assert.equal(result?.type, 'bad-body');
        assert.match(String(result?.value), text);
      }
    });

    it('leaves an unknown answer to the default handling', () => {
      assert.equal(answer({ status: 400, message: 'Something else' }), undefined);
    });
  });
}

// A LinkedIn Page channel's id goes into the API path and, before a page is
// picked, its placeholder is the root its tokens are shared by.
describe('LinkedIn Page ids', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  // Answers every call in order, and records the URLs asked.
  const answers = (...bodies: unknown[]) => {
    const asked: string[] = [];
    globalThis.fetch = (async (url: string) => {
      asked.push(String(url));
      return new Response(JSON.stringify(bodies.shift() ?? {}));
    }) as typeof fetch;
    return asked;
  };

  it('are organization ids, which are numeric', () => {
    const provider = new LinkedinPageProvider();
    assert.equal(provider.isPageId('108012345'), true);
    assert.equal(provider.isPageId('linkedin-page_abc123'), false);
    assert.equal(provider.isPageId('abc123'), false);
    assert.equal(provider.isPageId('../me'), false);
    assert.equal(provider.isPageId(''), false);
  });

  it('refuses a page that is not an organization id, without asking LinkedIn', async () => {
    const asked = answers({ id: 'member-1', localizedName: 'Someone' });

    await assert.rejects(
      new LinkedinPageProvider().fetchPageInformation('token', {
        page: '../me',
      }),
      /Invalid LinkedIn page/
    );
    assert.deepEqual(asked, []);
  });

  it('refuses a login whose profile came back without a member id', async () => {
    answers(
      {
        access_token: 'token',
        expires_in: 3600,
        refresh_token: 'refresh',
        scope: new LinkedinPageProvider().scopes.join(' '),
      },
      { name: 'Someone' },
      { vanityName: 'someone' }
    );

    await assert.rejects(
      new LinkedinPageProvider().authenticate({
        code: 'code',
        codeVerifier: '',
      }),
      /Could not load the LinkedIn profile/
    );
  });
});
