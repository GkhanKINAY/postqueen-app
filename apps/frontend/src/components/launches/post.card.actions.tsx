'use client';

import { FC, ReactNode, useState } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useViewport } from '@gitroom/frontend/components/layout/use.viewport';
import { MobileSheet } from '@gitroom/frontend/components/layout/mobile-sheet';
import { MovePostControl } from '@gitroom/frontend/components/layout/move-post-sheet';

export type PostActionApi = {
  close: () => void;
  openMove: () => void;
};

export const postActionRowClass =
  'flex min-h-[48px] w-full items-center rounded-[10px] px-[12px] text-start text-[15px] font-[600] hover:bg-pqHover';

/**
 * Hover icon bar when the pointer can hover. Otherwise one 44px button
 * that opens the same actions in a sheet, so they don't cover the post.
 */
export const PostCardActions: FC<{
  clusterClassName: string;
  triggerClassName: string;
  /** Week cells are too narrow for a 44px control. */
  triggerButtonClassName?: string;
  movePost?: {
    id: string;
    publishDate: string | Date;
    state?: string;
  } | null;
  sheet: (api: PostActionApi) => ReactNode;
  children: ReactNode;
}> = ({
  clusterClassName,
  triggerClassName,
  triggerButtonClassName,
  movePost,
  sheet,
  children,
}) => {
  const t = useT();
  const { canHover, touch } = useViewport();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  // Phone and tablet widths, and any pointer that cannot hover (a wide iPad).
  // A mouse on a narrow window still has hover, and the old always-on bar
  // covered the post there too.
  const hoverIcons = canHover && !touch;

  if (hoverIcons) {
    return (
      <div
        data-ci-actions="1"
        onClick={(e) => e.stopPropagation()}
        className={clusterClassName}
      >
        {children}
      </div>
    );
  }

  const trigger = (openMove: () => void) => (
    <>
      <button
        type="button"
        data-pq="post-actions"
        aria-label={t('more_options', 'More options')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={clsx(
          'grid place-items-center bg-pqSettings text-pqMuted shadow-[inset_0_0_0_1px_var(--border)]',
          triggerButtonClassName || 'size-[44px] rounded-[10px]',
        )}
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="6" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="18" cy="12" r="1.7" />
        </svg>
      </button>
      <MobileSheet
        open={open}
        onClose={close}
        title={t('more_options', 'More options')}
      >
        <div className="flex flex-col gap-[2px]">
          {sheet({ close, openMove })}
        </div>
      </MobileSheet>
    </>
  );

  return (
    <div onClick={(e) => e.stopPropagation()} className={triggerClassName}>
      {movePost ? (
        <MovePostControl post={movePost}>{trigger}</MovePostControl>
      ) : (
        trigger(() => {})
      )}
    </div>
  );
};

export const PostActionRow: FC<{
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}> = ({ onClick, danger, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={clsx(
      postActionRowClass,
      danger ? 'text-pqWarn' : 'text-pqText'
    )}
  >
    {children}
  </button>
);
