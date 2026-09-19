import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

// The provider imports `mime`, which the root tsconfig maps to its .d.ts, so
// it cannot be loaded under tsx; the rules are read from the source instead.
const provider = readFileSync(
  fileURLToPath(new URL('./telegram.provider.ts', import.meta.url)),
  'utf8'
);
const checkValidity = provider.slice(
  provider.indexOf('override async checkValidity('),
  provider.indexOf('async refreshToken(')
);
const sendMessage = provider.slice(provider.indexOf('private async sendMessage('));

describe('Telegram caption limit', () => {
  it('keeps 4,096 for a text message', () => {
    assert.match(provider, /maxLength\(\) \{\s*return 4096;/);
  });

  it('holds any entry that carries media to 1,024', () => {
    assert.match(
      checkValidity,
      /\(media\?\.length \?\? 0\) > 0 && \(texts\[index\] \|\| ''\)\.length > 1024/
    );
    assert.match(
      checkValidity,
      /'Telegram captions can be at most 1,024 characters when the message has media'/
    );
  });
});

describe('Telegram media groups', () => {
  it('sends a lone leftover item with the single-file method', () => {
    const loop = sendMessage.slice(sendMessage.indexOf('const mediaGroups'));
    assert.match(
      loop,
      /if \(mediaGroups\[i\]\.length === 1\) \{\s*await this\.sendSingleMedia\(accessToken, mediaGroups\[i\]\[0\], \{\}\);\s*continue;\s*\}/
    );
    // It is checked before the group is built, so sendMediaGroup never sees one.
    assert.ok(
      loop.indexOf('mediaGroups[i].length === 1') <
        loop.indexOf('telegramBot.sendMediaGroup')
    );
  });

  it('picks the method by type for single files, as before', () => {
    const single = provider.slice(provider.indexOf('private sendSingleMedia('));
    assert.match(single, /media\.type === 'video'\s*\? telegramBot\.sendVideo\(/);
    assert.match(single, /media\.type === 'photo'\s*\? telegramBot\.sendPhoto\(/);
    assert.match(single, /: telegramBot\.sendDocument\(/);
  });

  it('still captions and threads a message with one file', () => {
    assert.match(
      sendMessage,
      /processedMedia\.length === 1\) \{\s*const response = await this\.sendSingleMedia\(\s*accessToken,\s*processedMedia\[0\],\s*\{\s*caption: text,/
    );
    assert.match(sendMessage, /reply_to_message_id: replyToMessageId/);
  });
});
