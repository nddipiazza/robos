import Link from 'next/link';
import { currentUser } from '@/lib/session';
import { listGigs, siteStats } from '@/lib/services';
import GigCard from '@/components/GigCard';

export const dynamic = 'force-dynamic';

async function loadData() {
  try {
    const [stats, gigs] = await Promise.all([siteStats(), listGigs({ limit: 6 })]);
    return { stats, gigs };
  } catch (err) {
    console.error('landing data', err);
    return { stats: null, gigs: [] };
  }
}

const FAQ = [
  [
    'Is it free?',
    'Yes. Signing up, listing gigs and making Buddy Gig deals is free. During the beta, deposits use gig credits (every band starts with $100 in credits) — no card payments are processed yet.',
  ],
  [
    'How does check-in work?',
    'When doors open, open the deal on your phone at the venue and tap “Check in”. We compare your GPS fix to the venue location — within 150 meters counts. Your deposit is released on the spot.',
  ],
  [
    'What happens if a band bails?',
    'The next morning our settlement job closes out every deal. Anyone who never checked in forfeits their deposit to the band whose show they skipped. Their reputation score drops too.',
  ],
  [
    'What is Stay-To-Play?',
    'Instead of buying a stack of tickets to your own show (pay-to-play), you commit to buying a few tickets to another band’s show at the same venue. The venue still gets a crowd — and you’re out supporting the scene.',
  ],
  [
    'Can I use it on my phone?',
    'It’s built phone-first. Add getemgigs.com to your home screen and it works like an app, including GPS check-in at the venue.',
  ],
];

export default async function Home() {
  const [user, { stats, gigs }] = await Promise.all([currentUser(), loadData()]);
  const primaryHref = user ? (user.band ? '/gigs' : '/dashboard') : '/signup';
  const primaryLabel = user ? (user.band ? 'Find a Buddy Gig' : 'Set up your band') : 'Get your band on — free';

  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">For local bands · Beta</p>
            <h1 className="hero-title">
              Fill the room.
              <br />
              <span className="hl">Kill pay-to-play.</span>
            </h1>
            <p className="lead">
              Trade attendance with other bands: <em>I’ll come to your gig if you come to mine.</em> Both bands lock a small
              deposit. Show up and check in at the venue — you get it back. Bail — it pays the band you stood up.
            </p>
            <div className="cta-row">
              <Link href={primaryHref} className="btn btn-primary btn-lg" data-testid="hero-cta">
                {primaryLabel}
              </Link>
              <Link href="/gigs" className="btn btn-ghost btn-lg">
                Browse gigs
              </Link>
            </div>
            <ul className="hero-points">
              <li>🤝 Buddy Gigs with deposit escrow</li>
              <li>📍 GPS check-in at the venue</li>
              <li>🎟️ Stay-To-Play instead of pay-to-play</li>
            </ul>
          </div>
          <div className="hero-media">
            <div className="phone">
              <img
                src="/hero.gif"
                alt="Two bands make a Buddy Gig deal on Get 'Em Gigs, lock deposits, and check in at the venue with GPS"
                width="390"
                height="844"
                fetchPriority="high"
              />
            </div>
          </div>
        </div>
      </section>

      {stats && stats.bands >= 10 && (
        <section className="stats" aria-label="Live numbers">
          <div className="wrap stats-grid">
            <div><strong data-testid="stat-bands">{stats.bands}</strong><span>bands</span></div>
            <div><strong>{stats.upcoming_gigs}</strong><span>upcoming gigs</span></div>
            <div><strong>{stats.deals}</strong><span>Buddy Gig deals</span></div>
            <div><strong>{stats.checkins}</strong><span>verified check-ins</span></div>
          </div>
        </section>
      )}

      <section className="section" id="how">
        <div className="wrap">
          <h2 className="section-title">How a Buddy Gig works</h2>
          <ol className="steps">
            <li>
              <span className="step-n">1</span>
              <h3>List your gig</h3>
              <p>Pick the venue, date and a deposit between $10 and $100.</p>
            </li>
            <li>
              <span className="step-n">2</span>
              <h3>Offer a trade</h3>
              <p>Find another band’s show and offer: we come to yours, you come to ours.</p>
            </li>
            <li>
              <span className="step-n">3</span>
              <h3>Lock deposits</h3>
              <p>When they accept, both bands’ deposits are held until the shows are over.</p>
            </li>
            <li>
              <span className="step-n">4</span>
              <h3>Show up &amp; check in</h3>
              <p>Tap check-in at the venue. Within 150m of the door, your deposit comes straight back.</p>
            </li>
          </ol>
          <div className="outcomes">
            <div className="outcome outcome-good">
              <h3>They show up</h3>
              <p>You got a crowd. Both deposits come back. Everyone’s reputation goes up.</p>
            </div>
            <div className="outcome outcome-bad">
              <h3>They bail</h3>
              <p>At settlement the next morning, their deposit is paid to you. You win either way.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-alt" id="stay-to-play">
        <div className="wrap split">
          <div>
            <p className="eyebrow">Venue Stay-To-Play</p>
            <h2 className="section-title">Pay to <s>play</s> stay.</h2>
            <p className="lead">
              Pay-to-play makes you buy tickets to your own gig. Stay-To-Play flips it: commit to a few tickets for another
              band at the same venue and go. The venue still gets a crowd, and you’re building the scene you play in.
            </p>
            <Link href="/stay-to-play" className="btn btn-secondary">How Stay-To-Play works</Link>
          </div>
          <div className="compare">
            <div className="compare-col bad">
              <h3>Pay-to-play</h3>
              <ul>
                <li>Buy 30 tickets to your own show</li>
                <li>Beg friends to pay you back</li>
                <li>Eat the loss if they don’t</li>
              </ul>
            </div>
            <div className="compare-col good">
              <h3>Stay-To-Play</h3>
              <ul>
                <li>Commit 2–10 tickets to another band</li>
                <li>Go see a great show</li>
                <li>Venue books you with a built-in crowd</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="upcoming">
        <div className="wrap">
          <div className="section-head">
            <h2 className="section-title">Upcoming gigs</h2>
            <Link href="/gigs" className="link-arrow">See all →</Link>
          </div>
          {gigs.length ? (
            <div className="cards">
              {gigs.map((g) => (
                <GigCard key={g.id} gig={g} />
              ))}
            </div>
          ) : (
            <div className="empty">
              <p>No gigs listed yet. Be the first band in your city.</p>
              <Link href={user ? '/gigs/new' : '/signup'} className="btn btn-primary">List your gig</Link>
            </div>
          )}
        </div>
      </section>

      <section className="section section-alt" id="faq">
        <div className="wrap narrow">
          <h2 className="section-title">Questions</h2>
          <div className="faq">
            {FAQ.map(([qText, a]) => (
              <details key={qText}>
                <summary>{qText}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="section final-cta">
        <div className="wrap narrow center">
          <h2 className="section-title">Your next show deserves a crowd.</h2>
          <p className="lead">Free to join. Takes a minute.</p>
          <Link href={primaryHref} className="btn btn-primary btn-lg">{primaryLabel}</Link>
        </div>
      </section>
    </>
  );
}
