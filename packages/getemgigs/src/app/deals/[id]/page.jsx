import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { getAgreement } from '@/lib/services';
import { checkInWindow } from '@/lib/checkin';
import CheckInCode from '@/components/CheckInCode';
import { money, STATUS_LABELS } from '@/lib/format';
import LocalTime from '@/components/LocalTime';
import { AgreementActions } from '@/components/forms';

export const metadata = { title: 'Buddy Gig deal' };
export const dynamic = 'force-dynamic';

export default async function DealPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await currentUser();
  if (!user) redirect(`/login?next=/deals/${id}`);
  const a = await getAgreement(id);
  if (!a || !user.band || (a.proposer_band_id !== user.band.id && a.target_band_id !== user.band.id)) notFound();
  const me = user.band.id;
  const myAttendance = a.attendance.find((x) => x.attendee_band_id === me);
  const theirAttendance = a.attendance.find((x) => x.attendee_band_id !== me);
  const iAmProposer = a.proposer_band_id === me;
  const other = iAmProposer ? a.target_band_name : a.proposer_band_name;
  // The gig I must attend is the OTHER band's gig.
  const myDuty = iAmProposer
    ? { title: a.target_gig_title, starts: a.target_gig_starts_at, venue: a.target_venue_name, city: a.target_venue_city }
    : { title: a.proposer_gig_title, starts: a.proposer_gig_starts_at, venue: a.proposer_venue_name, city: a.proposer_venue_city };
  const theirDuty = iAmProposer
    ? { title: a.proposer_gig_title, starts: a.proposer_gig_starts_at, venue: a.proposer_venue_name }
    : { title: a.target_gig_title, starts: a.target_gig_starts_at, venue: a.target_venue_name };
  const win = checkInWindow(myDuty.starts);
  const now = new Date();
  const windowOpen = now >= win.opensAt && now <= win.closesAt;
  const hostWin = checkInWindow(theirDuty.starts);
  const hostWindowOpen = now >= hostWin.opensAt && now <= hostWin.closesAt;

  return (
    <div className="wrap narrow page">
      {sp?.sent && <p className="alert alert-ok" data-testid="deal-sent">Offer sent to {other}. You’ll see it here when they respond.</p>}
      <p className="eyebrow"><Link href="/dashboard">← Dashboard</Link></p>
      <h1 className="page-title">Buddy Gig with {other}</h1>
      <p>
        <span className={`status status-${a.status.toLowerCase()}`} data-testid="deal-status">{STATUS_LABELS[a.status]}</span>{' '}
        <span className="muted">· {money(a.deposit_cents)} deposit each</span>
      </p>
      {a.message && <blockquote className="quote">“{a.message}”</blockquote>}

      <div className="duties">
        <div className="card duty">
          <p className="eyebrow">You attend</p>
          <h3>{myDuty.title}</h3>
          <p className="small">{myDuty.venue} · {myDuty.city}</p>
          <p className="small"><LocalTime iso={myDuty.starts} /></p>
          {myAttendance && (
            <p><span className={`status status-${myAttendance.status.toLowerCase()}`} data-testid="my-attendance">{STATUS_LABELS[myAttendance.status]}</span>

            </p>
          )}
        </div>
        <div className="card duty">
          <p className="eyebrow">{other} attends</p>
          <h3>{theirDuty.title}</h3>
          <p className="small">{theirDuty.venue}</p>
          <p className="small"><LocalTime iso={theirDuty.starts} /></p>
          {theirAttendance && (
            <p><span className={`status status-${theirAttendance.status.toLowerCase()}`} data-testid="their-attendance">{STATUS_LABELS[theirAttendance.status]}</span></p>
          )}
        </div>
      </div>

      {a.status === 'PROPOSED' && (
        <section className="block">
          {a.target_band_id === me ? (
            <>
              <p>Accepting locks <strong>{money(a.deposit_cents)}</strong> from each band’s wallet until both shows are over.</p>
              <AgreementActions agreementId={a.id} canAccept />
            </>
          ) : (
            <>
              <p className="muted">Waiting for {other} to accept.</p>
              <AgreementActions agreementId={a.id} canCancel />
            </>
          )}
        </section>
      )}

      {myAttendance?.status === 'VERIFIED' && (
        <p className="alert alert-ok" data-testid="checkin-verified">
          ✅ {other} scanned you in at {myDuty.venue}. Your {money(a.deposit_cents)} deposit is back in your wallet.
        </p>
      )}

      {a.status === 'ACTIVE' && myAttendance?.status === 'PENDING' && (
        <section className="block">
          <h2 className="block-title">Your check-in code for {myDuty.venue}</h2>
          {windowOpen ? (
            <CheckInCode agreementId={a.id} attendanceId={myAttendance.id} hostBandName={other} />
          ) : now < win.opensAt ? (
            <p className="muted">Your check-in code unlocks at doors: <LocalTime iso={win.opensAt.toISOString()} />. Show it to {other} at the door and they’ll scan you in.</p>
          ) : (
            <p className="muted">The check-in window closed. This deal will be settled at the next morning run.</p>
          )}
        </section>
      )}

      {a.status === 'ACTIVE' && theirAttendance?.status === 'PENDING' && (
        <section className="block">
          <h2 className="block-title">Scan {other} in at your show</h2>
          {hostWindowOpen ? (
            <>
              <p className="muted">When {other} arrives at {theirDuty.venue}, scan the code on their phone.</p>
              <a href="/scan" className="btn btn-secondary btn-block btn-lg" data-testid="open-scanner">📷 Scan check-in code</a>
            </>
          ) : (
            <p className="muted">Scanning opens at doors for your show (<LocalTime iso={hostWin.opensAt.toISOString()} />).</p>
          )}
        </section>
      )}

      <section className="block">
        <h2 className="block-title">Timeline</h2>
        <ol className="timeline" data-testid="deal-timeline">
          <li><LocalTime iso={a.created_at} /> — {a.proposer_band_name} offered the trade</li>
          {a.accepted_at && <li><LocalTime iso={a.accepted_at} /> — {a.target_band_name} accepted; deposits locked</li>}
          {a.attendance.filter((x) => x.verified_at).map((x) => (
            <li key={x.id}><LocalTime iso={x.verified_at} /> — {x.attendee_band_id === a.proposer_band_id ? a.proposer_band_name : a.target_band_name} was scanned in at the door — deposit refunded</li>
          ))}
          {a.attendance.filter((x) => x.status === 'FORFEITED').map((x) => (
            <li key={x.id}>{x.attendee_band_id === a.proposer_band_id ? a.proposer_band_name : a.target_band_name} no-show — deposit paid to {x.host_band_id === a.proposer_band_id ? a.proposer_band_name : a.target_band_name}</li>
          ))}
          {a.attendance.filter((x) => x.status === 'DISPUTED').map((x) => (
            <li key={x.id}>{x.attendee_band_id === a.proposer_band_id ? a.proposer_band_name : a.target_band_name} showed a check-in code that was never scanned — deposit returned, no payout</li>
          ))}
          {a.settled_at && <li><LocalTime iso={a.settled_at} /> — deal settled</li>}
        </ol>
      </section>
    </div>
  );
}
