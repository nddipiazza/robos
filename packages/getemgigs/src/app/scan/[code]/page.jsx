import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { scanCode } from '@/lib/services';
import { HttpError, audit } from '@/lib/security';
import { money } from '@/lib/format';

export const metadata = { title: 'Check-in' };
export const dynamic = 'force-dynamic';

// Landing page for QR codes scanned with a phone's native camera app.
export default async function ScanCodePage({ params }) {
  const { code } = await params;
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/scan/${code}`)}`);
  let result = null;
  let error = null;
  try {
    if (!user.band) throw new HttpError(409, 'Set up your band first.');
    result = await scanCode(user, code);
    await audit('checkin_scanned', { userId: user.id, detail: result.agreementId });
  } catch (err) {
    error = err instanceof HttpError ? err.message : 'Something went wrong. Try scanning again.';
  }
  return (
    <div className="wrap narrow page center">
      {result ? (
        <div className="scan-result ok" data-testid="scan-ok">
          <div className="scan-icon">✅</div>
          <h1 className="page-title">{result.attendeeBandName} is checked in</h1>
          <p className="muted">
            {result.already ? 'They were already checked in.' : `Their ${money(result.refundedCents)} deposit is back in their wallet.`}
          </p>
        </div>
      ) : (
        <div className="scan-result bad" data-testid="scan-error">
          <div className="scan-icon">⚠️</div>
          <h1 className="page-title">Couldn’t check in</h1>
          <p className="muted">{error}</p>
        </div>
      )}
      <div className="row" style={{ justifyContent: 'center' }}>
        <Link href="/scan" className="btn btn-primary">Scan another</Link>
        {result && <Link href={`/deals/${result.agreementId}`} className="btn btn-ghost">View deal</Link>}
      </div>
    </div>
  );
}
