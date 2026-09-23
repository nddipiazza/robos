import { NO_INDEX } from '@/lib/site';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import Scanner from '@/components/Scanner';

export const metadata = { title: 'Scan check-ins', robots: NO_INDEX };
export const dynamic = 'force-dynamic';

export default async function ScanPage() {
  const user = await currentUser();
  if (!user) redirect('/login?next=/scan');
  if (!user.band) redirect('/dashboard');
  return (
    <div className="wrap narrow page">
      <p className="eyebrow"><Link href="/dashboard">← Dashboard</Link></p>
      <h1 className="page-title">Scan check-ins</h1>
      <p className="muted">
        When a Buddy Gig band arrives at <strong>your</strong> show, ask them to open their deal and show their check-in
        code. Point your camera at it. Their deposit is released the moment you scan.
      </p>
      <Scanner />
      <p className="tiny muted">Tip: your phone’s regular camera app works too — it opens the code link here.</p>
    </div>
  );
}
