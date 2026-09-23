import { NO_INDEX } from '@/lib/site';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { listVenues } from '@/lib/services';
import { GigForm } from '@/components/forms';

export const metadata = { title: 'List a gig', robots: NO_INDEX };
export const dynamic = 'force-dynamic';

export default async function NewGigPage() {
  const user = await currentUser();
  if (!user) redirect('/login?next=/gigs/new');
  if (!user.band) redirect('/dashboard');
  const venues = await listVenues();
  return (
    <div className="wrap narrow page">
      <p className="eyebrow"><Link href="/dashboard">← Dashboard</Link></p>
      <h1 className="page-title">List a gig</h1>
      <div className="card">
        <GigForm venues={JSON.parse(JSON.stringify(venues))} />
      </div>
    </div>
  );
}
