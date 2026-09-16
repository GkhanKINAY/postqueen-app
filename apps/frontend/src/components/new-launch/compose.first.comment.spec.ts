import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./compose.first.comment.tsx', import.meta.url)),
  'utf8',
);
const editor = readFileSync(
  fileURLToPath(new URL('./editor.tsx', import.meta.url)),
  'utf8',
);
const delay = readFileSync(
  fileURLToPath(new URL('./delay.component.tsx', import.meta.url)),
  'utf8',
);
const bold = readFileSync(
  fileURLToPath(new URL('./bold.text.tsx', import.meta.url)),
  'utf8',
);
const underline = readFileSync(
  fileURLToPath(new URL('./u.text.tsx', import.meta.url)),
  'utf8',
);
const information = readFileSync(
  fileURLToPath(new URL('../launches/information.component.tsx', import.meta.url)),
  'utf8',
);

describe('composer first comment', () => {
  it('stays collapsed behind a pink Add comment trigger', () => {
    assert.match(source, /data-pq="composer-first-comment-trigger"/);
    assert.match(source, /data-pq="composer-add-comment-trigger"/);
    assert.match(source, /t\('add_comment', 'Add comment'\)/);
    assert.match(source, /bg-pqPink/);
    assert.match(source, /w-full/);
    assert.match(editor, /commentDraftOpen/);
    assert.match(editor, /showComments/);
    assert.doesNotMatch(editor, /firstCommentFilled/);
    assert.doesNotMatch(
      editor,
      /firstCommentMode && index === 0 \? \(\s*<ComposeFirstComment/,
    );
  });

  it('is a field, not a second compose box', () => {
    assert.match(source, /data-pq="composer-first-comment"/);
    assert.match(source, /first_comment/);
    assert.match(source, /your_comment/);
    assert.doesNotMatch(source, /EditorContent/);
    assert.match(source, /<textarea/);
    assert.match(source, /bg-pqInner/);
  });

  it('aligns comment tools with the post toolbar icon chips', () => {
    assert.match(source, /data-pq="composer-first-comment-tools"/);
    assert.match(source, /<SignatureBox editor=\{signatureEditor\} \/>/);
    assert.doesNotMatch(source, /add_signature/);
    assert.doesNotMatch(source, /<span>Bold<\/span>/);
    assert.doesNotMatch(source, /t\('insert_emoji', 'Insert Emoji'\)<\/span>/);
    assert.match(source, /w-\[36px\]/);
    assert.match(source, /applyUnicodeBold/);
    assert.match(source, /applyUnicodeUnderline/);
    assert.match(source, /insert_emoji/);
    assert.match(source, /<MultiMediaComponent/);
    assert.match(source, /attachmentsOnly/);
    assert.match(source, /largeThumbs/);
    assert.match(bold, /export function applyUnicodeBold/);
    assert.match(underline, /export function applyUnicodeUnderline/);
  });

  it('keeps delay distinct from Bold / Signature / emoji chips', () => {
    assert.match(source, /data-pq="composer-first-comment-meta"/);
    assert.match(source, /<DelayComponent/);
    assert.match(source, /toolbar/);
    assert.match(delay, /toolbar\?: boolean/);
    assert.match(delay, /data-pq=\{toolbar \? 'composer-comment-delay'/);
    assert.match(delay, /t\('delay_comment', 'Delay comment'\)/);
    assert.match(delay, /data-tooltip-id=\{toolbar \? undefined : 'tooltip'\}/);
    const toolbarClass = delay.slice(
      delay.indexOf("toolbar\n            ? '"),
      delay.indexOf(": 'h-[24px]"),
    );
    assert.match(toolbarClass, /text-pqMuted/);
    assert.doesNotMatch(toolbarClass, /bg-pqBtnSimple/);
  });

  it('reuses the post character counter — empty open comments are invalid', () => {
    assert.match(source, /<InformationComponent/);
    assert.match(source, /variant="comment"/);
    assert.doesNotMatch(source, /requireContent=\{false\}/);
    assert.match(source, /totalAllowedChars/);
    assert.match(source, /totalChars=\{value\.length\}/);
    assert.match(editor, /chars=\{chars\}/);
    assert.match(editor, /totalAllowedChars=\{totalChars\}/);
    assert.match(
      information,
      /your_post_should_have_at_least_one_character_or_one_image/,
    );
    assert.match(
      information,
      /your_comment_should_have_at_least_one_character_or_one_image/,
    );
    assert.match(information, /requireContent && !isPicture && !totalChars/);
    assert.match(information, /variant === 'comment'/);
  });

  it('uses the First Comment card on every editable channel, including threads', () => {
    assert.match(editor, /const firstCommentMode = canEdit;/);
    assert.doesNotMatch(
      editor,
      /firstCommentMode =\s*canEdit && postComment !== PostComment\.POST/,
    );
    assert.match(editor, /data-pq="composer-comments"/);
    assert.match(
      editor,
      /\{comments \? \(\s*<div className="border-t border-pqLine px-\[12px\] py-\[10px\]">\s*<AddPostButton/,
    );
    assert.match(editor, /wide/);
  });

  it('uses the posts array so extra comments are a thread, not a new API', () => {
    assert.match(editor, /ensureFirstComment/);
    assert.match(editor, /!comment\.delay/);
    assert.match(editor, /items\.slice\(1\)/);
    assert.match(editor, /firstCommentMode && index >= 1/);
    assert.match(editor, /addValue\(items\.length - 1\)/);
    assert.match(editor, /setCommentText/);
    assert.match(editor, /onRemove=\{removeComment\(commentIndex\)\}/);
    assert.match(source, /data-pq="composer-first-comment-remove"/);
    assert.match(source, /onRemove \? \(/);
    assert.match(source, /t\('remove', 'Remove'\)/);
    assert.doesNotMatch(editor, /commentIndex > 1/);
  });

  it('does not preview or publish empty follow-up comments', () => {
    const hop = readFileSync(
      fileURLToPath(new URL('./providers/high.order.provider.tsx', import.meta.url)),
      'utf8',
    );
    const strip = readFileSync(
      fileURLToPath(
        new URL(
          '../../../../../libraries/helpers/src/utils/strip.html.validation.ts',
          import.meta.url,
        ),
      ),
      'utf8',
    );
    assert.match(strip, /export const dropEmptyFollowUps/);
    assert.match(hop, /dropEmptyFollowUps\(value\)/);
    assert.match(hop, /values: dropEmptyFollowUps\(value\)/);
  });
});
