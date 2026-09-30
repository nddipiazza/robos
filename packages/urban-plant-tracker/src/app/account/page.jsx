import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { DeleteAccountForm, LogoutButton } from '@/components/forms';
import { NO_INDEX } from '@/lib/site';

export const metadata = { title: 'Account', robots: NO_INDEX };
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect('/login?next=/account');
  return (
    <div className="wrap narrow page">
      <h1 className="page-title">Account</h1>
      <div className="card stack">
        <p>Signed in as <strong data-testid="account-email">{user.email}</strong></p>
        <LogoutButton className="btn btn-secondary" />
      </div>
      <section className="block">
        <h2 className="block-title">Danger zone</h2>
        <div className="card card-danger"><DeleteAccountForm email={user.email} /></div>
      </section>
    </div>
  );
}
