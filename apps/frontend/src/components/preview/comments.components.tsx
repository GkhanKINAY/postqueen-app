'use client';

import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { Textarea } from '@gitroom/react/form/textarea';
import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { FormProvider, useForm } from 'react-hook-form';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { TurnstileWidget } from '@gitroom/frontend/components/auth/turnstile.widget';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import clsx from 'clsx';
import dayjs from 'dayjs';
import {
  PreviewComment,
  usePreviewComments,
} from '@gitroom/frontend/components/preview/preview.comments.context';

const REVIEWER_NAME_KEY = 'preview-reviewer-name';

// The name is only a convenience for the next comment: a private window or
// blocked storage throws here, and the reviewer then types it again.
const readReviewerName = () => {
  try {
    return localStorage.getItem(REVIEWER_NAME_KEY) || '';
  } catch {
    return '';
  }
};

const saveReviewerName = (name: string) => {
  try {
    localStorage.setItem(REVIEWER_NAME_KEY, name);
  } catch {
    /* not remembered */
  }
};

interface GuestIdentity {
  name: string;
  captchaToken: string;
}

// Asked on every comment left without an account: the name (remembered for
// next time) and, where TURNSTILE_SITE_KEY is set, the same Turnstile check the
// passwordless login uses. Its tokens are single-use, so one per comment.
const ReviewerNameForm: FC<{ onConfirm: (guest: GuestIdentity) => void }> = ({
  onConfirm,
}) => {
  const t = useT();
  const { turnstileSiteKey } = useVariables();
  const [captchaToken, setCaptchaToken] = useState('');
  const form = useForm({
    values: { name: readReviewerName() },
    mode: 'onChange',
  });
  const submit = useCallback(
    (values: { name: string }) => {
      const name = values.name.trim();
      if (!name) {
        return;
      }
      saveReviewerName(name);
      onConfirm({ name, captchaToken });
    },
    [onConfirm, captchaToken]
  );

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(submit)}>
        <div className="flex flex-col gap-[10px]">
          <div className="text-[14px] leading-[1.45] text-pqMuted">
            {t(
              'preview_comment_name_required',
              'We can only post your comment if you provide your name.'
            )}
          </div>
          <Input
            label={t('preview_comment_your_name', 'Your name')}
            placeholder={t('preview_comment_your_name', 'Your name')}
            name="name"
            maxLength={80}
            autoFocus={true}
          />
          {!!turnstileSiteKey && (
            <TurnstileWidget
              siteKey={turnstileSiteKey}
              onToken={setCaptchaToken}
            />
          )}
          <Button
            type="submit"
            disabled={!!turnstileSiteKey && !captchaToken}
          >
            {t('continue', 'Continue')}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
};

const CommentComposer: FC<{
  parentId?: string;
  onDone?: () => void;
}> = ({ parentId, onDone }) => {
  const t = useT();
  const user = useUser();
  const fetch = useFetch();
  const toast = useToaster();
  const modals = useModals();
  const { previewId, pending, setPending, mutate } = usePreviewComments();
  const [loading, setLoading] = useState(false);
  const form = useForm({ values: { content: '' } });
  const anchor = parentId ? null : pending;

  // Choosing "Comment" on selected text goes straight to typing. Below the
  // posts on a narrow screen, focusing also brings the box into view.
  useEffect(() => {
    if (anchor) {
      form.setFocus('content');
    }
  }, [anchor, form]);

  const askForName = useCallback(
    () =>
      new Promise<GuestIdentity | null>((resolve) => {
        modals.openModal({
          title: t('preview_comment_your_name', 'Your name'),
          withCloseButton: true,
          compact: 420,
          onClose: () => resolve(null),
          children: (close) => (
            <ReviewerNameForm
              onConfirm={(guest) => {
                resolve(guest);
                close();
              }}
            />
          ),
        });
      }),
    [modals, t]
  );

  const submit = useCallback(
    async (values: { content: string }) => {
      const content = values.content.trim();
      if (!content) {
        return;
      }

      let guest: GuestIdentity | null = null;
      if (!user?.id) {
        guest = await askForName();
        if (!guest) {
          return;
        }
      }

      setLoading(true);
      try {
        const init = {
          method: 'POST',
          body: JSON.stringify({
            content,
            ...(parentId ? { parentId } : {}),
            ...(anchor
              ? {
                  postId: anchor.postId,
                  anchorStart: anchor.start,
                  anchorEnd: anchor.end,
                  anchorQuote: anchor.quote,
                }
              : {}),
            ...(guest ? { displayName: guest.name } : {}),
            ...(guest?.captchaToken
              ? { captchaToken: guest.captchaToken }
              : {}),
          }),
        };
        const response = user?.id
          ? await fetch(`/posts/${previewId}/comments`, init)
          : await fetch(`/public/posts/${previewId}/comments`, init);

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          toast.show(
            (typeof body?.message === 'string' && body.message) ||
              t('preview_comment_failed', 'Could not post the comment'),
            'warning'
          );
          return;
        }

        form.reset({ content: '' });
        if (anchor) {
          setPending(null);
        }
        await mutate();
        onDone?.();
      } finally {
        setLoading(false);
      }
    },
    [
      user?.id,
      previewId,
      parentId,
      anchor,
      askForName,
      fetch,
      toast,
      t,
      form,
      setPending,
      mutate,
      onDone,
    ]
  );

  return (
    <FormProvider {...form}>
      <form
        className="flex flex-col gap-[8px]"
        onSubmit={form.handleSubmit(submit)}
      >
        {!!anchor && (
          <div className="flex items-start gap-[8px] border-s-[3px] border-pqBrand ps-[8px] text-[12px] text-pqMuted">
            <div className="flex-1 truncate italic">{anchor.quote}</div>
            <button
              type="button"
              className="hover:text-pqText"
              onClick={() => setPending(null)}
              aria-label={t('cancel', 'Cancel')}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width={14}
                height={14}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        )}
        <Textarea
          label={
            parentId ? t('reply', 'Reply') : t('add_a_comment', 'Add a comment')
          }
          name="content"
          className="!min-h-[90px]"
          placeholder={
            parentId
              ? t('write_a_reply', 'Write a reply...')
              : t('add_a_comment_placeholder', 'Add a comment...')
          }
          maxLength={2000}
        />
        <div className="-mt-[14px] flex items-center justify-end gap-[10px]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="cursor-help text-pqMuted"
            data-tooltip-id="tooltip"
            data-tooltip-content={t(
              'preview_comment_detach_hint',
              'Comments on selected text lose their highlight if the text is edited later.'
            )}
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
          {!!onDone && (
            <Button type="button" variant="secondary" onClick={onDone}>
              {t('cancel', 'Cancel')}
            </Button>
          )}
          <Button type="submit" loading={loading}>
            {parentId ? t('reply', 'Reply') : t('post', 'Post')}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
};

