import { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Calendar',
};

// The app home is the Calendar week view. Dates / “today” scroll are applied
// client-side from `display=week` + optional `now` (same as the header logo).
export default async function Page() {
  return redirect(`/launches?display=week&now=${Date.now()}`);
}
