'use client';

import { FC, useCallback } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';

/**
 * What a self-hosted instance shows in place of a feature it has no key for:
 * the design editor without NEXT_PUBLIC_POLOTNO, image generation without
 * OPENAI_API_KEY. The hosted service hides those buttons instead. A
 * self-hoster can switch them on, so the button stays and says how.
 */
const FeatureSetupHint: FC<{
  feature: string;
  env: string;
  docs: string;
  isAdmin: boolean;
}> = ({ feature, env, docs, isAdmin }) => {
  const t = useT();
  return (
    <div className="flex flex-col gap-[12px] text-[14px] leading-[1.6] text-pqText">
      {isAdmin ? (
        <>
          <p>
            {t(
              'feature_setup_admin',
              '{{feature}} is not set up on this installation. Add {{env}} to the server environment and restart PostQueen.',
              { feature, env }
            )}
          </p>
          <a
            href={docs}
            target="_blank"
            rel="noreferrer"
            className="font-[600] text-pqBrand hover:underline"
          >
            {t('feature_setup_docs', 'How to set it up')}
          </a>
        </>
      ) : (
        <p>
          {t(
            'feature_setup_member',
            '{{feature}} is not set up on this installation yet. Ask a workspace admin to turn it on.',
            { feature }
          )}
        </p>
      )}
    </div>
  );
};

/** Opens the hint. Who is asking is read here, where the user context is. */
export const useFeatureSetupHint = () => {
  const modals = useModals();
  const user = useUser();
  const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(user?.role!);
  return useCallback(
    (feature: string, env: string, docs: string) => {
      modals.openModal({
        title: feature,
        children: (
          <FeatureSetupHint
            feature={feature}
            env={env}
            docs={docs}
            isAdmin={isAdmin}
          />
        ),
      });
    },
    [modals, isAdmin]
  );
};
