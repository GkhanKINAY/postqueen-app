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
const repeat = readFileSync(
  fileURLToPath(new URL('../launches/repeat.component.tsx', import.meta.url)),
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
    assert.match(manage, /data-pq="composer-footer-tag"/);
    assert.match(manage, /!dummy && !hasChannels/);
    assert.match(manage, /justify-between/);
    assert.match(manage, /!phoneFlow && !hasChannels/);
    assert.match(manage, /disabled:opacity-40/);
    assert.match(manage, /selectedIntegrations\.length === 0 \|\| loading \|\| locked/);
    assert.match(manage, /<ComposeWhen/);
    assert.match(manage, /data-pq="composer-ai"/);
    assert.match(manage, /w-\[min\(520px,38vw\)\]/);
    assert.doesNotMatch(manage, /fixed inset-0 z-\[401\]/);
    assert.doesNotMatch(css, /html:has\(\[data-pq-composer-max='1'\]\) \[data-pq-composer-shell\] \{\s*padding: 0 !important;/);
  });

  it('puts Repeat Post Every in the footer after a channel is picked, not truncated in the header', () => {
    const extrasStart = manage.indexOf('data-pq="composer-header-extras"');
    const extrasEnd = manage.indexOf('ComposerStepTabs', extrasStart);
    const extras = manage.slice(extrasStart, extrasEnd);
    assert.ok(extrasStart > 0 && extrasEnd > extrasStart);
    assert.match(extras, /TagsComponent/);
    assert.match(extras, /ComposeNotify/);
    assert.doesNotMatch(extras, /RepeatComponent/);
    assert.match(manage, /data-pq="composer-footer-repeat"/);
    assert.match(manage, /<RepeatComponent/);
    assert.match(repeat, /t\('repeat_post_every', 'Repeat Post Every'\)/);
    assert.doesNotMatch(repeat, /Repeat Post Every\.\.\./);
    assert.match(repeat, /whitespace-nowrap/);
  });
});
