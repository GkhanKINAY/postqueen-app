'use client';

import { FC } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { CreditsIcon } from '@gitroom/frontend/components/billing/credits.amount';

// A plug's prices are fractions of a credit; one decimal would round a
// look at the post (0.13) down.
const price = (credits: number) => String(Math.round(credits * 100) / 100);

/**
 * What a plug takes from the credits balance, on a network that bills each
 * call: its daily look at the post, and acting on it. Nothing with billing
 * off, or for a plug that costs nothing.
 */
export const PlugCredits: FC<{
  credits?: { check: number; trigger: number; withLink?: number };
}> = ({ credits }) => {
  const t = useT();
  const { billingEnabled } = useVariables();
  if (!billingEnabled || !credits) {
    return null;
  }

  return (
    <div
      data-pq="plug-credits"
      className="flex items-start gap-[6px] text-[12.5px] leading-[1.5] text-pqMuted"
    >
      <span className="mt-[2px]">
        <CreditsIcon />
      </span>
      <span>
        {credits.check && credits.withLink
          ? t(
              'plug_credits_check_and_act_link',
              'Uses credits: {{check}} a day while it watches the post, and {{trigger}} when it acts on it ({{withLink}} if what it posts has a link). It stops if the balance runs out.',
              {
                check: price(credits.check),
                trigger: price(credits.trigger),
                withLink: price(credits.withLink),
              }
            )
          : credits.check
          ? t(
              'plug_credits_check_and_act',
              'Uses credits: {{check}} a day while it watches the post, and {{trigger}} when it acts on it. It stops if the balance runs out.',
              {
                check: price(credits.check),
                trigger: price(credits.trigger),
              }
            )
          : t(
              'plug_credits_act',
              'Uses {{trigger}} credits each time it acts on the post. It is skipped if the balance runs out.',
              { trigger: price(credits.trigger) }
            )}
      </span>
    </div>
  );
};
