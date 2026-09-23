import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { SignupForm } from '@/components/forms';

export const metadata = { title: 'Sign up' };

export default async function SignupPage() {
  if (await currentUser()) redirect('/dashboard');
  return (
    <div className="wrap auth">
      <div className="card auth-card">
        <h1 className="page-title">Get your band on</h1>
        <p className="muted">Free account. Set up your band profile next and get $100 in beta gig credits for deposits.</p>
        <SignupForm />
        <p className="small center">
          Already have an account? <Link href="/login">Log in</Link>
        </p>
        <p className="tiny muted center">
          By signing up you agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}
