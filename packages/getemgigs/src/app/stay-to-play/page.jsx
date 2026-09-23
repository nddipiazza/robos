import Link from 'next/link';
import { listVenues, listGigs } from '@/lib/services';
import GigCard from '@/components/GigCard';

export const metadata = {
  title: 'Stay-To-Play: the fair alternative to pay-to-play',
  description: 'Stop buying tickets to your own gig. At Stay-To-Play partner venues, bands commit 2–10 tickets to another band’s show at the same venue instead — venues still get a crowd, and the scene grows.',
  alternates: { canonical: '/stay-to-play' },
  openGraph: { title: 'Stay-To-Play: the fair alternative to pay-to-play', description: 'Stop buying tickets to your own gig. At Stay-To-Play partner venues, bands commit 2–10 tickets to another band’s show at the same venue instead — venues still get a crowd, and the scene grows.', url: '/stay-to-play' },
};
export const dynamic = 'force-dynamic';

export default async function StayToPlayPage() {
  const [venues, gigs] = await Promise.all([listVenues(), listGigs({ limit: 100 })]);
  const partners = venues.filter((v) => v.stay_to_play);
  const stayGigs = gigs.filter((g) => g.venue_stay_to_play).slice(0, 12);
  return (
    <div className="wrap page">
      <p className="eyebrow">Venue Stay-To-Play</p>
      <h1 className="page-title">Stop paying to play. Stay to play.</h1>
      <div className="split">
        <div className="stack">
          <p className="lead">
            Pay-to-play venues make bands pre-buy tickets to their own show. Stay-To-Play partner venues ask for something
            better: commit to 2–10 tickets for <em>another</em> band’s show at the same venue — and go.
          </p>
          <ol className="list-num">
            <li>List your gig at a ★ partner venue.</li>
            <li>Open another band’s gig at that venue and commit tickets.</li>
            <li>The venue sees your support on your booking; the other band sees a crowd coming.</li>
          </ol>
          <Link href="/gigs/new" className="btn btn-primary">List a gig at a partner venue</Link>
        </div>
        <div className="card">
          <h2 className="block-title">★ Partner venues</h2>
          <ul className="list">
            {partners.map((v) => (
              <li key={v.id}><strong>{v.name}</strong> <span className="muted small">— {v.city}</span></li>
            ))}
          </ul>
          <p className="tiny muted">Run a venue? Add it when listing a gig and tick “supports Stay-To-Play”.</p>
        </div>
      </div>
      <section className="block">
        <h2 className="block-title">Shows at partner venues</h2>
        {stayGigs.length ? (
          <div className="cards">{stayGigs.map((g) => <GigCard key={g.id} gig={g} />)}</div>
        ) : (
          <p className="muted">No shows listed at partner venues yet.</p>
        )}
      </section>
    </div>
  );
}
