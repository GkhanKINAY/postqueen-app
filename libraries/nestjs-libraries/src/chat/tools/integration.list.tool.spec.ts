import 'reflect-metadata';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { before, describe, it } from 'node:test';
import { IntegrationListTool } from './integration.list.tool.ts';

// As in integration.pages.spec.ts: tsx follows tsconfig's mapping of
// `file-type` and `mime` to their declarations, so the code the service
// imports is pointed at the packages' own entries. On a Node without
// registerHooks the spec is skipped rather than failed.
const entries: Record<string, string> = {
  'file-type': '../../../../../node_modules/file-type/source/index.js',
  mime: '../../../../../node_modules/mime/dist/src/index.js',
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
before(async () => {
  if (canLoadService) {
    ({ IntegrationService } = await import(
      '../../database/prisma/integrations/integration.service.ts'
    ));
  }
});

describe('the MCP channel list', { skip: !canLoadService }, () => {
  // The same rows as the channel list spec in integrations.controller.spec.ts:
  // the agent is offered exactly the channels the Channels page shows as
  // finished.
  it('leaves out a channel while it is flagged, or still holds the login id where a page is needed', async () => {
    const row = (
      id: string,
      provider: string,
      fields: Record<string, unknown>
    ) => ({
      id,
      name: id,
      providerIdentifier: provider,
      internalId: 'login-1',
      rootInternalId: 'login-1',
      inBetweenSteps: false,
      disabled: false,
      refreshNeeded: false,
      ...fields,
    });
    const providers: Record<string, Record<string, unknown>> = {
      facebook: { pageRequiredToPost: true },
      youtube: {},
    };
    const tool = new IntegrationListTool(
      {
        getIntegrationsList: async () => [
          // a renewal wrote inBetweenSteps: false; its page was never picked
          row('fb-renewed', 'facebook', {}),
          row('fb-done', 'facebook', { internalId: 'page-1' }),
          row('yt-flagged', 'youtube', { inBetweenSteps: true }),
          row('yt-done', 'youtube', {}),
        ],
        needsPageSelection: IntegrationService.prototype.needsPageSelection,
      } as any,
      { getSocialIntegration: (name: string) => providers[name] } as any
    );
    const values = new Map([
      ['organization', JSON.stringify({ id: 'org-1' })],
    ]);
    const context = {
      requestContext: {
        get: (key: string) => values.get(key),
        set: (key: string, value: string) => values.set(key, value),
      },
    };

    const { output } = await (tool.run() as any).execute({}, context);

    assert.deepEqual(
      output.map((p: { id: string }) => p.id),
      ['fb-done', 'yt-done']
    );
  });
});
