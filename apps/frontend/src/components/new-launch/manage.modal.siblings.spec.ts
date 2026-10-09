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

  it('never republishes a sibling that already went out', () => {
    assert.match(
      manage,
      /if \(type === 'now' \|\| type === 'schedule'\) \{\s*for \(const p of others\) \{\s*if \(published\.includes\(p\)\) \{\s*saveAs\[p\.integration\] = 'update';/
    );
  });

  it('saves only the channel in view on "Only {name}"', () => {
    assert.match(manage, /if \(whichChannels === 'only'\) \{\s*onlyChannel = true;/);
    assert.match(
      manage,
      /const allValues = onlyChannel\s*\? editorValues\.filter\(\(post: any\) => post\.id === channel\.integration\)\s*: editorValues;/
    );
  });

  it('offers deleting from the channel in view first', () => {
    const dialog = manage.slice(
      manage.indexOf("id: 'delete-post-channels'"),
      manage.indexOf("'delete_from_all_channels'")
    );
    const only = dialog.indexOf("'delete_only_from_channel'");
    assert.ok(only > -1);
    // The primary button comes first; the all-channels one is secondary.
    assert.doesNotMatch(dialog.slice(dialog.lastIndexOf('<Button', only), only), /secondary/);
    assert.match(dialog.slice(only), /secondary/);
    assert.match(manage, /'delete_all_channels_cancels_scheduled'/);
  });
});
