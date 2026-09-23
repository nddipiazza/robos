import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { getGig, listGigs, stayCommitmentsForGig } from '@/lib/services';
import { money } from '@/lib/format';
import LocalTime from '@/components/LocalTime';
import { CancelGigButton, ProposeForm, StayForm } from '@/components/forms';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { id } = await params;
  const gig = await getGig(id).catch(() => null);
  return { title: gig ? `${gig.title} — ${gig.band_name}` : 'Gig' };
}

export default async function GigPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const [gig, user] = await Promise.all([getGig(id), currentUser()]);
  if (!gig) notFound();
  const mine = user?.band?.id === gig.band_id;
  const [myGigs, stays] = await Promise.all([
    user?.band && !mine ? listGigs({ bandId: user.band.id }) : Promise.resolve([]),
    stayCommitmentsForGig(gig.id),
  ]);
  const plain = (x) => JSON.parse(JSON.stringify(x));
  const mapUrl = `https://www.openstreetmap.org/?mlat=${gig.venue_lat}&mlon=${gig.venue_lon}#map=17/${gig.venue_lat}/${gig.venue_lon}`;

  return (
    <div className="wrap narrow page">
      {sp?.created && <p className="alert alert-ok" data-testid="gig-created">Your gig is listed. Share it with other bands!</p>}
      <p className="eyebrow"><Link href="/gigs">← All gigs</Link></p>
      <h1 className="page-title" data-testid="gig-title">{gig.title}</h1>
      <p className="gig-hero-band">{gig.band_name}{gig.band_genre ? ` · ${gig.band_genre}` : ''} <span className="tag">Rep {gig.band_reputation}</span></p>
      <div className="card detail-grid">
        <div><span className="muted small">When</span><strong><LocalTime iso={gig.starts_at} /></strong></div>
        <div><span className="muted small">Where</span><strong>{gig.venue_name}</strong><span className="small">{gig.venue_address}, {gig.venue_city} · <a href={mapUrl} rel="noopener" target="_blank">map</a></span></div>
        <div><span className="muted small">Tickets</span><strong>{gig.ticket_price_cents ? money(gig.ticket_price_cents) : 'Free'}</strong></div>
        <div><span className="muted small">Buddy deposit</span><strong>{money(gig.deposit_cents)}</strong></div>
      </div>

      {mine ? (
        <section className="block">
          <h2 className="block-title">This is your gig</h2>
          <p className="muted">Other bands can offer you a Buddy Gig from this page. Offers show up on your dashboard.</p>
          <div className="row"><Link href="/dashboard" className="btn btn-secondary">Go to dashboard</Link><CancelGigButton gigId={gig.id} /></div>
        </section>
      ) : (
        <section className="block">
          <h2 className="block-title">🤝 Offer a Buddy Gig to {gig.band_name}</h2>
          <p className="muted">You go to their show, they come to yours. Both bands lock {money(gig.deposit_cents)} (or your gig’s deposit if higher). Check in at the venue to get it back.</p>
          {user?.band ? (
            <div className="card"><ProposeForm targetGigId={gig.id} myGigs={plain(myGigs)} /></div>
          ) : (
            <Link href={user ? '/dashboard' : `/signup`} className="btn btn-primary">{user ? 'Set up your band first' : 'Sign up to offer a Buddy Gig'}</Link>
          )}
        </section>
      )}

      {gig.venue_stay_to_play && (
        <section className="block">
          <h2 className="block-title">★ Stay-To-Play at {gig.venue_name}</h2>
          {stays.length > 0 && (
            <p className="small">Supporting this show: {stays.map((s) => `${s.band_name} (${s.tickets})`).join(', ')}</p>
          )}
          {!mine && user?.band ? (
            <div className="card"><StayForm targetGigId={gig.id} myGigsSameVenue={plain(myGigs.filter((g) => g.venue_id === gig.venue_id))} /></div>
          ) : !mine ? (
            <p className="muted">Bands with a gig at this venue can commit to tickets here instead of pay-to-play.</p>
          ) : null}
        </section>
      )}
    </div>
  );
}
