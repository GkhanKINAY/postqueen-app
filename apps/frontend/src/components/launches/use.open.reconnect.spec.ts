import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const reconnect = readFileSync(
  fileURLToPath(new URL('./use.open.reconnect.ts', import.meta.url)),
  'utf8',
);
const copilot = readFileSync(
  fileURLToPath(new URL('../agents/agent.tsx', import.meta.url)),
  'utf8',
);
const plugs = readFileSync(
  fileURLToPath(new URL('../plugs/plugs.tsx', import.meta.url)),
  'utf8',
);
const analytics = readFileSync(
  fileURLToPath(
    new URL('../platform-analytics/platform.analytics.tsx', import.meta.url)
  ),
  'utf8',
);

describe('useOpenReconnectInChannels', () => {
  it('toasts from Channels and pushes the focused Channels URL', () => {
    assert.match(reconnect, /please_reconnect_from_channels/);
    assert.match(reconnect, /channelFocusPath\(\{ focus: id \}\)/);
    assert.doesNotMatch(
      reconnect,
      /channel_disconnected_click_to_reconnect/,
    );
  });

  it('is the reconnect of the analytics pane of a disconnected channel', () => {
    const pane = readFileSync(
      fileURLToPath(
        new URL('../platform-analytics/render.analytics.tsx', import.meta.url)
      ),
      'utf8',
    );
    assert.match(pane, /openReconnectInChannels\(integration\.id\)/);
    assert.match(pane, /'reconnect_channel'/);
    assert.doesNotMatch(pane, /\/integrations\/social\//);
    assert.doesNotMatch(pane, /'refresh_channel'/);
  });

  it('is the reconnect path from Copilot, Automations and Analytics', () => {
    for (const source of [copilot, plugs, analytics]) {
      assert.match(source, /useOpenReconnectInChannels/);
      assert.match(source, /openReconnectInChannels\(integration\.id\)/);
      assert.doesNotMatch(
        source,
        /channel_disconnected_click_to_reconnect/,
      );
    }
  });
});

describe('reconnecting a browser-extension channel', () => {
  const channels = readFileSync(
    fileURLToPath(
      new URL('../channels/channels.component.tsx', import.meta.url)
    ),
    'utf8',
  );
  const addProvider = readFileSync(
    fileURLToPath(new URL('./add.provider.component.tsx', import.meta.url)),
    'utf8',
  );
  const listRoute = readFileSync(
    fileURLToPath(
      new URL(
        '../../../../backend/src/api/routes/integrations.controller.ts',
        import.meta.url
      )
    ),
    'utf8',
  );

  it('goes through the extension flow, never to the bare state id', () => {
    assert.match(
      listRoute,
      /isChromeExtension: !!findIntegration\.isChromeExtension/
    );
    assert.match(
      channels,
      /if \(current\.isChromeExtension\) \{\s*await extensionConnect\(current\.identifier, \{\s*refresh: String\(current\.internalId\)/
    );
    assert.match(
      analytics,
      /if \(integration\.isChromeExtension\) \{\s*openReconnectInChannels\(integration\.id\)/
    );
  });

  it('shares one extension flow between Add Channel and Reconnect', () => {
    assert.match(addProvider, /export const useExtensionConnect = \(\) =>/);
    assert.match(
      addProvider,
      /await extensionConnect\(identifier, \{ onboarding \}\)/
    );
    assert.equal(addProvider.match(/type: 'GET_COOKIES'/g)?.length, 1);
  });
});
