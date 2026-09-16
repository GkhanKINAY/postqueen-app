'use client';

import { FC, useCallback, useMemo, useRef, useState } from 'react';
import EmojiPicker from 'emoji-picker-react';
import { Theme } from 'emoji-picker-react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { SignatureBox } from '@gitroom/frontend/components/signature';
import { DelayComponent } from '@gitroom/frontend/components/new-launch/delay.component';
import { MultiMediaComponent } from '@gitroom/frontend/components/media/media.component';
import { applyUnicodeBold } from '@gitroom/frontend/components/new-launch/bold.text';
import { EmojiIcon } from '@gitroom/frontend/components/ui/icons';

export function editorHtmlToPlain(html: string): string {
  return stripHtmlValidation('normal', html || '', true);
}

export function plainToEditorHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<p>${escaped.replace(/\n/g, '<br>')}</p>`;
}

/**
 * First Comment is a labeled field under the post, with the same tools the
 * comment already had (media, signature, delay) plus emoji and unicode bold.
 * Tools stay visible so delay is a named chip, not a lone clock.
 */
export const ComposeFirstComment: FC<{
  value: string;
  onChange: (value: string) => void;
  pictures?: { id: string; path: string; thumbnail?: string }[];
  setImages: (value: any[]) => void;
  delay: number;
  comments: boolean | 'no-media';
  dummy: boolean;
  allValues: { content: string; id?: string }[];
  onActivate: () => void;
}> = ({
  value,
  onChange,
  pictures,
  setImages,
  delay,
  comments,
  dummy,
  allValues,
  onActivate,
}) => {
  const t = useT();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const signatureEditor = useMemo(
    () => ({
      commands: {
        insertContent: (html: string) => {
          const extra = editorHtmlToPlain(String(html));
          if (!extra) {
            return;
          }
          onChange(value ? `${value}\n\n${extra}` : extra);
        },
        focus: () => inputRef.current?.focus(),
      },
    }),
    [onChange, value]
  );

  const replaceSelection = useCallback(
    (next: string, from: number, to: number) => {
      onChange(next);
      requestAnimationFrame(() => {
        const node = inputRef.current;
        if (!node) {
          return;
        }
        node.focus();
        node.setSelectionRange(from, to);
      });
    },
    [onChange]
  );

  const insertAtCursor = useCallback(
    (chunk: string) => {
      const node = inputRef.current;
      const from = node?.selectionStart ?? value.length;
      const to = node?.selectionEnd ?? value.length;
      const next = value.slice(0, from) + chunk + value.slice(to);
      const caret = from + chunk.length;
      replaceSelection(next, caret, caret);
    },
    [replaceSelection, value]
  );

  const applyBold = useCallback(() => {
    const node = inputRef.current;
    const from = node?.selectionStart ?? 0;
    const to = node?.selectionEnd ?? 0;
    const result = applyUnicodeBold(value, from, to);
    replaceSelection(result.text, result.from, result.to);
    onActivate();
  }, [onActivate, replaceSelection, value]);

  return (
    <div
      data-pq="composer-first-comment"
      className="flex min-w-0 flex-col gap-[8px] border-t border-pqLine px-[12px] py-[12px]"
      onFocusCapture={() => {
        onActivate();
      }}
    >
      <div className="text-[11px] font-[700] uppercase tracking-[0.06em] text-pqSoft">
        {t('first_comment', 'First Comment')}
      </div>
      <textarea
        ref={inputRef}
        rows={2}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t('your_comment', 'Your comment')}
        aria-label={t('first_comment', 'First Comment')}
        className="min-h-[64px] w-full resize-y rounded-[10px] border-0 bg-pqInner px-[12px] py-[10px] text-[13.5px] leading-[1.45] text-pqText outline-none shadow-[inset_0_0_0_1px_var(--border)] placeholder:text-pqSoft focus:shadow-[inset_0_0_0_1px_var(--brand)]"
      />
      <div
        data-pq="composer-first-comment-tools"
        className="relative flex min-w-0 flex-col"
        onMouseDown={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest('input, textarea, select, button, [role="button"]')) {
            return;
          }
          event.preventDefault();
        }}
      >
        <MultiMediaComponent
          attachmentsOnly
          mediaNotAvailable={comments === 'no-media'}
          allData={allValues}
          text={value}
          label={t('attachments', 'Attachments')}
          description=""
          value={pictures}
          dummy={dummy}
          name="first-comment-image"
          toolBar={
            <div className="flex flex-wrap items-center gap-[6px]">
              <SignatureBox
                editor={signatureEditor}
                label={t('add_signature', 'Add Signature')}
              />
              <button
                type="button"
                onClick={applyBold}
                data-tooltip-id="tooltip"
                data-tooltip-content="Bold Text"
                aria-label="Bold Text"
                className="flex h-[36px] cursor-pointer select-none items-center gap-[8px] rounded-[8px] bg-pqBtnSimple px-[12px] text-[12px] font-[600] text-pqText transition-colors hover:bg-pqHover"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M4 8.00033H9.33333C10.8061 8.00033 12 6.80642 12 5.33366C12 3.8609 10.8061 2.66699 9.33333 2.66699H4V8.00033ZM4 8.00033H10C11.4728 8.00033 12.6667 9.19423 12.6667 10.667C12.6667 12.1398 11.4728 13.3337 10 13.3337H4V8.00033Z"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>Bold</span>
              </button>
              <button
                type="button"
                onClick={() => setEmojiOpen((open) => !open)}
                data-tooltip-id="tooltip"
                data-tooltip-content={t('insert_emoji', 'Insert Emoji')}
                aria-label={t('insert_emoji', 'Insert Emoji')}
                aria-expanded={emojiOpen}
                className="flex h-[36px] cursor-pointer select-none items-center gap-[8px] rounded-[8px] bg-pqBtnSimple px-[12px] text-[12px] font-[600] text-pqText transition-colors hover:bg-pqHover"
              >
                <EmojiIcon />
                <span>{t('insert_emoji', 'Insert Emoji')}</span>
              </button>
              <DelayComponent
                toolbar
                currentIndex={1}
                currentDelay={delay}
              />
            </div>
          }
          onChange={(event) => {
            setImages(event.target.value || []);
          }}
          onOpen={() => {}}
          onClose={() => {}}
        />
        {emojiOpen && (
          <div className="absolute bottom-[44px] start-0 z-[500]">
            <EmojiPicker
              height={360}
              theme={
                (typeof window !== 'undefined'
                  ? (localStorage.getItem('mode') as Theme)
                  : null) || Theme.DARK
              }
              onEmojiClick={(event) => {
                insertAtCursor(event.emoji);
                setEmojiOpen(false);
                onActivate();
              }}
              open={emojiOpen}
            />
          </div>
        )}
      </div>
    </div>
  );
};
