import { SITE_NAME } from '@/lib/site';

export const metadata = { title: 'Privacy', description: `What ${SITE_NAME} collects and why.`, alternates: { canonical: '/privacy' } };

export default function Privacy() {
  return (
    <div className="wrap narrow page prose">
      <h1 className="page-title">Privacy policy</h1>
      <p className="muted">Replace this placeholder with your policy before launch.</p>
      <ul>
        <li>Account: your name, email and a salted password hash (we never store your password).</li>
        <li>Security: IP address and browser type on sign-up and log-in, used for rate limiting and abuse prevention.</li>
      </ul>
      <p>We don’t sell your data or run ad trackers. Delete your account any time from the Account page.</p>
    </div>
  );
}
