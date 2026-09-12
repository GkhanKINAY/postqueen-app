import { Metadata } from 'next';
import { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { LayoutComponent } from '@gitroom/frontend/components/new-layout/layout.component';

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

  return (
    <div className="flex min-h-screen w-screen flex-1 bg-pqBg text-pqText">
      {children}
    </div>
  );
}
