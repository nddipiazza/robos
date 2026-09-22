'use client';

import { useState } from 'react';

const SAMPLE_GIGS = [
  {
    id: 'gig-101',
    title: 'Neon Underground: Friday Night Showcase',
    band: 'The Neon Vipers',
    genre: 'Synthwave / Indie Rock',
    city: 'Austin, TX',
    venue: 'The Subterranean Lounge',
    venueCoords: { lat: 30.2672, lon: -97.7431 },
    date: 'Friday, Oct 2, 2026',
    time: '8:00 PM',
    price: '$15',
    status: 'BUDDIED_ESCROW_LOCKED',
    buddyBand: 'Velvet Riot',
    buddyDate: 'Oct 10, 2026',
    escrowDeposit: '$50',
    avatar: '🎸',
  },
  {
    id: 'gig-102',
    title: 'Post-Punk Saturday Revelry',
    band: 'Velvet Riot',
    genre: 'Post-Punk / Alternative',
    city: 'Austin, TX',
    venue: 'The Subterranean Lounge',
    venueCoords: { lat: 30.2672, lon: -97.7431 },
    date: 'Saturday, Oct 10, 2026',
    time: '9:00 PM',
    price: '$12',
    status: 'BUDDIED_ESCROW_LOCKED',
    buddyBand: 'The Neon Vipers',
    buddyDate: 'Oct 2, 2026',
    escrowDeposit: '$50',
    avatar: '⚡',
  },
  {
    id: 'gig-103',
    title: 'Funk & Soul Revolution',
    band: 'Electric Brass Syndicate',
    genre: 'Funk / Soul Fusion',
    city: 'Nashville, TN',
    venue: 'Black Velvet Ballroom',
    venueCoords: { lat: 36.1627, lon: -86.7816 },
    date: 'Friday, Oct 16, 2026',
    time: '7:30 PM',
    price: '$18',
    status: 'LOOKING_FOR_BUDDY',
    buddyBand: null,
    buddyDate: null,
    escrowDeposit: '$50',
    avatar: '🎺',
  },
  {
    id: 'gig-104',
    title: 'Shoegaze Reverie Vol. 4',
    band: 'Midnight Echoes',
    genre: 'Dream Pop / Shoegaze',
    city: 'Brooklyn, NY',
    venue: 'Mercury Electric Room',
    venueCoords: { lat: 40.7128, lon: -73.9610 },
    date: 'Friday, Oct 23, 2026',
    time: '8:30 PM',
    price: '$15',
    status: 'LOOKING_FOR_BUDDY',
    buddyBand: null,
    buddyDate: null,
    escrowDeposit: '$40',
    avatar: '🌙',
  },
  {
    id: 'gig-105',
    title: 'Cascadia Stomp & Holler',
    band: 'Rusty Anchor Collective',
    genre: 'Folk / Americana',
    city: 'Seattle, WA',
    venue: 'The Echo Chamber',
    venueCoords: { lat: 47.6062, lon: -122.3321 },
    date: 'Saturday, Oct 31, 2026',
    time: '8:00 PM',
    price: '$14',
    status: 'STAY_TO_PLAY_ACTIVE',
    buddyBand: 'Northwest Sound Machine',
    buddyDate: 'Nov 6, 2026',
    escrowDeposit: '$50',
    avatar: '🪕',
  },
];

const STAY_TO_PLAY_VENUES = [
  {
    venue: 'The Subterranean Lounge (Austin, TX)',
    traditional: 'Bands forced to pre-buy 30 tickets at $12 ($360 risk) to play their own show.',
    stayToPlay: 'Band buys 4 tickets ($48 total) to another band\'s show at the venue and attends it! Venue gets attendance & drinks, bands support each other.',
    bandBenefit: 'Save $312 in upfront risk · Gain 4+ guaranteed attendees at your own show.',
  },
  {
    venue: 'Black Velvet Ballroom (Nashville, TN)',
    traditional: 'Unsold band tickets deducted directly from band guarantee payout.',
    stayToPlay: 'Reciprocal ticket pool: Band attends sister band\'s gig on Thursday, sister band attends your Saturday prime slot.',
    bandBenefit: 'Guaranteed crowds for both acts · Eliminates ticket-dumping stress.',
  },
];

