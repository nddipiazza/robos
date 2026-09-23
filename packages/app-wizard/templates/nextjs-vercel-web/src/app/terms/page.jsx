import { SITE_NAME } from '@/lib/site';

export const metadata = { title: 'Terms', description: `Terms of use for ${SITE_NAME}.`, alternates: { canonical: '/terms' } };

export default function Terms() {
  return (
    <div className="wrap narrow page prose">
      <h1 className="page-title">Terms of use</h1>
      <p className="muted">Replace this placeholder with your terms before launch.</p>
      <h2>Your account</h2>
      <p>Provide accurate information and keep your password secure. You are responsible for activity on your account.</p>
      <h2>Acceptable use</h2>
      <p>No spam, impersonation, automated sign-ups or abuse. We may rate-limit, suspend or delete accounts that abuse {SITE_NAME}.</p>
      <h2>Liability</h2>
      <p>The service is provided “as is”.</p>
    </div>
  );
}
