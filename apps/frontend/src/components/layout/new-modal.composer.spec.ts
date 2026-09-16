import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./new-modal.tsx', import.meta.url)),
  'utf8',
);
const manage = readFileSync(
  fileURLToPath(new URL('../new-launch/manage.modal.tsx', import.meta.url)),
  'utf8',
);
const css = readFileSync(
  fileURLToPath(new URL('../../app/global.css', import.meta.url)),
  'utf8',
);

describe('composer modal chrome', () => {
  it('fills the viewport on phone and tablet instead of applying size 80%', () => {
    assert.match(source, /id === 'add-edit-modal'/);
    assert.match(source, /isComposer && touch/);
    assert.match(source, /h-dvh w-full/);
    assert.match(source, /style: \{ width: modal.size \}/);
    assert.match(source, /!fillViewport && \{ style:/);
  });

  it('centers a max-1400px card on desktop so 80% width is not left-aligned', () => {
    assert.match(source, /isComposer && !touch/);
    assert.match(source, /items-center justify-center/);
    assert.match(source, /max-w-\[1400px\]/);
    assert.match(source, /p-\[32px\]/);
    assert.match(source, /data-pq-composer-shell/);
  });

  it('keeps the empty desktop picker wide enough for Next available, Save as draft, Select channels', () => {
    assert.match(css, /data-pq-composer-empty='1'/);
    assert.match(css, /min\(960px, calc\(100vw - 64px\)\)/);
    assert.doesNotMatch(css, /min\(720px, calc\(100vw - 64px\)\)/);
    assert.match(css, /\[data-pq='composer-ai-rail'\],\s*\[data-pq='composer-ai-dock'\]/);
    assert.match(manage, /!dummy && hasChannels && \(/);
    assert.ok(
      (manage.match(/!dummy && hasChannels && \(/g) || []).length >= 4,
      'Tags, Repeat and Post Now stay behind hasChannels'
    );
    assert.match(manage, /<ComposeWhen/);
    assert.match(manage, /t\('save_as_draft', 'Save as Draft'\)/);
    assert.match(manage, /t\('select_channels', 'Select channels'\)/);
  });
});
