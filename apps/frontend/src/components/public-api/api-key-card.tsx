'use client';

import { FC, useCallback, useState } from 'react';
import { useSWRConfig } from 'swr';
import copy from 'copy-to-clipboard';
import { useUser } from '../layout/user.context';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useDecisionModal } from '@gitroom/frontend/components/layout/new-modal';
import clsx from 'clsx';

/**
 * Why a member cannot see the workspace key, in one place.
 *
 * The server decides this, not the UI: `/user/self` returns an empty
 * `publicApi` to anyone who is not an ADMIN, and rotate is policy-guarded. Three
 * surfaces have to say so — the popup Reveal opens, that button's tooltip, and
 * the note a connector's "How to connect" steps show where the key card would
 * be — and one string is how they stay the same sentence.
 */
export const useApiKeyAdminOnly = () => {
  const t = useT();
  return {
    title: t('api_key_admin_only_title', 'The API key is managed by admins'),
    body: t(
      'conn_api_key_admin_only',
      'One key belongs to the whole workspace, so only an admin can reveal or rotate it. Ask an admin of this workspace when a connector asks you for credentials.'
    ),
  };
};

/**
 * How long a key is, for the row that cannot show one.
 *
 * An admin's mask is drawn from the real value, so it is always the right
 * width. A member has no value at all, and eight dots read like a short,
 * flimsy secret rather than the 32 characters actually sitting on the server.
 */
const KEY_LENGTH = 32;

const CopyButton = ({
  text,
  label,
}: {
  text: string;
  label: string;
}) => {
  const toaster = useToaster();
  return (
    <button
      type="button"
      onClick={() => {
        copy(text);
        toaster.show(`${label} copied to clipboard`, 'success');
      }}
      className="flex h-[30px] cursor-pointer items-center rounded-pqSm bg-pqSettings px-[11px] text-[12.5px] font-[500] text-pqText transition-colors hover:bg-pqHover"
    >
      {label}
    </button>
  );
};

