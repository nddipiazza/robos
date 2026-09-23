// Domain services: bands, venues, gigs, Buddy Gig agreements, check-ins, settlement, Stay-To-Play.
// Route handlers stay thin; everything testable lives here.
//
// Money note (beta): deposits move "gig credits" in an internal ledger. Every band starts
// with $100 in credits. No real card payments are processed yet.

import { q, one } from './db.js';
import { verifyCheckIn, checkInWindow, isValidCoord } from './geo.js';
import { hashPassword, checkPassword } from './auth.js';
import { HttpError, cleanText, toCents, assertUuid, normalizeEmail, validatePassword } from './security.js';

export const STARTER_CREDIT_CENTS = 10000;
export const MIN_DEPOSIT_CENTS = 1000;
export const MAX_DEPOSIT_CENTS = 10000;

// ------------------------------------------------------------------ accounts

export async function signup({ email, password, displayName, ip }) {
  const cleanEmail = normalizeEmail(email);
  validatePassword(password, cleanEmail);
  const name = cleanText(displayName, { min: 2, max: 60, field: 'Your name' });
  const existing = await one('SELECT id FROM users WHERE email = $1', [cleanEmail]);
  if (existing) throw new HttpError(409, 'An account with that email already exists. Try logging in.');
  const hash = await hashPassword(password);
  const user = await one(
    `INSERT INTO users (email, password_hash, display_name, created_ip) VALUES ($1,$2,$3,$4)
     ON CONFLICT (email) DO NOTHING RETURNING id, email, display_name`,
    [cleanEmail, hash, name, ip],
  );
  if (!user) throw new HttpError(409, 'An account with that email already exists. Try logging in.');
  return user;
}

export async function login({ email, password }) {
  let cleanEmail;
  try {
    cleanEmail = normalizeEmail(email);
  } catch {
    throw new HttpError(401, 'Incorrect email or password.');
  }
  const user = await one('SELECT id, email, password_hash, is_disabled FROM users WHERE email = $1', [cleanEmail]);
  const ok = await checkPassword(String(password || '').slice(0, 200), user?.password_hash);
  if (!user || !ok || user.is_disabled) throw new HttpError(401, 'Incorrect email or password.');
  return user;
}

export async function deleteAccount(userId) {
  // Cascades remove sessions, band, gigs, agreements, attendance, ledger, commitments.
  await q('UPDATE venues SET created_by = NULL WHERE created_by = $1', [userId]);
  await q('DELETE FROM users WHERE id = $1', [userId]);
}

// --------------------------------------------------------------------- bands

export async function upsertBand(user, input) {
  const name = cleanText(input.name, { min: 2, max: 60, field: 'Band name' });
  const genre = cleanText(input.genre, { max: 60, field: 'Genre' });
  const hometown = cleanText(input.hometown, { max: 80, field: 'Hometown' });
  const bio = cleanText(input.bio, { max: 500, field: 'Bio', multiline: true });
  const clash = await one('SELECT id, owner_id FROM bands WHERE lower(name) = lower($1)', [name]);
  if (clash && clash.owner_id !== user.id) throw new HttpError(409, 'That band name is already taken.');
  if (user.band) {
    return one(
      `UPDATE bands SET name=$2, genre=$3, hometown=$4, bio=$5 WHERE id=$1 RETURNING *`,
      [user.band.id, name, genre, hometown, bio],
    );
  }
  const band = await one(
    `INSERT INTO bands (owner_id, name, genre, hometown, bio) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (owner_id) DO NOTHING RETURNING *`,
    [user.id, name, genre, hometown, bio],
  );
  if (!band) throw new HttpError(409, 'You already have a band profile.');
  await q(`INSERT INTO ledger (band_id, kind, amount_cents, memo) VALUES ($1,'STARTER_CREDIT',$2,$3)`, [
    band.id,
    STARTER_CREDIT_CENTS,
    'Welcome to Get ’Em Gigs — beta gig credits',
  ]);
  return band;
}

