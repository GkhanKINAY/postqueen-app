import React, { FC, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ModalWrapperComponent } from '@gitroom/frontend/components/new-launch/modal.wrapper.component';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { Button } from '@gitroom/react/form/button';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { markFinishTrialConfirmed } from '@gitroom/frontend/components/billing/finish.trial';

export const PreConditionComponentModal: FC = () => {
  const modal = useModals();
  const t = useT();
  return (
    <div className="flex flex-col gap-[16px]">
      <div className="whitespace-pre-line">
        {t(
          'precondition_channel_used_trial',
          "This social channel was previously connected to another PostQueen account.\nTo connect it during your trial, you can end the trial now: your plan's first payment is charged today instead of at the end of the trial, and nothing extra is added."
        )}
      </div>
      <div className="flex gap-[2px] justify-center">
        <Button
          onClick={() => {
            markFinishTrialConfirmed();
            window.location.href = '/billing?finishTrial=true';
          }}
        >
          {t('finish_trial_charge_me_now', 'End trial and pay now')}
        </Button>
        <Button onClick={modal.closeCurrent} secondary={true}>
          {t('cancel', 'Cancel')}
        </Button>
      </div>
    </div>
  );
};
export const PreConditionComponent: FC = () => {
  const modal = useModals();
  const query = useSearchParams();
  const { billingEnabled } = useVariables();
  useEffect(() => {
    // It asks for a trial charge; with billing off there is none to make.
    if (billingEnabled && query.get('precondition')) {
      modal.openModal({
        title: 'Suspicious activity detected',
        withCloseButton: true,
        classNames: {
          modal: 'text-textColor',
        },
        children: <PreConditionComponentModal />,
      });
    }
  }, []);
  return null;
};
