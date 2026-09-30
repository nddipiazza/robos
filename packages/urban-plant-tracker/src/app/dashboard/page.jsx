import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { NO_INDEX } from '@/lib/site';

export const metadata = { title: 'Dashboard', robots: NO_INDEX };
export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const user = await currentUser();
  if (!user) redirect('/login?next=/dashboard');
  return (
    <div className="wrap page">
      <p className="eyebrow">Dashboard</p>
      <h1 className="page-title" data-testid="dashboard-title">Hey {user.displayName} 👋</h1>
      <div className="card">
        <p>This is your signed-in home. Build your app’s main workflow here.</p>
      </div>
    </div>
  );
}
