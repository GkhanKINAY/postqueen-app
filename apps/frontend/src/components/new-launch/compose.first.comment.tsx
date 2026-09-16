'use client';

import { FC, useMemo, useRef, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { SignatureBox } from '@gitroom/frontend/components/signature';
import { DelayComponent } from '@gitroom/frontend/components/new-launch/delay.component';
import { MultiMediaComponent } from '@gitroom/frontend/components/media/media.component';

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
 * First Comment stays a single field under the compose tools. Photo, signature
 * and delay are the same controls comments already had — they sit collapsed
 * until the field is focused, or until it already has text / media / delay.
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);
  const hasPayload = Boolean(
    value.trim() || pictures?.length || delay
  );
  const expanded = active || hasPayload;

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

  return (
    <div
      data-pq="composer-first-comment"
      className="flex min-w-0 flex-col border-t border-pqLine"
      onFocusCapture={() => {
        onActivate();
        setActive(true);
      }}
      onBlurCapture={(event) => {
        if (
          event.currentTarget.contains(
            event.relatedTarget as Node | null
          )
        ) {
          return;
        }
        setActive(false);
        if (!value.trim() && !pictures?.length && !delay) {
          onChange('');
        }
      }}
    >
      <div className="flex min-w-0 items-center gap-[10px] px-[12px] py-[10px]">
        <div
          className="shrink-0 cursor-text text-[13px] font-[600] text-pqMuted"
          onMouseDown={(event) => {
            event.preventDefault();
            onActivate();
            setActive(true);
            inputRef.current?.focus();
          }}
        >
          {t('first_comment', 'First Comment')}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t('your_comment', 'Your comment')}
          aria-label={t('first_comment', 'First Comment')}
          aria-expanded={expanded}
          className="h-[40px] min-w-0 flex-1 rounded-[8px] border-0 bg-pqInner px-[12px] text-[13.5px] text-pqText outline-none shadow-[inset_0_0_0_1px_var(--border)] placeholder:text-pqSoft focus:shadow-[inset_0_0_0_1px_var(--brand)]"
        />
      </div>
      {expanded && (
        <div
          data-pq="composer-first-comment-tools"
          onMouseDown={(event) => {
            // Keep the field focused so the tools stay up while picking delay /
            // media / signature. Don't steal focus from the delay custom input.
            const target = event.target as HTMLElement;
            if (target.closest('input, textarea, select')) {
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
                <SignatureBox editor={signatureEditor} />
                <div className="flex h-[36px] items-center">
                  <DelayComponent currentIndex={1} currentDelay={delay} />
                </div>
              </div>
            }
            onChange={(event) => {
              setImages(event.target.value || []);
            }}
            onOpen={() => {}}
            onClose={() => {}}
          />
        </div>
      )}
    </div>
  );
};
