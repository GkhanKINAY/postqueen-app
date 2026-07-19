'use client';

import React from 'react';
import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';
import { LogoutComponent } from '@gitroom/frontend/components/layout/logout.component';
import { OrganizationSelector } from '@gitroom/frontend/components/layout/organization.selector';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

/**
 * Shown instead of the plan picker when the organization needs a subscription
 * but the current member is not allowed to buy one.
 *
 * Billing routes require an ADMIN/SUPERADMIN role. Without this screen a
 * regular member of an organization whose subscription lapsed would be dropped
 * onto the checkout, and every action there would fail with a bare 402 and no
 * explanation of who can fix it.
 */
export const BillingAdminRequiredComponent = () => {
  const t = useT();

  return (
    <div className="flex flex-1 flex-col bg-newBgColorInner">
      <div className="h-[92px] px-[80px] tablet:px-[32px] mobile:!px-[16px] py-[20px] flex border-b border-newColColor">
        <div className="flex-1 flex items-center text-textColor">
          <LogoTextComponent />
        </div>
        <div className="flex items-center gap-[20px] text-textItemBlur">
          <OrganizationSelector />
          <LogoutComponent isIcon={true} />
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center px-[80px] tablet:px-[32px] mobile:!px-[16px]">
        <div className="max-w-[520px] text-center">
          <div className="text-[24px] font-[700] mb-[16px]">
            {t('billing_admin_required_title', 'A subscription is needed')}
          </div>
          <div className="text-[16px] text-textItemBlur">
            {t(
              'billing_admin_required_description',
              'This workspace does not have an active plan. Only an admin of the workspace can choose or renew one — please ask them to take a look.'
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