export default function HomePage() {
  const [selectedCity, setSelectedCity] = useState('All');
  const [simLog, setSimLog] = useState('Ready for simulation. Select an action below to test Geolocation Escrow.');
  const [simState, setSimState] = useState('ESCROW_LOCKED');
  const [vipersBalance, setVipersBalance] = useState(150);
  const [riotBalance, setRiotBalance] = useState(200);

  const filteredGigs = selectedCity === 'All'
    ? SAMPLE_GIGS
    : SAMPLE_GIGS.filter(g => g.city.includes(selectedCity));

  // Geolocation Check-In Simulator
  const handleCheckInSim = (isAtVenue) => {
    // Venue is The Subterranean Lounge: 30.2672, -97.7431
    const venueLat = 30.2672;
    const venueLon = -97.7431;

    let userLat, userLon;
    if (isAtVenue) {
      // 25 meters away
      userLat = 30.2673;
      userLon = -97.7432;
    } else {
      // 1.8 km away (at home / bailed)
      userLat = 30.2820;
      userLon = -97.7320;
    }

    // Call checkin API or local calculation
    const R = 6371e3;
    const phi1 = (userLat * Math.PI) / 180;
    const phi2 = (venueLat * Math.PI) / 180;
    const deltaPhi = ((venueLat - userLat) * Math.PI) / 180;
    const deltaLambda = ((venueLon - userLon) * Math.PI) / 180;
    const a = Math.sin(deltaPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * (Math.sin(deltaLambda / 2) ** 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distMeters = Math.round(R * c);

    if (distMeters <= 150) {
      setSimState('REIMBURSED');
      setRiotBalance(prev => prev + 50);
      setSimLog(`[GEOLOCATION CHECK-IN SUCCESS]
Timestamp: ${new Date().toLocaleTimeString()}
Attendee: Velvet Riot (Checking in for The Neon Vipers show)
Venue: The Subterranean Lounge (Austin, TX)
Calculated Distance: ${distMeters} meters (Allowed Radius: 150m)
Status: 100% VERIFIED ON-PREMISE!
Escrow Action: $50 Security Deposit instantly unlocked & REIMBURSED to Velvet Riot.
Reputation Score: +2 (Current: 96/100)
Win-Win Achieved: The Neon Vipers got attendees at their show!`);
    } else {
      setSimState('FAILED_OUT_OF_RANGE');
      setSimLog(`[GEOLOCATION CHECK-IN REJECTED]
Timestamp: ${new Date().toLocaleTimeString()}
Attendee: Velvet Riot
Target Venue: The Subterranean Lounge
Attendee Location: (${userLat}, ${userLon})
Calculated Distance: ${distMeters} meters
Error: Out of geofence perimeter! Must be within 150m of venue.
Escrow Action: $50 Security Deposit remains held in escrow.`);
    }
  };

  // Next-Morning Forfeiture Simulator
  const handleForfeitSim = () => {
    setSimState('FORFEITED_PAID_TO_HOST');
    setVipersBalance(prev => prev + 50);
    setSimLog(`[NEXT-DAY 6:00 AM RECONCILIATION]
Event: Velvet Riot bailed & failed to check-in at The Neon Vipers gig.
Resolution: Automatic Escrow Forfeiture executed.
Transferred: $50.00 Security Deposit transferred directly to THE NEON VIPERS.
Reputation Penalty: Velvet Riot reputation adjusted (-8 pts).
Win-Win Achieved: Velvet Riot did not attend, but The Neon Vipers received $50 compensation!`);
  };

  const handleResetSim = () => {
    setSimState('ESCROW_LOCKED');
    setVipersBalance(150);
    setRiotBalance(200);
    setSimLog('Simulation reset. Escrow locked at $50 for Oct 2 gig.');
  };

  return (
    <div>
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-glow"></div>
        <div className="container">
          <div className="hero-pill">
            <span>⚡</span>
            <span>Live on getemgigs.com & RobOS Projects</span>
          </div>
          <h1 className="hero-title">
            The Gig Bandit <br />
            <span className="gradient-text">Get &apos;Em Gigs</span>
          </h1>
          <p className="hero-subtitle">
            A game changer for the local music scene. Eliminate empty rooms and predatory pay-to-play with
            <strong> reciprocal attendance contracts</strong>, <strong>geolocation-verified escrow</strong>, and
            <strong> Stay-To-Play venue economics</strong>.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="#buddy-gig" className="btn btn-pink">Try Buddy Gig Simulator 🤝</a>
            <a href="#stay-to-play" className="btn btn-secondary">Explore Stay-To-Play 🎟️</a>
            <a href="https://github.com/nddipiazza/getemgigs" target="_blank" rel="noopener noreferrer" className="btn btn-primary">View GitHub Repo ↗</a>
          </div>

          <div className="hero-stats">
            <div className="stat-item">
              <span className="stat-val">34</span>
              <span className="stat-lbl">Active Buddy Gigs</span>
            </div>
            <div className="stat-item">
              <span className="stat-val">$3,850</span>
              <span className="stat-lbl">Escrow Held & Protected</span>
            </div>
            <div className="stat-item">
              <span className="stat-val">96.8%</span>
              <span className="stat-lbl">Attendance Success Rate</span>
            </div>
            <div className="stat-item">
              <span className="stat-val">$0</span>
              <span className="stat-lbl">Pay-To-Play Exploitation</span>
            </div>
          </div>
        </div>
      </section>

      {/* Buddy Gig Feature (Beta) */}
      <section className="section" id="buddy-gig">
        <div className="container">
          <div className="section-tag">Core Feature #1 · In Beta</div>
          <h2 className="section-title">The Buddy Gig Feature</h2>
          <p className="section-desc">
            Local bands constantly struggle to get people to come to their gigs. The Buddy Gig feature allows two groups
            to link their gigs together in a formal mutual agreement: <em>&ldquo;You scratch my back, I&apos;ll scratch yours. I&apos;ll go to your gig if you go to my gig.&rdquo;</em>
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
            <div className="card">
              <span className="card-badge badge-escrow">The Problem</span>
              <h3 style={{ marginBottom: '0.75rem', color: '#fff' }}>How do you keep bands from bailing?</h3>
              <p style={{ color: 'var(--text-muted)' }}>
                Musicians and friends frequently promise to show up, then flake out at the last minute. Trust alone fails when Netflix and fatigue take over.
              </p>
            </div>
            <div className="card">
              <span className="card-badge badge-live">The Solution</span>
              <h3 style={{ marginBottom: '0.75rem', color: '#fff' }}>Security Deposit Escrow</h3>
              <p style={{ color: 'var(--text-muted)' }}>
                Upon buddying a gig, each group deposits a refundable security deposit ($25–$100) held securely in escrow by The Gig Bandit.
              </p>
            </div>
            <div className="card">
              <span className="card-badge badge-venue">The Win-Win</span>
              <h3 style={{ marginBottom: '0.75rem', color: '#fff' }}>Geolocation Proof &amp; Payout</h3>
              <p style={{ color: 'var(--text-muted)' }}>
                <strong>If you attend:</strong> GPS verifies presence within 150m of the venue, and your deposit is reimbursed. <br />
                <strong>If you bail:</strong> The next morning at 6:00 AM, your deposit is paid directly to the host band!
              </p>
            </div>
          </div>

          {/* Interactive Simulator */}
          <div className="simulator-box">
            <div className="sim-header">
              <div>
                <h3 style={{ color: '#fff', fontSize: '1.25rem' }}>🎮 Live Buddy Gig Escrow &amp; Geolocation Simulator</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Simulate the attendance verification lifecycle between <strong>The Neon Vipers</strong> and <strong>Velvet Riot</strong>.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: '#38bdf8' }}>
                  Neon Vipers: <strong>${vipersBalance}</strong>
                </span>
                <span style={{ fontSize: '0.85rem', color: '#ec4899' }}>
                  Velvet Riot: <strong>${riotBalance}</strong>
                </span>
                <button onClick={handleResetSim} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>Reset</button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <button
                onClick={() => handleCheckInSim(true)}
                className="btn btn-primary"
              >
                📍 Simulate On-Premise Check-In (25m from Venue &rarr; Reimburse Deposit)
              </button>
              <button
                onClick={() => handleCheckInSim(false)}
                className="btn btn-secondary"
              >
                🚫 Simulate Out-of-Range Check-In (1.8km away &rarr; Reject)
              </button>
              <button
                onClick={handleForfeitSim}
                className="btn btn-pink"
              >
                ⏰ Simulate Next-Morning No-Show (Forfeit Deposit &rarr; Pay Host Band)
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1rem 0' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Current Escrow State:</span>
              <span className={`card-badge ${simState === 'REIMBURSED' ? 'badge-live' : simState === 'FORFEITED_PAID_TO_HOST' ? 'badge-venue' : 'badge-escrow'}`}>
                {simState}
              </span>
            </div>

            <div className="sim-console">
              {simLog}
            </div>
          </div>
        </div>
      </section>

      {/* Venue Stay-To-Play Feature (Beta) */}
      <section className="section" id="stay-to-play">
        <div className="container">
          <div className="section-tag">Core Feature #2 · In Beta</div>
          <h2 className="section-title">The Venue Stay-To-Play Feature</h2>
          <p className="section-desc">
            Anyone who has ever played a show that was &ldquo;Pay-to-play&rdquo; knows it is terrible. A venue guarantees they make money from your band by pre-selling you a bunch of tickets, leaving you holding the bag.
          </p>

          <div className="card-grid" style={{ marginBottom: '2.5rem' }}>
            {STAY_TO_PLAY_VENUES.map((item, idx) => (
              <div key={idx} className="card">
                <span className="card-badge badge-venue">Venue Comparison</span>
                <h3 style={{ color: '#fff', marginBottom: '0.75rem' }}>{item.venue}</h3>
                <div style={{ margin: '0.75rem 0', padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', borderLeft: '3px solid #ef4444', borderRadius: '4px' }}>
                  <strong style={{ color: '#f87171', display: 'block', fontSize: '0.85rem' }}>Old Pay-To-Play Model:</strong>
                  <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>{item.traditional}</span>
                </div>
                <div style={{ margin: '0.75rem 0', padding: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', borderLeft: '3px solid #10b981', borderRadius: '4px' }}>
                  <strong style={{ color: '#34d399', display: 'block', fontSize: '0.85rem' }}>Stay-To-Play Model:</strong>
                  <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>{item.stayToPlay}</span>
                </div>
                <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', color: '#38bdf8', fontSize: '0.85rem', fontWeight: 600 }}>
                  ✓ {item.bandBenefit}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Gigs Explorer */}
      <section className="section" id="gigs-explorer">
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
            <div>
              <div className="section-tag">Live Gigs Network</div>
              <h2 className="section-title" style={{ marginBottom: 0 }}>Upcoming Gigs &amp; Buddy Matches</h2>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {['All', 'Austin', 'Nashville', 'Brooklyn', 'Seattle'].map(city => (
                <button
                  key={city}
                  onClick={() => setSelectedCity(city)}
                  className={`btn ${selectedCity === city ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                >
                  {city}
                </button>
              ))}
            </div>
          </div>

          <div className="card-grid">
            {filteredGigs.map(gig => (
              <div key={gig.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span className="card-badge badge-live">{gig.genre}</span>
                  <span style={{ fontSize: '1.5rem' }}>{gig.avatar}</span>
                </div>
                <h3 style={{ color: '#fff', fontSize: '1.2rem', marginBottom: '0.5rem' }}>{gig.title}</h3>
                <p style={{ color: '#38bdf8', fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.5rem' }}>{gig.band}</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>📍 {gig.venue} ({gig.city})</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>📅 {gig.date} · {gig.time} · {gig.price}</p>

                <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                  {gig.buddyBand ? (
                    <div style={{ fontSize: '0.85rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>🤝</span>
                      <span>Buddied with <strong>{gig.buddyBand}</strong> ({gig.escrowDeposit} Escrow Locked)</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.85rem', color: '#f59e0b' }}>⚠️ Looking for Buddy Gig</span>
                      <button
                        onClick={() => alert(`Buddy Request sent to ${gig.band} with ${gig.escrowDeposit} refundable escrow deposit.`)}
                        className="btn btn-secondary"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                      >
                        Buddy This Gig
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture & Vercel Info */}
      <section className="section" id="architecture">
        <div className="container">
          <div className="section-tag">Architecture &amp; Deployment</div>
          <h2 className="section-title">Vercel Edge &amp; RobOS Governance</h2>
          <p className="section-desc">
            Engineered with modern Next.js 15 App Router, zero-cost persistent storage tiers, and W3C SHACL shape validation via the RobOS SDLC Knowledge Graph.
          </p>

          <div className="card-grid">
            <div className="card">
              <span className="card-badge badge-live">Vercel Serverless</span>
              <h3 style={{ color: '#fff', marginBottom: '0.5rem' }}>Edge Performance</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Zero-cold-start Edge routing deployed to <code>getemgigs.com</code> with automated GitHub Actions CI/CD.
              </p>
            </div>
            <div className="card">
              <span className="card-badge badge-escrow">Haversine GPS Verification</span>
              <h3 style={{ color: '#fff', marginBottom: '0.5rem' }}>150m Perimeter Engine</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Mathematical great-circle radius check guaranteeing that security deposits are only unlocked upon verified venue arrival.
              </p>
            </div>
            <div className="card">
              <span className="card-badge badge-venue">RobOS Knowledge Graph</span>
              <h3 style={{ color: '#fff', marginBottom: '0.5rem' }}>Dual-State SDLC</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Modeled formally under <code>urn:robos:app:getemgigs</code> adhering to <code>schema:WebApplication</code> and <code>robos:FrontEndApp</code> shapes.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
