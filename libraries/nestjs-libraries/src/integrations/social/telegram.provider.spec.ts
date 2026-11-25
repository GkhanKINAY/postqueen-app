import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import striptags from 'striptags';
import ts from 'typescript';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';

// The provider imports `mime`, which the root tsconfig maps to its .d.ts, so
// it cannot be loaded under tsx; the rules are read from the source instead.
const provider = readFileSync(
  fileURLToPath(new URL('./telegram.provider.ts', import.meta.url)),
  'utf8'
);
const classBody = provider.slice(provider.indexOf('export class TelegramProvider'));
const checkValidity = provider.slice(
  provider.indexOf('override async checkValidity('),
  provider.indexOf('async refreshToken(')
);
const sendMessage = provider.slice(provider.indexOf('private async sendMessage('));

describe('Telegram caption limit', () => {
  it('keeps 4,096 for a text message', () => {
    assert.match(provider, /maxLength\(\) \{\s*return 4096;/);
  });

  it('holds any entry that carries media to 1,024, counted as displayed', () => {
    assert.match(
      checkValidity,
      /\(media\?\.length \?\? 0\) > 0 &&\s*telegramLength\(texts\[index\] \|\| ''\) > 1024/
    );
    // Displayed: without tags, and an entity counts as one character.
    assert.match(
      provider,
      /const telegramLength = \(message: string\) =>\s*striptags\(telegramText\(message\)\)\.replace\(\s*new RegExp\(`&\$\{TELEGRAM_ENTITY\}`, 'gi'\),\s*'&'\s*\)\.length;/
    );
    assert.match(
      checkValidity,
      /'Telegram captions can be at most 1,024 characters when the message has media'/
    );
  });

  it('measures the same text it sends', () => {
    assert.match(sendMessage, /const text = telegramText\(message\.message\);/);
  });
});

describe('Telegram HTML text', () => {
  const helpers = provider.slice(
    provider.indexOf('const TELEGRAM_ENTITY'),
    provider.indexOf('const telegramLength')
  );

  it('escapes a bare "&", "<" and ">" again, since the html path decoded them', () => {
    assert.match(
      helpers,
      /const TELEGRAM_ENTITY = '\(\?:amp\|lt\|gt\|quot\|#\\\\d\+\|#x\[\\\\da-f\]\+\);';/
    );
    assert.match(
      helpers,
      /\.replace\(new RegExp\(`&\(\?!\$\{TELEGRAM_ENTITY\}\)`, 'gi'\), '&amp;'\)\s*\.replace\(\/<\/g, '&lt;'\)\s*\.replace\(\/>\/g, '&gt;'\)/
    );
  });

  it('reads only the tags the html path keeps as tags, and escapes the text between them', () => {
    assert.match(
      helpers,
      /\.split\(\/\(<\\\/\?\(\?:p\|strong\|u\|a\|ul\|li\|h\[1-3\]\|br\)\(\?:\\s\[\^<>\]\*\)\?>\)\/\)\s*\.map\(\(part, index\) =>\s*index % 2\s*\? striptags\(part, \['u', 'strong', 'p', 'br'\]\)\s*: telegramEscape\(part\)\s*\)/
    );
    // Still bold as <b> and a line per paragraph, including the
    // <p dir="auto"> the editor writes.
    assert.match(helpers, /\.replace\(\/<strong>\/g, '<b>'\)/);
    assert.match(
      helpers,
      /\.replace\(\/<p\(\?:\\s\[\^>\]\*\)\?>\(\.\*\?\)<\\\/p>\/g, '\$1\\n'\)/
    );
  });

  // The helpers are module constants with no imports but striptags, so they
  // are run from the source the same way the rules above are read from it.
  const { telegramText, telegramLength } = runInNewContext(
    `${
      ts.transpileModule(
        provider.slice(
          provider.indexOf('const TELEGRAM_ENTITY'),
          provider.indexOf('const sendSingleMedia')
        ),
        { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
      ).outputText
    }; ({ telegramText, telegramLength });`,
    { striptags }
  ) as {
    telegramText: (message: string) => string;
    telegramLength: (message: string) => number;
  };
  // What the publish activity hands Telegram, whose editor is 'html'.
  const sent = (content: string) =>
    telegramText(stripHtmlValidation('html', content, true));

  it('sends a soft line break as a newline inside the paragraph', () => {
    assert.equal(
      sent('<p dir="auto">one<br>two</p><p dir="auto">three</p>'),
      'one\ntwo\nthree\n'
    );
    assert.equal(sent('<p>a<br><br><br>b</p>'), 'a\n\n\nb\n');
    for (const spelling of ['<br/>', '<br />', '<br class="x">']) {
      assert.equal(sent(`<p>one${spelling}two</p>`), 'one\ntwo\n');
    }
  });

  it('keeps bold and underline that span it, and leaves no tag Telegram refuses', () => {
    const text = sent(
      '<p><strong>ab<br>cd</strong> <u>ef<br>gh</u></p><ul><li><p>i<br>j</p></li></ul>'
    );
    assert.equal(text, '<b>ab\ncd</b> <u>ef\ngh</u>\ni\nj\n');
    assert.doesNotMatch(text, /&lt;br|<br|<\/?p\b|<\/?li\b/);
  });

  it('counts a soft line break as one character', () => {
    assert.equal(telegramLength(stripHtmlValidation('html', '<p>ab<br>cd</p>')), 6);
  });

  it('still escapes a typed tag next to a break', () => {
    assert.equal(
      sent('<p>&lt;br&gt; is a tag<br>x &lt;3</p>'),
      '&lt;br&gt; is a tag\nx &lt;3\n'
    );
  });
});

describe('Telegram connect clean-up', () => {
  it('counts the chat owner as an admin that can delete messages', () => {
    const botIsAdmin = provider.slice(provider.indexOf('async botIsAdmin('));
    assert.match(
      botIsAdmin,
      /if \(member\.status === 'creator'\) \{\s*return true;\s*\}/
    );
    assert.match(
      botIsAdmin,
      /if \(member\.status === 'administrator'\) \{\s*return !!member\.can_delete_messages;/
    );
  });
});

describe('Telegram media groups', () => {
  it('sends a lone leftover item with the single-file method', () => {
    const loop = sendMessage.slice(sendMessage.indexOf('const mediaGroups'));
    assert.match(
      loop,
      /if \(mediaGroups\[i\]\.length === 1\) \{\s*await sendSingleMedia\(accessToken, mediaGroups\[i\]\[0\], \{\}\);\s*continue;\s*\}/
    );
    // It is checked before the group is built, so sendMediaGroup never sees one.
    assert.ok(
      loop.indexOf('mediaGroups[i].length === 1') <
        loop.indexOf('telegramBot.sendMediaGroup')
    );
  });

  it('picks the method by type for single files, as before', () => {
    const single = provider.slice(provider.indexOf('const sendSingleMedia = ('));
    assert.match(single, /media\.type === 'video'\s*\? telegramBot\.sendVideo\(/);
    assert.match(single, /media\.type === 'photo'\s*\? telegramBot\.sendPhoto\(/);
    assert.match(single, /: telegramBot\.sendDocument\(/);
  });

  it('keeps the single-file sender off the class, out of /integrations/function', () => {
    assert.ok(provider.indexOf('const sendSingleMedia = (') < provider.indexOf('export class TelegramProvider'));
    assert.doesNotMatch(classBody, /^\s+(private\s+)?sendSingleMedia\(/m);
  });

  it('still captions and threads a message with one file', () => {
    assert.match(
      sendMessage,
      /processedMedia\.length === 1\) \{\s*const response = await sendSingleMedia\(\s*accessToken,\s*processedMedia\[0\],\s*\{\s*caption: text,/
    );
    assert.match(sendMessage, /reply_to_message_id: replyToMessageId/);
  });
});

describe('Telegram refusals', () => {
  const handleErrors = classBody.slice(
    classBody.indexOf('override handleErrors('),
    classBody.indexOf('private async sendMessageInternal(')
  );
  const catchBlock = sendMessage.slice(
    sendMessage.indexOf('} catch (error: any) {'),
    sendMessage.indexOf('override handleErrors(')
  );

  // The workflow publishes an untyped error again, up to five times, and
  // Telegram refuses it again each time.
  it('throws Disconnect or BadBody from the classification, and rethrows the rest', () => {
    assert.match(
      catchBlock,
      /error\?\.code === 'ETELEGRAM' && body\s*\?\s*this\.handleErrors\(JSON\.stringify\(body\), body\.error_code\)/
    );
    assert.match(
      catchBlock,
      /handleError\?\.type === 'disconnect'\) \{\s*throw new Disconnect\(/
    );
    assert.match(catchBlock, /if \(handleError\) \{\s*throw new BadBody\(/);
    assert.match(catchBlock, /\}\s*throw error;\s*\}\s*\}/);
  });

  it('classifies on error_code: 429 with retry_after, 403 disconnects', () => {
    assert.match(handleErrors, /const code = parsed\.error_code \?\? status;/);
    assert.match(
      handleErrors,
      /if \(code === 429\) \{\s*const seconds = parsed\.parameters\?\.retry_after;/
    );
    assert.match(
      handleErrors,
      /`Telegram paused the bot for \$\{seconds\} seconds\. Reschedule the post\.`/
    );
    assert.match(
      handleErrors,
      /parsed\.error_code === 403 \|\|\s*parsed\.parameters\?\.migrate_to_chat_id \|\|\s*\(code === 400 && \/chat not found\/i\.test\(description\)\)\s*\) \{\s*return \{\s*type: 'disconnect',/
    );
  });

  it('asks for rights before it disconnects, and keeps other 400s as BadBody', () => {
    assert.ok(
      handleErrors.indexOf('not enough rights|need administrator rights') <
        handleErrors.indexOf('parsed.error_code === 403 ||')
    );
    assert.match(
      handleErrors,
      /'Give the PostQueen bot permission to post messages and media in this chat\.'/
    );
    assert.match(
      handleErrors,
      /if \(code === 400\) \{[\s\S]*type: 'bad-body',[\s\S]*By link it accepts photos up to 5 MB and other files up to 20 MB\./
    );
  });
});
