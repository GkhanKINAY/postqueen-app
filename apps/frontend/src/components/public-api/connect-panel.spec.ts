import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8');

const detail = read('connect-detail.tsx');
const hub = read('connect-hub.tsx');
const panel = read('connect-panel.tsx');
const ui = read('connect-ui.tsx');

describe('Connect panel item page', () => {
  it('splits an item page into Setup, Tips and fixes, and All ways to connect', () => {
    assert.match(detail, /data-pq="conn-detail-tabs"/);
    assert.match(detail, /data-pq=\{`conn-tab-\$\{tab\.id\}`\}/);
    assert.match(detail, /role="tablist"/);
    assert.match(detail, /t\('conn_tab_setup', 'Setup'\)/);
    assert.match(detail, /t\('conn_tab_tips', 'Tips and fixes'\)/);
    assert.match(detail, /t\('conn_tab_ways', 'All ways to connect'\)/);
    assert.match(detail, /data-pq="conn-pane-setup"/);
    assert.match(detail, /data-pq="conn-pane-tips"/);
    assert.match(detail, /data-pq="conn-pane-ways"/);
    assert.match(detail, /shown === 'setup'/);
    assert.match(detail, /shown === 'tips'/);
    assert.match(detail, /shown === 'ways'/);
  });

  it('puts the key and the text to copy inside the step that needs them', () => {
    assert.match(detail, /step\.inline === 'key' && <KeyRow/);
    assert.match(detail, /<CommandRow/);
    assert.match(detail, /<CodePanel/);
    assert.match(detail, /step\.inline === 'ask'/);
  });

  it('shows no method badge: a card says how you connect in words', () => {
    for (const source of [detail, hub, panel]) {
      assert.doesNotMatch(source, /METHOD_STYLE|item\.method\b/);
    }
    assert.match(hub, /<WayLine way=\{item\.way\}/);
  });

  it('keeps code left to right and copies the real key behind the mask', () => {
    assert.match(ui, /dir="ltr"/);
    assert.match(ui, /onClick=\{\(\) => copyValue\(code\)\}/);
    assert.match(ui, /maskIn\(code, apiKey\)/);
  });

  it('only offers email support where the workspace has an address', () => {
    assert.match(detail, /!!supportEmail && \(/);
    assert.match(detail, /mailto:\$\{supportEmail\}/);
  });

  it('keeps the tour anchors on the featured cards and the key button', () => {
    assert.match(hub, /data-tour="connect-featured"/);
    assert.match(hub, /data-conn-card="1"/);
    assert.match(panel, /data-tour="connect-creds"/);
  });
});
