import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const panel = readFileSync(
  fileURLToPath(new URL('./connect-panel.tsx', import.meta.url)),
  'utf8'
);

describe('Connect panel detail tabs', () => {
  it('splits a connector page into How to connect, API key and Examples', () => {
    assert.match(panel, /data-pq="conn-detail-tabs"/);
    assert.match(panel, /data-pq=\{`conn-tab-\$\{tab\.id\}`\}/);
    assert.match(panel, /t\('conn_how_to_connect', 'How to connect'\)/);
    assert.match(panel, /t\('api_key', 'API key'\)/);
    assert.match(panel, /t\('conn_examples_eyebrow', 'Examples'\)/);
    assert.match(panel, /role="tablist"/);
    assert.match(panel, /data-pq="conn-pane-connect"/);
    assert.match(panel, /data-pq="conn-pane-key"/);
    assert.match(panel, /data-pq="conn-pane-examples"/);
  });

  it('does not stack the key card, steps and samples on one scroll', () => {
    const detail = panel.slice(panel.indexOf('const renderDetail'));
    const afterTabs = detail.slice(detail.indexOf('conn-detail-tabs'));
    assert.match(afterTabs, /activeTab === 'connect'/);
    assert.match(afterTabs, /activeTab === 'key'/);
    assert.match(afterTabs, /activeTab === 'examples'/);
    assert.doesNotMatch(
      afterTabs,
      /credentialStrip\(item\.cred\)[\s\S]{0,400}item\.steps\.map/
    );
  });
});