export async function walletBalance(bandId) {
  const row = await one('SELECT COALESCE(sum(amount_cents),0)::int AS cents FROM ledger WHERE band_id = $1', [bandId]);
  return row.cents;
}

export async function ledgerFor(bandId, limit = 20) {
  return q('SELECT * FROM ledger WHERE band_id = $1 ORDER BY created_at DESC LIMIT $2', [bandId, limit]);
}

// -------------------------------------------------------------------- venues

export async function listVenues() {
  return q('SELECT * FROM venues ORDER BY city, name');
}

export async function createVenue(user, input) {
  const name = cleanText(input.name, { min: 2, max: 80, field: 'Venue name' });
  const address = cleanText(input.address, { max: 120, field: 'Address' });
  const city = cleanText(input.city, { min: 2, max: 60, field: 'City' });
  const lat = Number(input.lat);
  const lon = Number(input.lon);
  if (!isValidCoord(lat, lon)) throw new HttpError(400, 'Venue location is required (use "Use my location" or enter lat/lon).');
  const capacity = input.capacity ? Math.max(1, Math.min(100000, Math.round(Number(input.capacity)) || 0)) : null;
  const recent = await one(
    `SELECT count(*)::int AS n FROM venues WHERE created_by = $1 AND created_at > now() - interval '1 day'`,
    [user.id],
  );
  if (recent.n >= 5) throw new HttpError(429, 'You can add up to 5 venues per day.');
  return one(
    `INSERT INTO venues (name, address, city, lat, lon, capacity, stay_to_play, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [name, address, city, lat, lon, capacity, Boolean(input.stayToPlay), user.id],
  );
}

// ---------------------------------------------------------------------- gigs

const GIG_SELECT = `
  SELECT g.*, b.name AS band_name, b.genre AS band_genre, b.hometown AS band_hometown, b.reputation AS band_reputation,
         v.name AS venue_name, v.city AS venue_city, v.address AS venue_address, v.lat AS venue_lat, v.lon AS venue_lon,
         v.stay_to_play AS venue_stay_to_play,
         (SELECT count(*)::int FROM agreements a WHERE (a.proposer_gig_id = g.id OR a.target_gig_id = g.id) AND a.status = 'ACTIVE') AS buddy_count
    FROM gigs g
    JOIN bands b ON b.id = g.band_id
    JOIN venues v ON v.id = g.venue_id`;

export async function createGig(user, input) {
  const band = user.band;
  const title = cleanText(input.title, { min: 3, max: 100, field: 'Gig title' });
  const venueId = assertUuid(input.venueId, 'venue');
  const venue = await one('SELECT id FROM venues WHERE id = $1', [venueId]);
  if (!venue) throw new HttpError(400, 'Pick a venue.');
  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) throw new HttpError(400, 'Enter a valid date and time.');
  const now = Date.now();
  if (startsAt.getTime() < now - 2 * 3600 * 1000) throw new HttpError(400, 'Gig start time cannot be in the past.');
  if (startsAt.getTime() > now + 366 * 24 * 3600 * 1000) throw new HttpError(400, 'Gigs can be listed up to a year out.');
  const ticketPriceCents = toCents(input.ticketPrice ?? 0, { min: 0, max: 50000, field: 'Ticket price' });
  const depositCents = toCents(input.deposit ?? 25, { min: MIN_DEPOSIT_CENTS, max: MAX_DEPOSIT_CENTS, field: 'Deposit' });
  const count = await one(
    `SELECT count(*)::int AS n FROM gigs WHERE band_id = $1 AND created_at > now() - interval '1 day'`,
    [band.id],
  );
  if (count.n >= 10) throw new HttpError(429, 'You can list up to 10 gigs per day.');
  const gig = await one(
    `INSERT INTO gigs (band_id, venue_id, title, starts_at, ticket_price_cents, deposit_cents)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [band.id, venueId, title, startsAt.toISOString(), ticketPriceCents, depositCents],
  );
  return getGig(gig.id);
}

