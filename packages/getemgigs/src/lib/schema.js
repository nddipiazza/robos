// Idempotent schema. Every statement is safe to re-run on cold start.

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    display_name text NOT NULL,
    created_ip text,
    is_disabled boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip text,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS bands (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    name text NOT NULL,
    genre text NOT NULL DEFAULT '',
    hometown text NOT NULL DEFAULT '',
    bio text NOT NULL DEFAULT '',
    reputation int NOT NULL DEFAULT 100,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS bands_name_idx ON bands(lower(name))`,
  `CREATE TABLE IF NOT EXISTS venues (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    address text NOT NULL DEFAULT '',
    city text NOT NULL,
    lat double precision NOT NULL,
    lon double precision NOT NULL,
    capacity int,
    stay_to_play boolean NOT NULL DEFAULT false,
    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS gigs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    band_id uuid NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
    venue_id uuid NOT NULL REFERENCES venues(id),
    title text NOT NULL,
    starts_at timestamptz NOT NULL,
    ticket_price_cents int NOT NULL DEFAULT 0,
    deposit_cents int NOT NULL DEFAULT 2500,
    status text NOT NULL DEFAULT 'OPEN',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS gigs_starts_idx ON gigs(starts_at)`,
  `CREATE TABLE IF NOT EXISTS agreements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proposer_gig_id uuid NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
    target_gig_id uuid NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
    proposer_band_id uuid NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
    target_band_id uuid NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
    deposit_cents int NOT NULL,
    message text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'PROPOSED',
    created_at timestamptz NOT NULL DEFAULT now(),
    accepted_at timestamptz,
    settled_at timestamptz
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS agreements_pair_idx ON agreements(proposer_gig_id, target_gig_id)
     WHERE status IN ('PROPOSED','ACTIVE')`,
  `CREATE TABLE IF NOT EXISTS attendance (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agreement_id uuid NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
    attendee_band_id uuid NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
    host_band_id uuid NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
    host_gig_id uuid NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'PENDING',
    distance_m int,
    verified_at timestamptz,
    UNIQUE (agreement_id, attendee_band_id)
  )`,
  `CREATE TABLE IF NOT EXISTS ledger (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    band_id uuid NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
    agreement_id uuid REFERENCES agreements(id) ON DELETE SET NULL,
    kind text NOT NULL,
    amount_cents int NOT NULL,
    memo text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS ledger_band_idx ON ledger(band_id)`,
  `CREATE TABLE IF NOT EXISTS stay_commitments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    band_id uuid NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
    own_gig_id uuid NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
    target_gig_id uuid NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
    tickets int NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (own_gig_id, target_gig_id)
  )`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
    key text PRIMARY KEY,
    window_start timestamptz NOT NULL,
    count int NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id bigserial PRIMARY KEY,
    user_id uuid,
    ip text,
    action text NOT NULL,
    detail text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
];

export const SEED_VENUES = [
  { name: 'The Mohawk', address: '912 Red River St', city: 'Austin, TX', lat: 30.2697, lon: -97.7362, capacity: 900, stayToPlay: true },
  { name: 'Cheer Up Charlies', address: '900 Red River St', city: 'Austin, TX', lat: 30.2695, lon: -97.7358, capacity: 400, stayToPlay: true },
  { name: 'The Basement East', address: '917 Woodland St', city: 'Nashville, TN', lat: 36.1767, lon: -86.7510, capacity: 400, stayToPlay: true },
  { name: "Baby's All Right", address: '146 Broadway', city: 'Brooklyn, NY', lat: 40.7099, lon: -73.9628, capacity: 280, stayToPlay: true },
  { name: 'Sunset Tavern', address: '5433 Ballard Ave NW', city: 'Seattle, WA', lat: 47.6682, lon: -122.3843, capacity: 180, stayToPlay: true },
  { name: 'Empty Bottle', address: '1035 N Western Ave', city: 'Chicago, IL', lat: 41.9005, lon: -87.6868, capacity: 400, stayToPlay: true },
];
