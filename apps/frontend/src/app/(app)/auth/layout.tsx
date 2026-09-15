export const dynamic = 'force-dynamic';
import { ReactNode, Suspense } from 'react';
import loadDynamic from 'next/dynamic';
import { Metadata } from 'next';
import {
  AuthFooter,
  AuthNav,
} from '@gitroom/frontend/components/auth/auth-chrome';
import { ProductShowcase } from '@gitroom/frontend/components/auth/product-showcase';
import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';
import { authShareMetadata } from '@gitroom/frontend/components/auth/auth.open-graph';
import { MantineWrapper } from '@gitroom/react/helpers/mantine.wrapper';
import { Toaster } from '@gitroom/react/toaster/toaster';
const ReturnUrlComponent = loadDynamic(() => import('./return.url.component'));

export const metadata: Metadata = {
  ...authShareMetadata('/auth'),
};

/**
 * Split screen: form 45%, product 55% on desktop. Below `lg` the panel
 * drops out and the form takes the full width.
 */
export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <MantineWrapper>
      <Toaster />
      <div className="bg-pqInner text-pqText flex min-h-dvh w-full pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] lg:h-dvh lg:max-h-dvh lg:overflow-hidden">
        <ReturnUrlComponent />
        <div className="flex w-full flex-1 flex-col px-[24px] pb-8 pt-12 sm:px-[40px] lg:h-full lg:min-h-0 lg:w-[45%] lg:flex-none lg:overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[452px] flex-1 flex-col">
            <div className="w-full shrink-0">
              <Suspense
                fallback={
                  <header className="flex w-full items-center">
                    <LogoTextComponent />
                  </header>
                }
              >
                <AuthNav />
              </Suspense>
            </div>
            <div className="flex flex-1 flex-col justify-center py-[20px]">
              <div className="flex w-full">
                <Suspense fallback={null}>{children}</Suspense>
              </div>
            </div>
            <AuthFooter year={new Date().getFullYear()} />
          </div>
        </div>
        <ProductShowcase />
      </div>
    </MantineWrapper>
  );
}
