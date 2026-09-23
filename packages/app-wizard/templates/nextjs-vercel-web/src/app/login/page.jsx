import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { LoginForm } from '@/components/forms';

export const metadata = { title: 'Log in', alternates: { canonical: '/login' }, robots: { index: false, follow: true } };

export default async function LoginPage({ searchParams }) {
  const sp = await searchParams;
  const next = typeof sp?.next === 'string' ? sp.next : '/dashboard';
  if (await currentUser()) redirect(next.startsWith('/') ? next : '/dashboard');
  return (
    <div className="wrap auth">
      <div className="card auth-card">
        <h1 className="page-title">Welcome back</h1>
        <LoginForm next={next} />
        <p className="small center">New here? <Link href="/signup">Create a free account</Link></p>
      </div>
    </div>
  );
}
