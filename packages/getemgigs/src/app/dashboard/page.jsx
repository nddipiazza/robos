import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { agreementsForBand, ledgerFor, listGigs, walletBalance, stayCommitmentsForBand } from '@/lib/services';
import { money, STATUS_LABELS, LEDGER_LABELS } from '@/lib/format';
import { BandForm } from '@/components/forms';
import GigCard from '@/components/GigCard';
import LocalTime from '@/components/LocalTime';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

export default async function Dashboard({ searchParams }) {
  const user = await currentUser();
  if (!user) redirect('/login?next=/dashboard');
  const sp = await searchParams;

  if (!user.band) {
    return (
      <div className="wrap narrow page">
        <p className="eyebrow">Step 2 of 2</p>
        <h1 className="page-title">Set up your band</h1>
        <p className="muted">Hey {user.displayName}! Tell other bands who you are. You’ll get $100 in beta gig credits to use for Buddy Gig deposits.</p>
        <div className="card">
          <BandForm />
        </div>
      </div>
    );
  }

  const band = user.band;
  const [balance, gigs, deals, ledger, commitments] = await Promise.all([
    walletBalance(band.id),
    listGigs({ bandId: band.id }),
    agreementsForBand(band.id),
    ledgerFor(band.id, 8),
    stayCommitmentsForBand(band.id),
  ]);
  const incoming = deals.filter((d) => d.status === 'PROPOSED' && d.target_band_id === band.id);
  const active = deals.filter((d) => d.status === 'ACTIVE');
  const other = deals.filter((d) => !incoming.includes(d) && !active.includes(d));
  const held = active.reduce((s, d) => s + d.deposit_cents, 0);

  return (
    <div className="wrap page">
      {sp?.welcome && (
        <p className="alert alert-ok" data-testid="welcome">🎉 {band.name} is live. $100 in gig credits added to your wallet.</p>
      )}
      <div className="dash-head">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1 className="page-title" data-testid="band-name">{band.name}</h1>
          <p className="muted">{[band.genre, band.hometown].filter(Boolean).join(' · ')}</p>
        </div>
        <Link href="/gigs/new" className="btn btn-primary" data-testid="list-gig">+ List a gig</Link>
      </div>

      <div className="kpis">
        <div className="kpi"><span>Wallet</span><strong data-testid="wallet-balance">{money(balance)}</strong></div>
        <div className="kpi"><span>Locked in deals</span><strong>{money(held)}</strong></div>
        <div className="kpi"><span>Reputation</span><strong data-testid="reputation">{band.reputation}</strong></div>
      </div>

      {incoming.length > 0 && (
        <section className="block">
          <h2 className="block-title">🔔 Offers waiting on you</h2>
          <DealList deals={incoming} bandId={band.id} />
        </section>
      )}

      <section className="block">
        <h2 className="block-title">Active Buddy Gigs</h2>
        {active.length ? <DealList deals={active} bandId={band.id} /> : <p className="muted">No active deals yet. <Link href="/gigs?looking=1">Find a band to trade with →</Link></p>}
      </section>

      <section className="block">
        <h2 className="block-title">Your upcoming gigs</h2>
        {gigs.length ? (
          <div className="cards">{gigs.map((g) => <GigCard key={g.id} gig={g} mine />)}</div>
        ) : (
          <div className="empty">
            <p>You haven’t listed any gigs yet.</p>
            <Link href="/gigs/new" className="btn btn-primary">List your first gig</Link>
          </div>
        )}
      </section>

      {commitments.length > 0 && (
        <section className="block">
          <h2 className="block-title">Stay-To-Play commitments</h2>
          <ul className="list">
            {commitments.map((c) => (
              <li key={c.id}>
                <strong>{c.tickets} tickets</strong> to {c.target_band_name} — {c.target_title} at {c.venue_name} (<LocalTime iso={c.target_starts_at} format="date" />)
              </li>
            ))}
          </ul>
        </section>
      )}

      {other.length > 0 && (
        <section className="block">
          <h2 className="block-title">Deal history</h2>
          <DealList deals={other} bandId={band.id} />
        </section>
      )}

      <section className="block">
        <h2 className="block-title">Wallet activity</h2>
        <ul className="ledger" data-testid="ledger">
          {ledger.map((l) => (
            <li key={l.id}>
              <div>
                <strong>{LEDGER_LABELS[l.kind] || l.kind}</strong>
                <span className="muted small">{l.memo}</span>
              </div>
              <span className={l.amount_cents >= 0 ? 'amt-pos' : 'amt-neg'}>{l.amount_cents >= 0 ? '+' : ''}{money(l.amount_cents)}</span>
            </li>
          ))}
        </ul>
        <p className="tiny muted">Beta: gig credits are not real money and have no cash value.</p>
      </section>
    </div>
  );
}

function DealList({ deals, bandId }) {
  return (
    <ul className="deals">
      {deals.map((d) => {
        const mineIsProposer = d.proposer_band_id === bandId;
        const other = mineIsProposer ? d.target_band_name : d.proposer_band_name;
        return (
          <li key={d.id}>
            <Link href={`/deals/${d.id}`} className="deal-row" data-testid="deal-row">
              <div>
                <strong>🤝 {other}</strong>
                <span className="muted small">{d.proposer_gig_title} ⇄ {d.target_gig_title}</span>
              </div>
              <span className={`status status-${d.status.toLowerCase()}`}>{STATUS_LABELS[d.status]}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
