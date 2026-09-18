import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./plug.tsx', import.meta.url)),
  'utf8'
);
const automations = readFileSync(
  fileURLToPath(
    new URL('../channels/channel.automations.tsx', import.meta.url)
  ),
  'utf8'
);
const channels = readFileSync(
  fileURLToPath(
    new URL('../channels/channels.component.tsx', import.meta.url)
  ),
  'utf8'
);
const settings = readFileSync(
  fileURLToPath(
    new URL('../launches/settings.modal.tsx', import.meta.url)
  ),
  'utf8'
);
const timeTable = readFileSync(
  fileURLToPath(
    new URL('../launches/time.table.tsx', import.meta.url)
  ),
  'utf8'
);
const botPicture = readFileSync(
  fileURLToPath(
    new URL('../launches/bot.picture.tsx', import.meta.url)
  ),
  'utf8'
);
const modal = readFileSync(
  fileURLToPath(
    new URL('../layout/new-modal.tsx', import.meta.url)
  ),
  'utf8'
);

describe('plug dialog', () => {
  it('sizes likes-only and plug-plus-post on the same 460 card', () => {
    assert.match(source, /plugDialogWidth/);
    assert.match(source, /: 460 => 460/);
    assert.doesNotMatch(source, /\? 460 : 400/);
    assert.match(source, /compact: plugDialogWidth\(p\.fields\)/);
  });

  it('does not leave the post field at min-h-40', () => {
    // Important, not plain: CopilotTextarea's Slate `Editable` writes the
    // measured placeholder height back as an inline `style.minHeight` while
    // the field is empty, and an inline declaration beats a stylesheet rule
    // that is not important. A plain `min-h-*` here painted tall and then
    // collapsed to one line. `autopost.tsx` and `signatures.component.tsx`
    // mark theirs the same way.
    assert.match(source, /!min-h-\[110px\] !max-h-\[180px\]/);
    assert.doesNotMatch(source, /[^!]min-h-\[110px\]/);
    assert.match(source, /overflow-x-hidden/);
    assert.match(source, /resize-none/);
    assert.doesNotMatch(source, /resize-y/);
    assert.doesNotMatch(source, /!min-h-40/);
    assert.match(source, /data-pq="plug-form"/);
  });

  it('opens the compact card from Automations and Auto-Plugs', () => {
    assert.match(automations, /plugDialogWidth\(plug\.fields\)/);
  });
});

describe('channel dialogs', () => {
  it('opts publishing options, group, custom URL, slots and bot picture out of the 600px floor', () => {
    assert.match(modal, /compact\?: 400 \| 420 \| 460/);
    assert.match(modal, /compactModalClass\(modal\.compact\)/);
    assert.match(channels, /compact: 420/);
    assert.match(channels, /compact: 460/);
    assert.match(channels, /publishing_options/);
    assert.match(settings, /data-pq="publishing-options"/);
    assert.match(settings, /ModalFormActions/);
    assert.match(settings, /copy\.status/);
    assert.match(timeTable, /data-pq="time-table"/);
    assert.match(timeTable, /ModalFormActions/);
    assert.match(botPicture, /ChannelAvatar/);
    assert.doesNotMatch(botPicture, /no-picture\.jpg/);
  });
});
