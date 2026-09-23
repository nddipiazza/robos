import Link from 'next/link';
import { listGigs } from '@/lib/services';
import { currentUser } from '@/lib/session';
import GigCard from '@/components/GigCard';

export const metadata = { title: 'Find gigs' };
export const dynamic = 'force-dynamic';

export default async function GigsPage({ searchParams }) {
  const sp = await searchParams;
  const city = typeof sp?.city === 'string' ? sp.city.slice(0, 60) : '';
  const looking = sp?.looking === '1';
  const [user, gigs] = await Promise.all([currentUser(), listGigs({ city, lookingOnly: looking, limit: 100 })]);
  return (
    <div className="wrap page">
      <div className="dash-head">
        <div>
          <h1 className="page-title">Find gigs</h1>
          <p className="muted">Offer a Buddy Gig to any band that’s looking — or Stay-To-Play at a partner venue.</p>
        </div>
        {user?.band && <Link href="/gigs/new" className="btn btn-primary">+ List a gig</Link>}
      </div>
      <form className="filters" method="get" role="search">
        <input name="city" defaultValue={city} placeholder="City (e.g. Austin)" aria-label="Filter by city" />
        <label className="check">
          <input type="checkbox" name="looking" value="1" defaultChecked={looking} /> Looking for a buddy
        </label>
        <button className="btn btn-secondary btn-sm">Filter</button>
      </form>
      {gigs.length ? (
        <div className="cards" data-testid="gig-list">
          {gigs.map((g) => (
            <GigCard key={g.id} gig={g} mine={user?.band?.id === g.band_id} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <p>No gigs match{city ? ` “${city}”` : ''} yet.</p>
          <Link href={user ? '/gigs/new' : '/signup'} className="btn btn-primary">List your gig</Link>
        </div>
      )}
    </div>
  );
}
