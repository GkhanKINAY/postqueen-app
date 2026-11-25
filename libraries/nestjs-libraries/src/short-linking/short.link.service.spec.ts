import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { ShortLinkService } from './short.link.service.ts';
import type { ShortLinking } from './short-linking.interface.ts';

const original = ShortLinkService.provider;
const service = new ShortLinkService();

const useProvider = (convert: (link: string) => Promise<string>) => {
  ShortLinkService.provider = {
    shortLinkDomain: 'sho.rt',
    convertLinkToShortLink: (_id: string, link: string) => convert(link),
  } as unknown as ShortLinking;
};

describe('convertTextToShortLinks', () => {
  afterEach(() => {
    ShortLinkService.provider = original;
    mock.restoreAll();
  });

  it('replaces a link with the provider answer', async () => {
    useProvider(async () => 'https://sho.rt/abc');
    assert.deepEqual(
      await service.convertTextToShortLinks('org', ['see https://site.test/page']),
      ['see https://sho.rt/abc']
    );
  });

  it('keeps the original link when the provider answers with nothing', async () => {
    useProvider(async () => undefined as unknown as string);
    assert.deepEqual(
      await service.convertTextToShortLinks('org', ['see https://site.test/page']),
      ['see https://site.test/page']
    );
  });

  it('keeps the original link when the provider throws', async () => {
    mock.method(console, 'error', () => undefined);
    useProvider(async () => {
      throw new Error('403');
    });
    assert.deepEqual(
      await service.convertTextToShortLinks('org', [
        'a https://site.test/one and https://site.test/two',
      ]),
      ['a https://site.test/one and https://site.test/two']
    );
  });
});
