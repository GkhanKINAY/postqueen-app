import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const section = read('./media.settings.section.tsx');
const modal = read('./manage.modal.tsx');
const youtube = read('./providers/youtube/youtube.provider.tsx');
const youtubeProvider = read(
  '../../../../../libraries/nestjs-libraries/src/integrations/social/youtube.provider.ts'
);
const settingsDialog = read('../launches/helpers/media.settings.component.tsx');
const mediaBox = read('../media/media.box.tsx');

describe('Thumbnails and alt text in the post settings', () => {
  it('sits at the top of the settings below the editor', () => {
    assert.match(
      modal,
      /\{t\('settings', 'Settings'\)\}\s*<\/div>\s*<MediaSettingsSection \/>/
    );
    assert.match(section, /<MediaComponentInner/);
    // the store is read when the dialog saves, not when it opened
    assert.match(section, /const state = useLaunchStore\.getState\(\);/);
  });

  it('takes its colours from the pq tokens, and names no other product', () => {
    assert.doesNotMatch(section, /#[0-9a-fA-F]{3,6}\b/);
    assert.doesNotMatch(section, /newBgColorInner|tableBorder|customColor/);
    assert.doesNotMatch(section, /Postiz/i);
    assert.doesNotMatch(youtube, /#FF3F3F|text-\[#/);
  });

  it('leaves the YouTube setting in charge when a post still has one', () => {
    assert.doesNotMatch(youtube, /<MediaComponent/);
    assert.match(youtube, /setValue\('thumbnail', undefined, \{ shouldDirty: true \}\)/);
    assert.match(
      youtubeProvider,
      /settings\?\.thumbnail\?\.path \|\| firstPost\?\.media\?\.\[0\]\?\.thumbnail \|\| ''/
    );
  });
});

describe('Video thumbnail from the library', () => {
  it('opens the library in its jpeg and png mode', () => {
    assert.match(settingsDialog, /type="image-static"/);
    assert.match(settingsDialog, /setThumbnailTimestamp\(null\)/);
    assert.equal(mediaBox.split("? 'image/jpeg,image/png'").length - 1, 2);
    assert.match(
      mediaBox,
      /activeType === 'image-static' &&\s*!\['jpg', 'jpeg', 'png'\]\.some/
    );
  });
});

describe('Saving the media settings', () => {
  it('says saved only when the media library saved it', () => {
    assert.match(
      settingsDialog,
      /if \(response\.ok\) \{\s*onSelect\(await response\.json\(\)\);\s*toaster\.show\(t\('alt_text_saved'/
    );
    // an attachment that is no library row is set on the post, and the toast
    // says the file is not in the library
    assert.match(settingsDialog, /if \(response\.status === 404\) \{\s*onSelect\(\{\s*\.\.\.props\.media,/);
    assert.match(settingsDialog, /'media_settings_saved_on_post'/);
    // a failed upload of the picked frame stops before anything is saved
    assert.match(settingsDialog, /if \(!uploaded\.ok\) \{\s*failed\(\);\s*return;/);
    assert.match(settingsDialog, /maxLength=\{1000\}/);
  });
});
