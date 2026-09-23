import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { getGig, listGigs, stayCommitmentsForGig } from '@/lib/services';
import { money } from '@/lib/format';
import LocalTime from '@/components/LocalTime';
import { CancelGigButton, ProposeForm, StayForm } from '@/components/forms';
import JsonLd from '@/components/JsonLd';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';

function gigWhen(iso) {
  return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function gigIsOver(gig) {
  return new Date(gig.starts_at).getTime() + 5 * 3600 * 1000 < Date.now();
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const gig = await getGig(id).catch(() => null);
  if (!gig) return { title: 'Gig not found', robots: { index: false } };
  const title = `${gig.title} — ${gig.band_name} at ${gig.venue_name}, ${gig.venue_city}`;
  const description = `${gig.band_name}${gig.band_genre ? ` (${gig.band_genre})` : ''} plays ${gig.venue_name} in ${gig.venue_city} on ${gigWhen(gig.starts_at)} CT. ${gig.ticket_price_cents ? `Tickets ${money(gig.ticket_price_cents)}.` : 'Free show.'} Local bands: offer a Buddy Gig on Get 'Em Gigs.`;
  return {
    title,
    description,
    alternates: { canonical: `/gigs/${gig.id}` },
    openGraph: { type: 'website', title, description, url: `/gigs/${gig.id}` },
    twitter: { card: 'summary_large_image', title, description },
    robots: gig.status !== 'OPEN' || gigIsOver(gig) ? { index: false, follow: true } : undefined,
  };
}

function eventLd(gig) {
  const url = `${SITE_URL}/gigs/${gig.id}`;
  const [locality, region] = String(gig.venue_city || '').split(',').map((x) => x.trim());
  const start = new Date(gig.starts_at);
  return {
    '@context': 'https://schema.org',
    '@type': 'MusicEvent',
    '@id': `${url}#event`,
    name: gig.title,
    url,
    description: `${gig.band_name} live at ${gig.venue_name}, ${gig.venue_city}.`,
    image: [`${url}/opengraph-image`],
    startDate: start.toISOString(),
    endDate: new Date(start.getTime() + 3 * 3600 * 1000).toISOString(),
    doorTime: new Date(start.getTime() - 3600 * 1000).toISOString(),
    eventStatus: gig.status === 'CANCELLED' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'MusicVenue',
      name: gig.venue_name,
      address: {
        '@type': 'PostalAddress',
        streetAddress: gig.venue_address || undefined,
        addressLocality: locality || undefined,
        addressRegion: region || undefined,
        addressCountry: 'US',
      },
    },
    performer: { '@type': 'MusicGroup', name: gig.band_name, genre: gig.band_genre || undefined },
    organizer: { '@type': 'MusicGroup', name: gig.band_name, url },
    offers: {
      '@type': 'Offer',
      url,
      price: (gig.ticket_price_cents / 100).toFixed(2),
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      validFrom: new Date(gig.created_at).toISOString(),
    },
    isAccessibleForFree: !gig.ticket_price_cents,
  };
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
  const mapUrl = `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${gig.venue_name}, ${gig.venue_address}, ${gig.venue_city}`)}`;

  return (
    <div className="wrap narrow page">
      <JsonLd data={eventLd(gig)} />
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
          <p className="muted">You go to their show, they come to yours. Both bands lock {money(gig.deposit_cents)} (or your gig’s deposit if higher). Get scanned in at the show to get it back.</p>
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
