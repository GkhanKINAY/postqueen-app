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
