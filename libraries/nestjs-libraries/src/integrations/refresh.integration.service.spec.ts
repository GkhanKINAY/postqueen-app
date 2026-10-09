import 'reflect-metadata';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { before, describe, it } from 'node:test';
import dayjs from 'dayjs';

// As in integration.credits.spec.ts: tsx follows tsconfig's mapping of
// `file-type` and `mime` to their declarations, so the code the service and
// the providers import is pointed at the packages' own entries. On a Node
// without registerHooks the spec is skipped rather than failed.
const entries: Record<string, string> = {
  'file-type': '../../../../node_modules/file-type/source/index.js',
  mime: '../../../../node_modules/mime/dist/src/index.js',
};
const canLoad = typeof nodeModule.registerHooks === 'function';
if (canLoad) {
  nodeModule.registerHooks({
    resolve: (specifier, context, next) =>
      entries[specifier]
        ? {
            url: new URL(entries[specifier], import.meta.url).href,
            shortCircuit: true,
          }
        : next(specifier, context),
  });
}

let service: any;
before(async () => {
  if (!canLoad) {
    return;
  }
  const { RefreshIntegrationService } =
    await import('./refresh.integration.service.ts');
  const providers: Record<string, any> = {
    facebook: new (
      await import('./social/facebook.provider.ts')
    ).FacebookProvider(),
    instagram: new (
      await import('./social/instagram.provider.ts')
    ).InstagramProvider(),
    'instagram-standalone': new (
      await import('./social/instagram.standalone.provider.ts')
    ).InstagramStandaloneProvider(),
    'linkedin-page': new (
      await import('./social/linkedin.page.provider.ts')
    ).LinkedinPageProvider(),
  };
  service = new RefreshIntegrationService(
    { getSocialIntegration: (id: string) => providers[id] } as any,
    {} as any,
    {} as any,
  );
});

const expired = (providerIdentifier: string, tokenExpiration: Date | null) =>
  service.isExpired({ providerIdentifier, tokenExpiration });

const past = dayjs().subtract(1, 'day').toDate();
const future = dayjs().add(1, 'day').toDate();

// Facebook stored now + 59 days for a Page token that never expires, then
// asked the person to reconnect a working channel once that date passed.
describe('RefreshIntegrationService.isExpired', { skip: !canLoad }, () => {
  it('never refreshes a Facebook Page on its stored date', () => {
    assert.equal(expired('facebook', past), false);
    assert.equal(expired('facebook', future), false);
  });

  it('still refreshes the providers whose tokens expire', () => {
    for (const id of ['instagram', 'instagram-standalone', 'linkedin-page']) {
      assert.equal(expired(id, past), true, id);
      assert.equal(expired(id, future), false, id);
    }
  });

  it('treats a channel without a stored expiry as not expired', () => {
    assert.equal(expired('linkedin-page', null), false);
  });
});
