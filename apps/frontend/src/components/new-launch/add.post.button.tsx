'use client';

import React, { FC } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { PostComment } from '@gitroom/frontend/components/new-launch/providers/high.order.provider';

/**
 * Adds another item to the compose thread.
 * - POST: next item is published as a reply chaining the thread (X / Threads / Bluesky).
 * - COMMENT: next item is published as a comment under the root post.
 * - ALL: global / mixed mode — continuation style depends on channel.
 *
 * WORK: one action appends one thread segment — not both a comment and a post.
 * ALL-mode label: "Add comment / post" (owner).
 */
export const AddPostButton: FC<{
  onClick: () => void;
  num: number;
  postComment: PostComment;
  wide?: boolean;
}> = (props) => {
  const { onClick, wide } = props;
  const t = useT();

  const label =
    props.postComment === PostComment.ALL
      ? t('add_comment_or_post', 'Add comment / post')
      : props.postComment === PostComment.POST
      ? t('add_post', 'Continue thread')
      : t('add_comment', 'Add comment');

  const asComment =
    props.postComment === PostComment.COMMENT ||
    props.postComment === PostComment.ALL;

  return (
    <button
      type="button"
      onClick={onClick}
      data-pq="composer-add-comment"
      className={clsx(
        'inline-flex h-[40px] cursor-pointer select-none items-center justify-center gap-[6px] rounded-[10px] px-[14px] text-[13px] font-[600] transition-opacity',
        wide && 'w-full',
        asComment
          ? 'bg-pqPink text-pqOnBrand hover:opacity-90'
          : 'bg-pqInner text-pqText shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_20%,transparent)] hover:bg-pqHover hover:opacity-100'
      )}
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
      {label}
    </button>
  );
};
