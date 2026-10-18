import 'reflect-metadata';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { tmpdir } from 'node:os';
import { after, before, describe, it } from 'node:test';

// As in integration.credits.spec.ts: tsx follows tsconfig's mapping of
// `file-type` and `mime` to their declarations, so the code the service
// imports is pointed at the packages' own entries. On a Node without
// registerHooks the spec is skipped rather than failed.
const entries: Record<string, string> = {
  'file-type': '../../../../../../node_modules/file-type/source/index.js',
  mime: '../../../../../../node_modules/mime/dist/src/index.js',
};
const canLoadService = typeof nodeModule.registerHooks === 'function';
if (canLoadService) {
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

let IntegrationService: any;
// The service builds its storage when constructed: keep it the local one.
const KEYS = ['STORAGE_PROVIDER', 'UPLOAD_DIRECTORY'];
const previous = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
before(async () => {
  process.env.STORAGE_PROVIDER = 'local';
  process.env.UPLOAD_DIRECTORY = tmpdir();
  if (canLoadService) {
    ({ IntegrationService } = await import('./integration.service.ts'));
  }
});
after(() => {
  for (const key of KEYS) {
    if (previous[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous[key];
    }
  }
});

describe('IntegrationService.clearExpiredProfiles', { skip: !canLoadService }, () => {
  it("gives removed channels the network's name once the provider's limit has passed, and leaves providers without one alone", async () => {
    const cleared: Array<{ identifier: string; label: string; before: Date }> = [];
    const service = new IntegrationService(
      {
        clearRemovedProfiles: async (identifier: string, label: string, before: Date) => {
          cleared.push({ identifier, label, before });
          return { count: 0 };
        },
      },
      {},
      {
        getAllowedSocialsIntegrations: () => ['linkedin', 'linkedin-page', 'x'],
        getSocialIntegration: (id: string) =>
          id === 'linkedin-page' ? { profileRetentionDays: 56 } : {},
        getSocialIntegrationName: () => 'LinkedIn Page',
      },
      {},
      {},
      {},
      {},
    );

    await service.clearExpiredProfiles();

    assert.equal(cleared.length, 1);
    assert.equal(cleared[0].identifier, 'linkedin-page');
    assert.equal(cleared[0].label, 'LinkedIn Page');
    const days = (Date.now() - cleared[0].before.getTime()) / 86_400_000;
    assert.ok(Math.abs(days - 56) < 0.01, `cutoff is ${days} days ago`);
  });
});