export async function getGig(id) {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return one(`${GIG_SELECT} WHERE g.id = $1`, [id]);
}

export async function listGigs({ city = '', lookingOnly = false, limit = 50, bandId = null } = {}) {
  const params = [];
  const where = [`g.starts_at > now() - interval '5 hours'`, `g.status = 'OPEN'`];
  if (city) {
    params.push(`%${String(city).slice(0, 60)}%`);
    where.push(`v.city ILIKE $${params.length}`);
  }
  if (bandId) {
    params.push(bandId);
    where.push(`g.band_id = $${params.length}`);
  }
  params.push(Math.min(200, limit));
  const rows = await q(`${GIG_SELECT} WHERE ${where.join(' AND ')} ORDER BY g.starts_at ASC LIMIT $${params.length}`, params);
  return lookingOnly ? rows.filter((g) => g.buddy_count === 0) : rows;
}

export async function cancelGig(user, gigId) {
  assertUuid(gigId, 'gig');
  const gig = await one('SELECT * FROM gigs WHERE id = $1', [gigId]);
  if (!gig || gig.band_id !== user.band.id) throw new HttpError(404, 'Gig not found.');
  const active = await one(
    `SELECT count(*)::int AS n FROM agreements WHERE (proposer_gig_id=$1 OR target_gig_id=$1) AND status='ACTIVE'`,
    [gigId],
  );
  if (active.n > 0) throw new HttpError(409, 'This gig has an active Buddy Gig agreement and cannot be cancelled.');
  await q(`UPDATE agreements SET status='CANCELLED' WHERE (proposer_gig_id=$1 OR target_gig_id=$1) AND status='PROPOSED'`, [gigId]);
  await q(`UPDATE gigs SET status='CANCELLED' WHERE id=$1`, [gigId]);
}

// ---------------------------------------------------------------- agreements

const AGREEMENT_SELECT = `
  SELECT a.*,
         pb.name AS proposer_band_name, tb.name AS target_band_name,
         pg.title AS proposer_gig_title, pg.starts_at AS proposer_gig_starts_at,
         tg.title AS target_gig_title, tg.starts_at AS target_gig_starts_at,
         pv.name AS proposer_venue_name, pv.city AS proposer_venue_city, pv.lat AS proposer_venue_lat, pv.lon AS proposer_venue_lon,
         tv.name AS target_venue_name, tv.city AS target_venue_city, tv.lat AS target_venue_lat, tv.lon AS target_venue_lon
    FROM agreements a
    JOIN bands pb ON pb.id = a.proposer_band_id
    JOIN bands tb ON tb.id = a.target_band_id
    JOIN gigs pg ON pg.id = a.proposer_gig_id
    JOIN gigs tg ON tg.id = a.target_gig_id
    JOIN venues pv ON pv.id = pg.venue_id
    JOIN venues tv ON tv.id = tg.venue_id`;

