import { Metadata } from 'next';
import { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { LayoutComponent } from '@gitroom/frontend/components/new-layout/layout.component';
import { ToolTip } from '@gitroom/frontend/components/layout/top.tip';

export const metadata: Metadata = {
  title: 'Connect channel',
};

export default async function IntegrationLayout({
  children,
}: {
  children: ReactNode;
}) {
  const auth = (await cookies()).get('auth');
  if (auth?.value) {
    return <LayoutComponent>{children}</LayoutComponent>;
  }

  // Signed out (a connect link), so without the app chrome: the page picker's
  // hints need a tooltip of their own.
  return (
    <div className="flex min-h-screen w-screen flex-1 bg-pqBg text-pqText">
      <ToolTip />
      {children}
    </div>
  );
}