export const ApiKeyCard: FC<{
  title?: string;
  hint?: string;
  showDocs?: boolean;
  showWizard?: boolean;
  /** Settings Developers: flat --pop card, no icon tile (prototype :2828). */
  compact?: boolean;
  onRevealChange?: (revealed: boolean) => void;
  className?: string;
}> = ({
  title,
  hint,
  showDocs = true,
  showWizard = true,
  compact = false,
  onRevealChange,
  className,
}) => {
  const user = useUser();
  const { frontEndUrl } = useVariables();
  const toaster = useToaster();
  const fetch = useFetch();
  const decision = useDecisionModal();
  const { mutate } = useSWRConfig();
  const [reveal, setReveal] = useState(false);
  const t = useT();

  const adminOnly = useApiKeyAdminOnly();
  /** An empty key is the server saying "not for you", not "no key exists". */
  const canReveal = !!user?.publicApi;

  /**
   * Every action stays on screen for a member and says why when pressed.
   *
   * Hiding them would answer the question by omission, and leave somebody
   * wondering whether the key can be rotated at all rather than knowing who to
   * ask. The server refuses all three regardless of what this renders.
   */
  const explainAdminOnly = useCallback(() => {
    void decision.open({
      title: adminOnly.title,
      description: adminOnly.body,
      onlyApprove: true,
      approveLabel: t('ok', 'OK'),
    });
  }, [decision, adminOnly, t]);

  const toggleReveal = useCallback(() => {
    setReveal((prev) => {
      const next = !prev;
      onRevealChange?.(next);
      return next;
    });
  }, [onRevealChange]);

  const rotateKey = useCallback(async () => {
    const approved = await decision.open({
      title: t('rotate_api_key', 'Rotate API Key?'),
      description: t(
        'rotate_api_key_description',
        'This will generate a new API key and invalidate the current one. Any integrations using the old key will stop working.'
      ),
      approveLabel: t('rotate', 'Rotate'),
      cancelLabel: t('cancel', 'Cancel'),
    });
    if (!approved) return;
    await fetch('/user/api-key/rotate', { method: 'POST' });
    await mutate('/user/self');
    setReveal(false);
    onRevealChange?.(false);
    toaster.show(
      t('api_key_rotated', 'API Key rotated successfully'),
      'success'
    );
  }, [decision, fetch, mutate, onRevealChange, toaster, t]);

  // No early return on a missing key any more: the card is how a member is told
  // the key exists and is not theirs to see. Only a missing user bails.
  if (!user) {
    return null;
  }

  const keyHint =
    hint ||
    t(
      'api_key_one_key',
      'One key authenticates the REST API, the MCP server, the CLI and the n8n node.'
    );

  return (
    <div
      className={clsx(
        'flex flex-col gap-[12px] rounded-pqMd shadow-[inset_0_0_0_1px_var(--border)]',
        compact
          ? 'bg-pqPop p-[15px_16px]'
          : 'bg-pqInner p-[18px]',
        className
      )}
    >
      <div className="flex items-start justify-between gap-[12px]">
        <div className="flex min-w-0 items-start gap-[9px]">
          {!compact && (
            <span className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-pqSm bg-pqBrandSoft text-pqFocused">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none">
                <path
                  d="M15.5 7a4.5 4.5 0 1 0-4.3 5.8H9.5v2.4H7v2.5H3.5v-3.3l6-6A4.5 4.5 0 0 1 15.5 7Z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          )}
          <div className="min-w-0">
            <div
              className={clsx(
                'font-[600] text-pqText',
                compact ? 'text-[13.5px]' : 'text-[14px]'
              )}
            >
              {title ||
                (compact
                  ? t('api_key', 'API key')
                  : t('conn_your_api_key', 'Your API key'))}
            </div>
            <div
              className={clsx(
                'text-[12.5px] text-pqMuted',
                compact ? 'mt-[3px]' : 'mt-[1px]'
              )}
            >
              {keyHint}
            </div>
          </div>
        </div>
        {showDocs && (
          <a
            className="flex h-[30px] shrink-0 cursor-pointer items-center rounded-pqSm bg-pqSettings px-[11px] text-[12.5px] font-[500] text-pqText transition-colors hover:bg-pqHover"
            href="https://docs.postqueen.ai/public-api"
            target="_blank"
            rel="noreferrer"
          >
            {t('read_the_docs', 'Docs')}
          </a>
        )}
      </div>
      <div className="flex h-[38px] items-center gap-[8px] rounded-pqSm bg-pqBg px-[12px] font-mono text-[12.5px] shadow-[inset_0_0_0_1px_var(--border)]">
        <code className="min-w-0 flex-1 truncate">
          {reveal
            ? user.publicApi
            : canReveal
            ? `${'•'.repeat(
                Math.max(user.publicApi.length - 5, 8)
              )}${user.publicApi.slice(-5)}`
            : '•'.repeat(KEY_LENGTH)}
        </code>
      </div>
      {/* Every button is here for everyone. The tooltip says why on hover and
          the popup says it again on click, off one string, so the two cannot
          drift apart. */}
      <div
        className="flex flex-wrap gap-[6px]"
        {...(canReveal
          ? {}
          : {
              'data-tooltip-id': 'tooltip',
              'data-tooltip-content': adminOnly.body,
            })}
      >
        <button
          type="button"
          onClick={canReveal ? toggleReveal : explainAdminOnly}
          className="flex h-[30px] cursor-pointer items-center rounded-pqSm bg-pqSettings px-[11px] text-[12.5px] font-[500] text-pqText transition-colors hover:bg-pqHover"
        >
          {reveal ? t('hide', 'Hide') : t('reveal', 'Reveal')}
        </button>
        {canReveal ? (
          <CopyButton text={user.publicApi} label={t('copy', 'Copy')} />
        ) : (
          <button
            type="button"
            onClick={explainAdminOnly}
            className="flex h-[30px] cursor-pointer items-center rounded-pqSm bg-pqSettings px-[11px] text-[12.5px] font-[500] text-pqText transition-colors hover:bg-pqHover"
          >
            {t('copy', 'Copy')}
          </button>
        )}
        <button
          type="button"
          onClick={canReveal ? rotateKey : explainAdminOnly}
          className="flex h-[30px] cursor-pointer items-center rounded-pqSm bg-pqSettings px-[11px] text-[12.5px] font-[500] text-pqWarn transition-colors hover:bg-pqHover"
        >
          {t('rotate_key', 'Rotate key')}
        </button>
        {showWizard && (
          <button
            type="button"
            data-tooltip-id="tooltip"
            data-tooltip-content={t(
              'payload_wizard_description',
              'Building a POST request to /posts can be complex. Use the wizard to schedule a post with the UI, then copy the generated payload.'
            )}
            onClick={() =>
              window.open(`${frontEndUrl}/modal/dark/all`, '_blank')
            }
            className="flex h-[30px] cursor-pointer items-center rounded-pqSm bg-pqSettings px-[11px] text-[12.5px] font-[500] text-pqText transition-colors hover:bg-pqHover"
          >
            {t('open_wizard', 'Open Wizard')}
          </button>
        )}
      </div>
    </div>
  );
};