export async function proposeAgreement(user, input) {
  const band = user.band;
  const myGigId = assertUuid(input.myGigId, 'your gig');
  const targetGigId = assertUuid(input.targetGigId, 'target gig');
  const message = cleanText(input.message, { max: 280, field: 'Message', multiline: true });
  const [mine, theirs] = await Promise.all([getGig(myGigId), getGig(targetGigId)]);
  if (!mine || mine.band_id !== band.id) throw new HttpError(400, 'Pick one of your own upcoming gigs.');
  if (!theirs || theirs.status !== 'OPEN') throw new HttpError(404, 'That gig is not available.');
  if (theirs.band_id === band.id) throw new HttpError(400, 'You cannot buddy with your own gig.');
  if (mine.status !== 'OPEN') throw new HttpError(400, 'Your gig is not open.');
  for (const g of [mine, theirs]) {
    if (checkInWindow(g.starts_at).closesAt < new Date()) throw new HttpError(400, 'Both gigs must be upcoming.');
  }
  const deposit = Math.max(mine.deposit_cents, theirs.deposit_cents);
  const balance = await walletBalance(band.id);
  if (balance < deposit) throw new HttpError(402, `You need $${(deposit / 100).toFixed(2)} in gig credits to offer this deal.`);
  const daily = await one(
    `SELECT count(*)::int AS n FROM agreements WHERE proposer_band_id = $1 AND created_at > now() - interval '1 day'`,
    [band.id],
  );
  if (daily.n >= 20) throw new HttpError(429, 'You can send up to 20 Buddy Gig offers per day.');
  const dup = await one(
    `SELECT id FROM agreements WHERE status IN ('PROPOSED','ACTIVE') AND
       ((proposer_gig_id=$1 AND target_gig_id=$2) OR (proposer_gig_id=$2 AND target_gig_id=$1))`,
    [myGigId, targetGigId],
  );
  if (dup) throw new HttpError(409, 'There is already an open Buddy Gig deal between these gigs.');
  const row = await one(
    `INSERT INTO agreements (proposer_gig_id, target_gig_id, proposer_band_id, target_band_id, deposit_cents, message)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [myGigId, targetGigId, band.id, theirs.band_id, deposit, message],
  );
  return getAgreement(row.id);
}

export async function getAgreement(id) {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const a = await one(`${AGREEMENT_SELECT} WHERE a.id = $1`, [id]);
  if (!a) return null;
  a.attendance = await q('SELECT * FROM attendance WHERE agreement_id = $1', [id]);
  return a;
}

export async function agreementsForBand(bandId) {
  return q(`${AGREEMENT_SELECT} WHERE a.proposer_band_id = $1 OR a.target_band_id = $1 ORDER BY a.created_at DESC LIMIT 50`, [
    bandId,
  ]);
}

export async function respondAgreement(user, id, action) {
  assertUuid(id, 'agreement');
  const band = user.band;
  const a = await getAgreement(id);
  if (!a || (a.proposer_band_id !== band.id && a.target_band_id !== band.id)) throw new HttpError(404, 'Agreement not found.');

  if (action === 'decline' || action === 'cancel') {
    if (action === 'decline' && a.target_band_id !== band.id) throw new HttpError(403, 'Only the invited band can decline.');
    if (action === 'cancel' && a.proposer_band_id !== band.id) throw new HttpError(403, 'Only the proposing band can cancel.');
    const upd = await one(
      `UPDATE agreements SET status=$2 WHERE id=$1 AND status='PROPOSED' RETURNING id`,
      [id, action === 'decline' ? 'DECLINED' : 'CANCELLED'],
    );
    if (!upd) throw new HttpError(409, 'This offer is no longer pending.');
    return getAgreement(id);
  }

  if (action !== 'accept') throw new HttpError(400, 'Unknown action.');
  if (a.target_band_id !== band.id) throw new HttpError(403, 'Only the invited band can accept.');
  if (a.status !== 'PROPOSED') throw new HttpError(409, 'This offer is no longer pending.');
  const [pBal, tBal] = await Promise.all([walletBalance(a.proposer_band_id), walletBalance(a.target_band_id)]);
  if (tBal < a.deposit_cents) throw new HttpError(402, 'You do not have enough gig credits to lock this deposit.');
  if (pBal < a.deposit_cents) throw new HttpError(402, `${a.proposer_band_name} no longer has enough credits for this deposit.`);
  // Conditional update acts as the lock: only one accept can win.
  const won = await one(
    `UPDATE agreements SET status='ACTIVE', accepted_at=now() WHERE id=$1 AND status='PROPOSED' RETURNING id`,
    [id],
  );
  if (!won) throw new HttpError(409, 'This offer is no longer pending.');
  const memo = `Deposit held: ${a.proposer_band_name} ⇄ ${a.target_band_name}`;
  await q(
    `INSERT INTO ledger (band_id, agreement_id, kind, amount_cents, memo) VALUES
       ($1,$3,'DEPOSIT_HOLD',$4,$5), ($2,$3,'DEPOSIT_HOLD',$4,$5)`,
    [a.proposer_band_id, a.target_band_id, id, -a.deposit_cents, memo],
  );
  // Proposer attends target's gig; target attends proposer's gig.
  await q(
    `INSERT INTO attendance (agreement_id, attendee_band_id, host_band_id, host_gig_id) VALUES
       ($1,$2,$3,$4), ($1,$3,$2,$5) ON CONFLICT DO NOTHING`,
    [id, a.proposer_band_id, a.target_band_id, a.target_gig_id, a.proposer_gig_id],
  );
  return getAgreement(id);
}

export async function checkIn(user, agreementId, { lat, lon, accuracy }, now = new Date()) {
  assertUuid(agreementId, 'agreement');
  const band = user.band;
  const a = await getAgreement(agreementId);
  if (!a || a.status !== 'ACTIVE') throw new HttpError(404, 'No active Buddy Gig deal found.');
  const att = a.attendance.find((r) => r.attendee_band_id === band.id);
  if (!att) throw new HttpError(403, 'Your band is not an attendee on this deal.');
  if (att.status !== 'PENDING') throw new HttpError(409, `Attendance already ${att.status.toLowerCase()}.`);
  const gig = await getGig(att.host_gig_id);
  const result = verifyCheckIn({
    lat: Number(lat),
    lon: Number(lon),
    accuracy: accuracy == null ? undefined : Number(accuracy),
    venueLat: gig.venue_lat,
    venueLon: gig.venue_lon,
    startsAt: gig.starts_at,
    now,
  });
  if (!result.ok) {
    return { ok: false, verified: false, distanceM: result.distanceM, reason: result.reason };
  }
  const upd = await one(
    `UPDATE attendance SET status='VERIFIED', verified_at=now(), distance_m=$2 WHERE id=$1 AND status='PENDING' RETURNING id`,
    [att.id, result.distanceM],
  );
  if (!upd) throw new HttpError(409, 'Attendance already recorded.');
  await q(
    `INSERT INTO ledger (band_id, agreement_id, kind, amount_cents, memo) VALUES ($1,$2,'DEPOSIT_REFUND',$3,$4)`,
    [band.id, agreementId, a.deposit_cents, `Deposit refunded — verified at ${gig.venue_name} (${result.distanceM}m)`],
  );
  await q('UPDATE bands SET reputation = LEAST(100, reputation + 1) WHERE id = $1', [band.id]);
  const remaining = await one(`SELECT count(*)::int AS n FROM attendance WHERE agreement_id=$1 AND status='PENDING'`, [agreementId]);
  if (remaining.n === 0) {
    await q(`UPDATE agreements SET status='SETTLED', settled_at=now() WHERE id=$1 AND status='ACTIVE'`, [agreementId]);
  }
  return { ok: true, verified: true, distanceM: result.distanceM, reason: result.reason, refundedCents: a.deposit_cents };
}

/**
 * Next-morning reconciliation. Any attendee that never checked in during the host gig's
 * window forfeits their deposit to the host band.
 */
export async function settleAgreements({ now = new Date(), agreementId = null } = {}) {
  const params = [];
  let where = `a.status = 'ACTIVE'`;
  if (agreementId) {
    params.push(agreementId);
    where += ` AND a.id = $1`;
  }
  const active = await q(`${AGREEMENT_SELECT} WHERE ${where}`, params);
  const results = [];
  for (const a of active) {
    const closes = [a.proposer_gig_starts_at, a.target_gig_starts_at].map((s) => checkInWindow(s).closesAt);
    if (closes.some((c) => c > now)) continue;
    const pending = await q(`SELECT * FROM attendance WHERE agreement_id=$1 AND status='PENDING'`, [a.id]);
    const payouts = [];
    for (const att of pending) {
      const upd = await one(`UPDATE attendance SET status='FORFEITED' WHERE id=$1 AND status='PENDING' RETURNING id`, [att.id]);
      if (!upd) continue;
      const bailer = att.attendee_band_id === a.proposer_band_id ? a.proposer_band_name : a.target_band_name;
      const host = att.host_band_id === a.proposer_band_id ? a.proposer_band_name : a.target_band_name;
      await q(
        `INSERT INTO ledger (band_id, agreement_id, kind, amount_cents, memo) VALUES ($1,$2,'FORFEIT_PAYOUT',$3,$4)`,
        [att.host_band_id, a.id, a.deposit_cents, `No-show payout: ${bailer} skipped your gig`],
      );
      await q('UPDATE bands SET reputation = GREATEST(0, reputation - 10) WHERE id = $1', [att.attendee_band_id]);
      payouts.push({ from: bailer, to: host, cents: a.deposit_cents });
    }
    await q(`UPDATE agreements SET status='SETTLED', settled_at=now() WHERE id=$1 AND status='ACTIVE'`, [a.id]);
    results.push({ agreementId: a.id, payouts });
  }
  return results;
}

// ---------------------------------------------------------------- stay-to-play

export async function stayCommit(user, input) {
  const band = user.band;
  const ownGigId = assertUuid(input.ownGigId, 'your gig');
  const targetGigId = assertUuid(input.targetGigId, 'gig');
  const tickets = Math.round(Number(input.tickets));
  if (!Number.isFinite(tickets) || tickets < 2 || tickets > 10) throw new HttpError(400, 'Commit to between 2 and 10 tickets.');
  const [own, target] = await Promise.all([getGig(ownGigId), getGig(targetGigId)]);
  if (!own || own.band_id !== band.id) throw new HttpError(400, 'Pick one of your own gigs.');
  if (!target || target.status !== 'OPEN') throw new HttpError(404, 'That gig is not available.');
  if (target.band_id === band.id) throw new HttpError(400, 'Stay-To-Play means supporting another band.');
  if (own.venue_id !== target.venue_id) throw new HttpError(400, 'Stay-To-Play gigs must be at the same venue.');
  if (!target.venue_stay_to_play) throw new HttpError(400, 'This venue is not a Stay-To-Play partner.');
  const row = await one(
    `INSERT INTO stay_commitments (band_id, own_gig_id, target_gig_id, tickets) VALUES ($1,$2,$3,$4)
     ON CONFLICT (own_gig_id, target_gig_id) DO UPDATE SET tickets = EXCLUDED.tickets RETURNING *`,
    [band.id, ownGigId, targetGigId, tickets],
  );
  return row;
}

export async function stayCommitmentsForBand(bandId) {
  return q(
    `SELECT c.*, tg.title AS target_title, tg.starts_at AS target_starts_at, tb.name AS target_band_name,
            v.name AS venue_name, og.title AS own_title
       FROM stay_commitments c
       JOIN gigs tg ON tg.id = c.target_gig_id
       JOIN gigs og ON og.id = c.own_gig_id
       JOIN bands tb ON tb.id = tg.band_id
       JOIN venues v ON v.id = tg.venue_id
      WHERE c.band_id = $1 ORDER BY tg.starts_at`,
    [bandId],
  );
}

export async function stayCommitmentsForGig(gigId) {
  return q(
    `SELECT c.*, b.name AS band_name FROM stay_commitments c JOIN bands b ON b.id = c.band_id WHERE c.target_gig_id = $1`,
    [gigId],
  );
}

// --------------------------------------------------------------------- stats

export async function siteStats() {
  const row = await one(`SELECT
      (SELECT count(*)::int FROM bands) AS bands,
      (SELECT count(*)::int FROM gigs WHERE status='OPEN' AND starts_at > now()) AS upcoming_gigs,
      (SELECT count(*)::int FROM agreements WHERE status IN ('ACTIVE','SETTLED')) AS deals,
      (SELECT count(*)::int FROM attendance WHERE status='VERIFIED') AS checkins,
      (SELECT count(*)::int FROM venues) AS venues`);
  return row;
}