// Moderation for the team that owns the post: anyone with the link can
// comment, so the team can take a comment down. A root comment takes its
// replies with it.
const useDeleteComment = () => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const { mutate, activeThread, setActiveThread } = usePreviewComments();
  return useCallback(
    async (comment: PreviewComment) => {
      if (
        !(await deleteDialog(
          comment.parentId
            ? t('preview_comment_delete_reply_confirm', 'Delete this reply?')
            : t(
                'preview_comment_delete_confirm',
                'Delete this comment and its replies?'
              )
        ))
      ) {
        return;
      }
      const response = await fetch(`/posts/comments/${comment.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        toast.show(
          t('preview_comment_delete_failed', 'Could not delete the comment'),
          'warning'
        );
        return;
      }
      if (activeThread?.id === comment.id) {
        setActiveThread(null);
      }
      await mutate();
    },
    [t, fetch, toast, mutate, activeThread, setActiveThread]
  );
};

const CommentBody: FC<{
  comment: PreviewComment;
  onDelete?: () => void;
}> = ({ comment, onDelete }) => {
  const t = useT();
  return (
    <div className="flex flex-col gap-[4px]">
      <div className="whitespace-pre-wrap break-words text-[14px] text-pqText">
        {comment.content}
      </div>
      <div className="flex flex-wrap items-center gap-x-[6px] text-[12px] text-pqMuted">
        <span>{comment.name || t('reviewer', 'Reviewer')}</span>
        {comment.guest && (
          <span className="rounded-[4px] bg-pqBtnSimple px-[5px] text-[11px] text-pqText">
            {t('preview_comment_guest', 'Guest')}
          </span>
        )}
        <span>· {dayjs(comment.createdAt).format('MMM D, YYYY HH:mm')}</span>
        {!!onDelete && (
          <button
            type="button"
            className="ms-auto text-pqMuted hover:text-pqDanger"
            onClick={onDelete}
          >
            {t('delete', 'Delete')}
          </button>
        )}
      </div>
    </div>
  );
};

const ThreadCard: FC<{
  comment: PreviewComment;
  replies: PreviewComment[];
  canResolve: boolean;
}> = ({ comment, replies, canResolve }) => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const ref = useRef<HTMLDivElement>(null);
  const [replying, setReplying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [flash, setFlash] = useState(false);
  const {
    mutate,
    activeThread,
    setActiveThread,
    hoveredThread,
    setHoveredThread,
  } = usePreviewComments();
  const resolved = !!comment.resolvedAt;
  const anchored = comment.anchorStart !== null && comment.anchorEnd !== null;

  useEffect(() => {
    if (activeThread?.id !== comment.id || activeThread.source !== 'mark') {
      return;
    }
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 1500);
    return () => clearTimeout(timer);
  }, [activeThread, comment.id]);

  const toggleResolved = useCallback(async () => {
    const response = await fetch(`/posts/comments/${comment.id}/resolve`, {
      method: 'PUT',
      body: JSON.stringify({ resolved: !resolved }),
    });
    if (!response.ok) {
      toast.show(
        t('preview_comment_failed', 'Could not post the comment'),
        'warning'
      );
      return;
    }
    mutate();
  }, [comment.id, resolved, fetch, toast, t, mutate]);

  const deleteComment = useDeleteComment();
  const actionClass = 'text-pqMuted hover:text-pqText';

  return (
    <div
      ref={ref}
      onMouseEnter={() => !resolved && setHoveredThread(comment.id)}
      onMouseLeave={() => setHoveredThread(null)}
      className={clsx(
        'flex flex-col gap-[8px] rounded-[10px] border p-[12px] transition-colors',
        resolved && 'opacity-50',
        flash || hoveredThread === comment.id || activeThread?.id === comment.id
          ? 'border-pqBrand'
          : 'border-pqBorder'
      )}
    >
      {(resolved || (!!comment.anchorQuote && !anchored)) && (
        <div className="flex flex-wrap items-center gap-[6px]">
          {resolved && (
            <div className="rounded-[4px] bg-pqBtnSimple px-[6px] py-[2px] text-[11px] text-pqText">
              {t('resolved', 'Resolved')}
            </div>
          )}
          {!!comment.anchorQuote && !anchored && !resolved && (
            <div className="rounded-[4px] bg-pqBtnSimple px-[6px] py-[2px] text-[11px] text-pqText">
              {t('preview_comment_text_changed', 'Text changed')}
            </div>
          )}
        </div>
      )}
      {!!comment.anchorQuote && (
        <div
          className={clsx(
            'truncate border-s-[3px] border-pqBrand ps-[8px] text-[12px] italic text-pqMuted',
            anchored && !resolved && 'cursor-pointer hover:text-pqText'
          )}
          onClick={() =>
            anchored &&
            !resolved &&
            setActiveThread({ id: comment.id, source: 'card' })
          }
        >
          {comment.anchorQuote}
        </div>
      )}
      {resolved && !expanded ? (
        <div
          className="cursor-pointer truncate text-[14px] text-pqText"
          onClick={() => setExpanded(true)}
        >
          {comment.content}
        </div>
      ) : (
        <CommentBody comment={comment} />
      )}
      {(!resolved || expanded) && !!replies.length && (
        <div className="flex flex-col gap-[8px] border-s border-pqBorder ps-[12px]">
          {replies.map((reply) => (
            <CommentBody
              key={reply.id}
              comment={reply}
              onDelete={canResolve ? () => deleteComment(reply) : undefined}
            />
          ))}
        </div>
      )}
      {(!resolved || expanded) && (
        <div className="flex gap-[12px] text-[12px]">
          {!resolved && (
            <button
              type="button"
              className={actionClass}
              onClick={() => setReplying(!replying)}
            >
              {t('reply', 'Reply')}
            </button>
          )}
          {canResolve && (
            <button
              type="button"
              className={actionClass}
              onClick={toggleResolved}
            >
              {resolved ? t('reopen', 'Reopen') : t('resolve', 'Resolve')}
            </button>
          )}
          {canResolve && (
            <button
              type="button"
              className="text-pqMuted hover:text-pqDanger"
              onClick={() => deleteComment(comment)}
            >
              {t('delete', 'Delete')}
            </button>
          )}
          {resolved && (
            <button
              type="button"
              className={actionClass}
              onClick={() => setExpanded(false)}
            >
              {t('collapse', 'Collapse')}
            </button>
          )}
        </div>
      )}
      {replying && !resolved && (
        <CommentComposer
          parentId={comment.id}
          onDone={() => setReplying(false)}
        />
      )}
    </div>
  );
};

export const CommentsComponents: FC = () => {
  const t = useT();
  const { comments, canResolve, isLoading, postIds } = usePreviewComments();

  const threads = useMemo(() => {
    const replies = comments.reduce((all, current) => {
      if (current.parentId) {
        all[current.parentId] = [...(all[current.parentId] || []), current];
      }
      return all;
    }, {} as Record<string, PreviewComment[]>);

    const rank = (c: PreviewComment) => {
      if (c.resolvedAt) {
        return [2, 0, dayjs(c.createdAt).valueOf()];
      }
      if (c.anchorStart !== null && c.anchorEnd !== null) {
        return [0, postIds.indexOf(c.postId), c.anchorStart];
      }
      return [1, 0, dayjs(c.createdAt).valueOf()];
    };

    return comments
      .filter((c) => !c.parentId)
      .sort((a, b) => {
        const ra = rank(a);
        const rb = rank(b);
        return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
      })
      .map((comment) => ({ comment, replies: replies[comment.id] || [] }));
  }, [comments, postIds]);

  return (
    <div className="flex flex-col gap-[16px]">
      <h3 className="text-[15px] font-[600] text-pqText">
        {t('comments', 'Comments')}
      </h3>
      <CommentComposer />
      {!isLoading && !threads.length && (
        <p className="text-[13px] leading-[1.45] text-pqMuted">
          {t(
            'preview_no_comments_yet',
            'No comments yet. Select some text in the post to comment on it, or add a general comment.'
          )}
        </p>
      )}
      <div className="flex flex-col gap-[10px]">
        {threads.map(({ comment, replies }) => (
          <ThreadCard
            key={comment.id}
            comment={comment}
            replies={replies}
            canResolve={canResolve}
          />
        ))}
      </div>
    </div>
  );
};
