import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const manage = readFileSync(
  fileURLToPath(new URL('./manage.modal.tsx', import.meta.url)),
  'utf8'
);
const selectCurrent = readFileSync(
  fileURLToPath(new URL('./select.current.tsx', import.meta.url)),
  'utf8'
);

describe('composer: a post saved with other channels', () => {
  it('counts only the siblings whose channel is in the editor', () => {
    assert.match(
      manage,
      /\(existingData\.siblings \|\| \[\]\)\.filter\(\(sibling\) =>\s*integrations\.some\(\(p\) => p\.id === sibling\.integration\)/
    );
    assert.match(manage, /const hasSiblings = existingPosts\.length > 1;/);
    // Every sibling decision reads the filtered list, not the raw siblings.
    assert.doesNotMatch(manage, /existingData\.siblings\?\.length/);
    assert.match(selectCurrent, /existingData\.siblings\?\.some\(\(sibling\) =>\s*selectedIntegrations\.some/);
  });

  it('lists the channels in the order of the editor', () => {
    assert.match(
      manage,
      /const existingPosts = sortBy\([\s\S]*?\(p\) => integrations\.findIndex\(\(i\) => i\.id === p\.integration\)\s*\);/
    );
  });

  it('posts a sibling that already went out again only when it is ticked', () => {
    assert.match(manage, /const out = published\.includes\(p\) && !waiting\(p\);/);
    // A channel that went out starts unticked.
    assert.match(manage, /checked:\s*same \|\|\s*\(!out &&/);
    assert.match(
      manage,
      /republish =\s*type !== 'draft' &&\s*published\.some\(\(p\) => ticked\.includes\(p\.integration\)\);/
    );
    // The republish question is for a post on one channel only.
    assert.match(manage, /const republishing = hasSiblings \? \[\] : published;/);
  });

  it('keeps the unticked channels in their state', () => {
    assert.match(
      manage,
      /if \(!ticked\.includes\(p\.integration\)\) \{\s*saveAs\[p\.integration\] = asItIs\(p\);/
    );
    assert.match(manage, /'unticked_channels_saved_note'/);
  });

  it('starts the delete checklist with the channel in view only', () => {
    const dialog = manage.slice(
      manage.indexOf("id: 'delete-post-channels'"),
      manage.indexOf("'delete_from_channels'")
    );
    assert.match(dialog, /<ChannelsChecklist/);
    assert.match(dialog, /checked: p === channel,/);
    assert.match(dialog, /needsChannel=\{true\}/);
    assert.match(dialog, /danger=\{true\}/);
  });

  it('replaces the all-or-only dialogs with the channel checklist', () => {
    for (const key of [
      'delete_from_all_channels',
      'delete_only_from_channel',
      'only_channel_name',
      'draft_all_channels',
      'post_now_all_channels',
      'schedule_all_channels',
    ]) {
      assert.doesNotMatch(manage, new RegExp(`'${key}'`));
    }
    assert.match(manage, /const ChannelsChecklist: FC</);
    // Its rows are tickable buttons, never a form checkbox nested in a row.
    assert.match(manage, /role="checkbox"\s*aria-checked=\{on\}/);
  });

  it('says a moved date posts now instead of "already published"', () => {
    assert.match(manage, /const waits = republishing\.every\(waiting\);/);
    assert.match(manage, /'post_date_passed_post_now_warning'/);
  });
});
