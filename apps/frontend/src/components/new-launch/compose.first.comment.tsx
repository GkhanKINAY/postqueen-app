'use client';

import { FC, useCallback, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import EmojiPicker from 'emoji-picker-react';
import { Theme } from 'emoji-picker-react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { SignatureBox } from '@gitroom/frontend/components/signature';
import { DelayComponent } from '@gitroom/frontend/components/new-launch/delay.component';
import { MultiMediaComponent } from '@gitroom/frontend/components/media/media.component';
import { applyUnicodeBold } from '@gitroom/frontend/components/new-launch/bold.text';
import { applyUnicodeUnderline } from '@gitroom/frontend/components/new-launch/u.text';
import { InformationComponent } from '@gitroom/frontend/components/launches/information.component';
import { EmojiIcon, TrashIcon } from '@gitroom/frontend/components/ui/icons';

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

const toolChip =
  'flex h-[36px] w-[36px] cursor-pointer select-none items-center justify-center rounded-[8px] bg-pqBtnSimple text-pqText transition-colors hover:bg-pqHover';

export const AddCommentTrigger: FC<{
  onClick: () => void;
}> = ({ onClick }) => {
  const t = useT();
  return (
    <div data-pq="composer-first-comment-trigger">
      <button
        type="button"
        onClick={onClick}
        data-pq="composer-add-comment-trigger"
        className="inline-flex h-[40px] w-full cursor-pointer select-none items-center justify-center gap-[6px] rounded-[10px] bg-pqPink px-[14px] text-[13px] font-[600] text-pqOnBrand transition-opacity hover:opacity-90"
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
            d="M8.00065 3.33301V12.6663M3.33398 7.99967H12.6673"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {t('add_comment', 'Add comment')}
      </button>
    </div>
  );
};

/**
 * First Comment is a labeled field under the post. Text tools match the post
 * toolbar (icon chips after Insert Media). Delay sits with the character
 * counter — it is a schedule control, not a text style.
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
  commentIndex?: number;
  chars: Record<string, number>;
  totalAllowedChars: number;
  onRemove?: () => void;
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
  commentIndex = 1,
  chars,
  totalAllowedChars,
  onRemove,
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

  const applyUnderline = useCallback(() => {
    const node = inputRef.current;
    const from = node?.selectionStart ?? 0;
    const to = node?.selectionEnd ?? 0;
    const result = applyUnicodeUnderline(value, from, to);
    replaceSelection(result.text, result.from, result.to);
    onActivate();
  }, [onActivate, replaceSelection, value]);

  return (
    <div
      data-pq="composer-first-comment"
      className={clsx(
        'flex min-w-0 flex-col gap-[8px] px-[12px] py-[12px]',
        commentIndex > 1 && 'border-t border-pqLine'
      )}
      onFocusCapture={() => {
        onActivate();
      }}
    >
      <div className="flex items-center justify-between gap-[8px]">
        <div className="text-[11px] font-[700] uppercase tracking-[0.06em] text-pqMuted">
          {commentIndex === 1
            ? t('first_comment', 'First Comment')
            : t('comments', 'Comments')}
        </div>
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            data-tooltip-id="tooltip"
            data-pq="composer-first-comment-remove"
            data-tooltip-content={t('remove', 'Remove')}
            aria-label={t('remove', 'Remove')}
            className="grid size-[28px] cursor-pointer place-items-center rounded-[6px] text-pqWarn transition-colors hover:bg-pqHover"
          >
            <TrashIcon size={16} />
          </button>
        ) : null}
      </div>
      <textarea
        ref={inputRef}
        rows={2}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t('your_comment', 'Your comment')}
        aria-label={
          commentIndex === 1
            ? t('first_comment', 'First Comment')
            : t('add_comment', 'Add comment')
        }
        className="min-h-[64px] w-full resize-none rounded-[10px] border-0 bg-pqInner px-[12px] py-[10px] text-[13.5px] leading-[1.45] text-pqText outline-none shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_20%,transparent)] placeholder:text-pqMuted focus:shadow-[inset_0_0_0_1px_var(--brand)]"
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
          largeThumbs
          mediaNotAvailable={comments === 'no-media'}
          allData={allValues}
          text={value}
          label={t('attachments', 'Attachments')}
          description=""
          value={pictures}
          dummy={dummy}
          name={`first-comment-image-${commentIndex}`}
          toolBar={
            <div className="flex flex-wrap items-center gap-[6px]">
              <SignatureBox editor={signatureEditor} />
              <button
                type="button"
                onClick={applyUnderline}
                data-tooltip-id="tooltip"
                data-tooltip-content="Underline"
                aria-label="Underline"
                className={toolChip}
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
                    d="M11.9993 2.66699V7.33366C11.9993 9.5428 10.2085 11.3337 7.99935 11.3337C5.79021 11.3337 3.99935 9.5428 3.99935 7.33366V2.66699M2.66602 14.0003H13.3327"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={applyBold}
                data-tooltip-id="tooltip"
                data-tooltip-content="Bold Text"
                aria-label="Bold Text"
                className={toolChip}
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
              </button>
              <button
                type="button"
                onClick={() => setEmojiOpen((open) => !open)}
                data-tooltip-id="tooltip"
                data-tooltip-content={t('insert_emoji', 'Insert Emoji')}
                aria-label={t('insert_emoji', 'Insert Emoji')}
                aria-expanded={emojiOpen}
                className={toolChip}
              >
                <EmojiIcon />
              </button>
            </div>
          }
          information={
            <div
              data-pq="composer-first-comment-meta"
              className="flex items-center gap-[8px] border-s border-pqLine ps-[8px]"
              onMouseDown={() => {
                onActivate();
              }}
            >
              <DelayComponent
                toolbar
                currentIndex={commentIndex}
                currentDelay={delay}
              />
              <InformationComponent
                variant="comment"
                isPicture={!!pictures?.length}
                chars={chars}
                totalChars={value.length}
                totalAllowedChars={totalAllowedChars}
                text={value}
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
