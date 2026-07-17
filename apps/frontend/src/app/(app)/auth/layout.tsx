import { getT } from '@gitroom/react/translation/get.translation.service.backend';

export const dynamic = 'force-dynamic';
import { ReactNode } from 'react';
import loadDynamic from 'next/dynamic';
import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';
import { ProductShowcase } from '@gitroom/frontend/components/auth/product-showcase';
const ReturnUrlComponent = loadDynamic(() => import('./return.url.component'));

export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getT();

  return (
    <div className="bg-newBgColor text-newTextColor flex flex-1 p-[12px] gap-[12px] min-h-screen w-screen">
      <ReturnUrlComponent />
      <div className="flex flex-col py-[40px] px-[20px] flex-1 lg:w-[600px] lg:flex-none rounded-[12px] bg-newBgColorInner p-[12px]">
        <div className="w-full max-w-[440px] mx-auto justify-center gap-[20px] h-full flex flex-col">
          <LogoTextComponent />
          <div className="flex">{children}</div>
        </div>
      </div>
      <div className="flex-1 pt-[64px] px-[40px] hidden lg:flex flex-col items-center gap-[48px]">
        <div className="text-center text-[36px] font-[600] leading-tight">
          {t('auth_headline_a', 'Schedule')}{' '}
          <span className="text-ai">{t('auth_headline_b', 'everywhere')}</span>
          <br />
          {t('auth_headline_c', 'PostQueen grows your social presence')}
        </div>
        <ProductShowcase />
      </div>
    </div>
  );
}
