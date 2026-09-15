'use client';

import { FC } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { DelayComponent } from '@gitroom/frontend/components/new-launch/delay.component';

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
 * Buffer's First Comment is a single field under the compose tools, then the
 * same text on the network preview as the author's first comment.
 *
 * PostQueen already publishes that as the second thread item (a comment on
 * LinkedIn / Instagram / Facebook, a reply on X). Delay is ours — Buffer
 * posts the comment immediately after the root. Empty field = no extra item.
 */
export const ComposeFirstComment: FC<{
  value: string;
  delay: number;
  showDelay: boolean;
  onChange: (value: string) => void;
}> = ({ value, delay, showDelay, onChange }) => {
  const t = useT();

  return (
    <div
      data-pq="composer-first-comment"
      className="flex min-w-0 items-center gap-[10px] border-t border-pqLine px-[12px] py-[10px]"
    >
      <div className="shrink-0 text-[13px] font-[600] text-pqMuted">
        {t('first_comment', 'First Comment')}
      </div>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t('your_comment', 'Your comment')}
        aria-label={t('first_comment', 'First Comment')}
        className="h-[40px] min-w-0 flex-1 rounded-[8px] border-0 bg-pqBg px-[12px] text-[13.5px] text-pqText outline-none shadow-[inset_0_0_0_1px_var(--border)] placeholder:text-pqSoft focus:shadow-[inset_0_0_0_1px_var(--brand)]"
      />
      {showDelay && (
        <div className="shrink-0">
          <DelayComponent currentIndex={1} currentDelay={delay} />
        </div>
      )}
    </div>
  );
};
