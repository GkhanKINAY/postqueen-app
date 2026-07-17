import { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'PostQueen',
  description: '',
};

// The app home is the AI chat (Agents); the Calendar is one click away in the
// rail. There was no root index before — the app fell through to /launches.
export default async function Page() {
  return redirect('/agents');
}
