import Link from 'next/link';
import LocalTime from './LocalTime';
import { money } from '@/lib/format';

export default function GigCard({ gig, mine = false }) {
  return (
    <Link href={`/gigs/${gig.id}`} className="gig-card" data-testid="gig-card">
      <div className="gig-date" aria-hidden="true">
        <span className="gig-mon"><LocalTime iso={gig.starts_at} format="mon" /></span>
        <span className="gig-day"><LocalTime iso={gig.starts_at} format="day" /></span>
      </div>
      <div className="gig-body">
        <h3 className="gig-title">{gig.title}</h3>
        <p className="gig-band">{gig.band_name}{gig.band_genre ? ` · ${gig.band_genre}` : ''}</p>
        <p className="gig-meta">
          {gig.venue_name} · {gig.venue_city}
        </p>
        <p className="gig-meta">
          <LocalTime iso={gig.starts_at} /> · {gig.ticket_price_cents ? money(gig.ticket_price_cents) : 'Free'}
        </p>
        <div className="tags">
          {gig.buddy_count > 0 ? (
            <span className="tag tag-green">🤝 Buddied</span>
          ) : (
            <span className="tag tag-pink">Looking for a buddy</span>
          )}
          <span className="tag">{money(gig.deposit_cents)} deposit</span>
          {gig.venue_stay_to_play && <span className="tag tag-yellow">★ Stay-To-Play</span>}
          {mine && <span className="tag">Your gig</span>}
        </div>
      </div>
    </Link>
  );
}
