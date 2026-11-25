import { Metadata } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Connect channel',
  robots: { index: false, follow: false },
};

// Without the app chrome even when signed in: the link adds the channel to
// the workspace it belongs to, which need not be the one open in the app.
export default async function ConnectLinkLayout({
  children,
}: {
  children: ReactNode;
}) {
  // w-full: the page can be taller than a small window, and w-screen then adds
  // a horizontal scrollbar next to the vertical one
  return (
    <div className="flex min-h-screen w-full flex-1 bg-pqBg text-pqText">
      {children}
    </div>
  );
}
