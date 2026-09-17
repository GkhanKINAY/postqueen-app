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
const tags = readFileSync(
  fileURLToPath(new URL('../launches/tags.component.tsx', import.meta.url)),
  'utf8',
);
const notify = readFileSync(
  fileURLToPath(
    new URL('../new-launch/compose.notify.tsx', import.meta.url)
  ),
  'utf8',
);
const when = readFileSync(
  fileURLToPath(new URL('../new-launch/compose.when.tsx', import.meta.url)),
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
    assert.match(manage, /!dummy && !compactFooter/);
    assert.match(manage, /justify-between/);
    assert.match(manage, /!phoneFlow && \(!compactFooter \|\| !hasChannels\)/);
    assert.match(manage, /disabled:opacity-40/);
    assert.match(manage, /selectedIntegrations\.length === 0 \|\| loading \|\| locked/);
    assert.match(manage, /<ComposeWhen/);
    assert.match(manage, /data-pq="composer-ai"/);
    assert.match(manage, /w-\[min\(520px,38vw\)\]/);
    assert.match(manage, /const tabbedRail = !compactChrome && !maximized/);
    assert.match(manage, /!compactChrome && hasChannels && maximized && \(/);
    assert.doesNotMatch(manage, /fixed inset-0 z-\[401\]/);
    assert.doesNotMatch(css, /html:has\(\[data-pq-composer-max='1'\]\) \[data-pq-composer-shell\] \{\s*padding: 0 !important;/);
  });

  it('puts Tags, Repeat, and Notify in the footer, not the Create Post header', () => {
    assert.doesNotMatch(manage, /data-pq="composer-header-extras"/);
    assert.match(manage, /data-pq="composer-footer-tag"/);
    assert.match(manage, /data-pq="composer-footer-repeat"/);
    assert.match(manage, /data-pq="composer-footer-notify"/);
    assert.match(manage, /<RepeatComponent/);
    assert.match(repeat, /t\('repeat_post_every', 'Repeat Post Every'\)/);
    assert.doesNotMatch(repeat, /Repeat Post Every\.\.\./);
    assert.match(repeat, /whitespace-nowrap/);
    assert.match(tags, /text-\[15px\] font-\[600\]/);
    assert.match(repeat, /text-\[15px\] font-\[600\]/);
    assert.match(manage, /data-pq="composer-footer-notify"/);
    assert.match(notify, /text-\[15px\] font-\[600\]/);
    assert.match(when, /text-\[15px\] font-\[600\] text-pqText/);
    assert.match(
      manage,
      /bg-btnSimple text-\[15px\] font-\[600\]/,
    );
    assert.match(
      manage,
      /bg-pqBrand text-\[15px\] font-\[600\] text-white/,
    );
    assert.doesNotMatch(
      manage,
      /bg-btnSimple text-\[14px\] font-\[600\]/,
    );
  });

  it('leaves space under the Settings cards so they are not flush with the footer', () => {
    assert.match(manage, /data-pq="composer-settings-block"/);
    assert.match(
      manage,
      /data-pq="composer-settings-block"[\s\S]{0,180}pb-\[32px\]/,
    );
    assert.match(
      manage,
      /id="social-content"[\s\S]{0,280}pb-\[32px\]/,
    );
    assert.doesNotMatch(
      manage,
      /id="social-settings"[\s\S]{0,220}bg-pqLine p-\[1px\]/,
    );
  });

  it('drops Post now out of the Schedule split, with quiet icons on the footer actions', () => {
    assert.match(manage, /matchWidth: true/);
    assert.match(manage, /offsetPx: 6/);
    assert.match(manage, /data-pq="composer-post-now-menu"/);
    assert.match(manage, /<ScheduleIcon size=\{16\}/);
    assert.match(manage, /<SendIcon size=\{16\}/);
    assert.match(manage, /<DraftIcon size=\{16\}/);
    assert.match(manage, /aria-haspopup="menu"/);
    assert.match(manage, /rotated=\{postNowOpen\}/);
    assert.doesNotMatch(manage, /w-\[206px\]/);
    assert.doesNotMatch(
      manage,
      /data-pq="composer-post-now-menu"[\s\S]{0,180}p-\[12px\]/,
    );
    const popover = readFileSync(
      fileURLToPath(new URL('./use.anchored.popover.ts', import.meta.url)),
      'utf8',
    );
    assert.match(popover, /matchWidth\?: boolean/);
    const icons = readFileSync(
      fileURLToPath(new URL('../ui/icons/index.tsx', import.meta.url)),
      'utf8',
    );
    assert.match(icons, /export const ScheduleIcon/);
    assert.match(icons, /export const SendIcon/);
    assert.match(icons, /export const DraftIcon/);
  });
});
