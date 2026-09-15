import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const calendar = readFileSync(
  fileURLToPath(new URL('./calendar.tsx', import.meta.url)),
  'utf8',
);
const manage = readFileSync(
  fileURLToPath(
    new URL('../new-launch/manage.modal.tsx', import.meta.url)
  ),
  'utf8',
);
const posts = readFileSync(
  fileURLToPath(new URL('./posts.panel.tsx', import.meta.url)),
  'utf8',
);

describe('phone calendar and composer', () => {
  it('renders week as a day-chip agenda instead of a 7-column grid', () => {
    assert.match(calendar, /const MobileWeekAgenda/);
    assert.match(calendar, /mobile \? \(\s*<MobileWeekAgenda/);
    assert.match(calendar, /data-tour="cal-grid"/);
    assert.match(calendar, /flex min-h-\[44px\] min-w-0 flex-1/);
    assert.match(calendar, /day\.format\('dd'\)/);
    assert.match(calendar, /data-cal-sticky-head="1"/);
    assert.doesNotMatch(calendar, /min-w-\[52px\]/);
  });

  it('renders month as a compact date picker on phone', () => {
    assert.match(calendar, /const MobileMonthAgenda/);
    assert.match(calendar, /grid-cols-7/);
  });

  it('disables HTML5 drag on phone and tablet', () => {
    assert.match(calendar, /canDrag: !demo && !touch/);
    assert.match(posts, /canDrag: !demo && post.state !== 'PUBLISHED' && !touch/);
  });

  it('hides the collapsed 44px posts rail on phone and tablet', () => {
    assert.match(posts, /if \(touch\) return null;/);
  });

  it('splits composer into Edit and Preview panes on phone and tablet', () => {
    assert.match(manage, /composerPane/);
    assert.match(manage, /setComposerPane\('preview'\)/);
    assert.match(manage, /touch \? 'flex-col' : 'flex-row overflow-hidden'/);
    assert.match(manage, /flex min-h-0 flex-1/);
    assert.match(manage, /!touch &&/);
    const editor = readFileSync(
      fileURLToPath(
        new URL('../new-launch/editor.tsx', import.meta.url)
      ),
      'utf8',
    );
    assert.match(editor, /<ComposeAiAssistant \/>/);
    assert.doesNotMatch(manage, /max-h-\[340px\]/);
  });

  it('keeps the desktop composer as a centered card, not edge-to-edge', () => {
    assert.match(manage, /data-pq="composer-shell"/);
    assert.match(manage, /data-pq="composer-card"/);
    assert.match(manage, /data-pq="composer-preview"/);
    assert.match(manage, /max-w-\[min\(1440px,calc\(100vw-48px\)\)\]/);
    assert.match(manage, /h-\[calc\(100dvh-48px\)\] max-w-\[min\(1440px,calc\(100vw-48px\)\)\]/);
    assert.match(manage, /max-w-\[min\(720px,calc\(100vw-48px\)\)\]/);
    assert.match(manage, /w-\[440px\] shrink-0 bg-pqBg/);
    assert.match(manage, /p-\[24px\]/);
    assert.doesNotMatch(manage, /w-\[580px\]/);
    assert.doesNotMatch(manage, /max-w-\[840px\]/);
    assert.doesNotMatch(manage, /p-\[40px\]/);
    const editor = readFileSync(
      fileURLToPath(
        new URL('../new-launch/editor.tsx', import.meta.url)
      ),
      'utf8',
    );
    assert.match(editor, /data-pq="composer-editor"/);
    assert.match(editor, /min-h-\[112px\]/);
    assert.match(editor, /data-pq="composer-ai-hint"/);
    assert.match(editor, /flex min-w-0 items-center gap-\[8px\]/);
    assert.match(editor, /trailing=\{/);
    assert.match(editor, /<ComposeAiAssistant \/>/);
    assert.match(editor, /\{threadAction\}/);
    assert.doesNotMatch(editor, /className="bg-pqInner flex-1"/);
    assert.doesNotMatch(editor, /w-full h-\[46px\] bg-pqInner cursor-text/);
    assert.doesNotMatch(editor, /flex-col gap-\[8px\]/);
  });

  it('keeps X/general preview photos inside a feed aspect frame', () => {
    const preview = readFileSync(
      fileURLToPath(
        new URL('../launches/general.preview.component.tsx', import.meta.url)
      ),
      'utf8',
    );
    assert.match(preview, /PreviewMediaFrame/);
    assert.match(preview, /FEED_PREVIEW_MIN_WH/);
    assert.match(preview, /FEED_PREVIEW_MAX_WH/);
    const hop = readFileSync(
      fileURLToPath(
        new URL('../new-launch/providers/high.order.provider.tsx', import.meta.url)
      ),
      'utf8',
    );
    assert.match(hop, /postHasPreview\(value\?\.\[0\]\)/);
  });

  it('keeps the composer footer from overlapping on phone and tablet', () => {
    assert.match(manage, /grid w-full grid-cols-2/);
    assert.match(manage, /t\('select_channels', 'Select channels'\)/);
    assert.match(manage, /data-pq="composer-footer"/);
    assert.match(manage, /data-pq="composer-publish"/);
    assert.match(manage, /max-\[1179px\]:!ml-0 max-\[1179px\]:w-full max-\[1179px\]:!flex-none/);
    const tags = readFileSync(
      fileURLToPath(new URL('./tags.component.tsx', import.meta.url)),
      'utf8',
    );
    const repeat = readFileSync(
      fileURLToPath(new URL('./repeat.component.tsx', import.meta.url)),
      'utf8',
    );
    const editor = readFileSync(
      fileURLToPath(
        new URL('../new-launch/editor.tsx', import.meta.url)
      ),
      'utf8',
    );
    assert.match(manage, /data-pq="composer-empty"/);
    assert.match(manage, /select_a_channel_to_create_a_post/);
    assert.match(manage, /when_to_post/);
    const notify = readFileSync(
      fileURLToPath(
        new URL('../new-launch/compose.notify.tsx', import.meta.url)
      ),
      'utf8',
    );
    assert.match(manage, /<ComposeNotify/);
    assert.match(manage, /!dummy && hasChannels &&/);
    assert.match(manage, /\[PQ_NOTIFY_SETTING\]: notifyOnPublish/);
    assert.match(notify, /data-pq="composer-notify"/);
    assert.match(tags, /t\('tags', 'Tags'\)/);
    assert.doesNotMatch(tags, /touch \? t\('tags', 'Tags'\)/);
    assert.match(repeat, /aria-label=\{ariaLabel\}/);
    assert.match(repeat, /t\('repeat_post_every', 'Repeat'\)/);
    assert.match(editor, /data-pq="composer-ai-hint"/);
    assert.match(editor, /flex min-w-0 items-center gap-\[8px\] overflow-hidden border-t border-pqLine/);
    assert.match(editor, /trailing=\{/);
    assert.match(editor, /<ComposeAiAssistant \/>/);
    assert.match(editor, /\{threadAction\}/);
    assert.match(editor, /ComposeFirstComment/);
    assert.match(editor, /firstCommentMode/);
    assert.doesNotMatch(editor, /flex-col gap-\[8px\] overflow-hidden border-t/);
    assert.doesNotMatch(manage, /check_circles_above/);
  });

  it('keeps channel settings in the compose flow, not a takeover or accordion', () => {
    assert.match(manage, /data-pq="composer-settings"/);
    assert.match(manage, /id="social-settings"/);
    assert.match(manage, /channel_settings_hint/);
    assert.match(manage, /role="region"/);
    assert.doesNotMatch(manage, /aria-expanded=\{showSettings\}/);
    assert.doesNotMatch(manage, /showSettings && 'flex min-h-0 flex-1 flex-col pt-\[12px\]'/);
    assert.doesNotMatch(manage, /!showSettings && 'hidden'/);
  });

  it('opens Day/Week/Month from a single View sheet on phone', () => {
    const filters = readFileSync(
      fileURLToPath(new URL('./filters.tsx', import.meta.url)),
      'utf8',
    );
    assert.match(filters, /data-cal-view-sheet/);
    assert.match(filters, /viewSheetOpen/);
    assert.match(filters, /\{mobile && !isListView && \(/);
  });

  it('hides the calendar/list segment on phone and keeps it on tablet', () => {
    const filters = readFileSync(
      fileURLToPath(new URL('./filters.tsx', import.meta.url)),
      'utf8',
    );
    assert.doesNotMatch(filters, /data-posts-toggle/);
    assert.match(filters, /\{!isListView && !mobile && \(/);
    assert.match(filters, /\{!mobile && \(/);
  });

  it('shows the Move sheet instead of HTML5 drag on phone and tablet', () => {
    const move = readFileSync(
      fileURLToPath(
        new URL('../layout/move-post-sheet.tsx', import.meta.url)
      ),
      'utf8',
    );
    assert.match(move, /if \(!touch\) return null;/);
  });
});

const addProvider = readFileSync(
  fileURLToPath(new URL('./add.provider.component.tsx', import.meta.url)),
  'utf8',
);
const newPost = readFileSync(
  fileURLToPath(new URL('./new.post.tsx', import.meta.url)),
  'utf8',
);

describe('phone chrome and channel picker', () => {
  it('uses the viewport to drive the Add Channel list even when isMobile is unset', () => {
    assert.match(addProvider, /const phone = Boolean\(isMobile\) \|\| mobile/);
    assert.match(addProvider, /phone && 'flex flex-col gap-\[8px\]'/);
  });

  it('opens nested Add Channel steps fullscreen on phone and tablet', () => {
    assert.match(addProvider, /const \{ mobile, touch \} = useViewport\(\)/);
    assert.match(addProvider, /\.\.\.\(touch \? \{ removeLayout: true, fullScreen: true \} : \{\}\)/);
  });

  it('renders Create Post as a 44px plus on phone and a 44px labelled split on tablet', () => {
    assert.match(
      newPost,
      /mobile \? 'size-\[44px\]' : touch \? 'h-\[44px\]' : 'h-\[36px\]'/,
    );
    assert.match(newPost, /\{\!mobile && \(/);
  });
});
