// End-to-end domain flow against a real (embedded) Postgres via PGlite.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.DATABASE_URL;
const db = await import('../../src/lib/db.js');
const svc = await import('../../src/lib/services.js');
const { userForToken, createSession } = await import('../../src/lib/auth.js');
const { rateLimit } = await import('../../src/lib/security.js');

async function makeBand(email, bandName) {
  const u = await svc.signup({ email, password: 'correct-horse-battery', displayName: bandName + ' Owner', ip: '1.1.1.1' });
  const { token } = await createSession(u.id);
  let user = await userForToken(token);
  await svc.upsertBand(user, { name: bandName, genre: 'Rock', hometown: 'Austin, TX', bio: '' });
  user = await userForToken(token);
  return { user, token };
}

let venue;
before(async () => {
  const venues = await svc.listVenues();
  venue = venues.find((v) => v.name === 'The Mohawk');
});
after(async () => {
  await db.__resetForTests();
});

test('signup rejects duplicates and login checks passwords', async () => {
  await svc.signup({ email: 'dup@example.com', password: 'correct-horse-battery', displayName: 'Dup' });
  await assert.rejects(() => svc.signup({ email: 'DUP@example.com', password: 'correct-horse-battery', displayName: 'Dup' }), /already exists/);
  await assert.rejects(() => svc.login({ email: 'dup@example.com', password: 'wrong-password-123' }), /Incorrect/);
  const u = await svc.login({ email: 'dup@example.com', password: 'correct-horse-battery' });
  assert.ok(u.id);
});

test('full Buddy Gig lifecycle: propose, accept, verified check-in, no-show forfeit', async () => {
  const a = await makeBand('a@example.com', 'The Neon Vipers');
  const b = await makeBand('b@example.com', 'Velvet Riot');
  assert.equal(await svc.walletBalance(a.user.band.id), svc.STARTER_CREDIT_CENTS);

  const soon = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const later = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
  const gigA = await svc.createGig(a.user, { title: 'Vipers Tonight', venueId: venue.id, startsAt: later, ticketPrice: 10, deposit: 25 });
  const gigB = await svc.createGig(b.user, { title: 'Riot Tonight', venueId: venue.id, startsAt: soon, ticketPrice: 12, deposit: 40 });

  await assert.rejects(() => svc.proposeAgreement(a.user, { myGigId: gigA.id, targetGigId: gigA.id }), /own gig|own upcoming/);
  const deal = await svc.proposeAgreement(a.user, { myGigId: gigA.id, targetGigId: gigB.id, message: 'deal?' });
  assert.equal(deal.status, 'PROPOSED');
  assert.equal(deal.deposit_cents, 4000, 'uses the higher of the two deposits');
  await assert.rejects(() => svc.proposeAgreement(a.user, { myGigId: gigA.id, targetGigId: gigB.id }), /already/);
  await assert.rejects(() => svc.respondAgreement(a.user, deal.id, 'accept'), /Only the invited band/);

  const active = await svc.respondAgreement(b.user, deal.id, 'accept');
  assert.equal(active.status, 'ACTIVE');
  assert.equal(active.attendance.length, 2);
  assert.equal(await svc.walletBalance(a.user.band.id), 10000 - 4000);
  assert.equal(await svc.walletBalance(b.user.band.id), 10000 - 4000);

  // A attends B's gig (starting in 10 minutes). A shows a code; only the HOST (B) may scan it.
  const { attendeeCode, scanCode } = svc;
  const shown = await attendeeCode(a.user, deal.id);
  assert.equal(shown.hostBandName, 'Velvet Riot');
  await assert.rejects(() => scanCode(a.user, shown.code), /Only Velvet Riot/);
  await assert.rejects(() => scanCode(b.user, 'garbage-code'), /not a Get/);
  await assert.rejects(() => scanCode(b.user, shown.code, new Date(Date.now() + 5 * 60 * 1000)), /expired/);
  const scanned = await scanCode(b.user, `http://localhost:3000/scan/${shown.code}`);
  assert.equal(scanned.ok, true);
  assert.equal(scanned.attendeeBandName, 'The Neon Vipers');
  assert.equal(await svc.walletBalance(a.user.band.id), 10000);
  assert.equal((await scanCode(b.user, shown.code)).already, true);
  // B's code for A's gig is locked until doors (A's gig is 3 days out).
  await assert.rejects(() => attendeeCode(b.user, deal.id), /unlocks at doors/);

  // Settlement before both windows close does nothing.
  assert.equal((await svc.settleAgreements({ agreementId: deal.id })).length, 0);
  // B never shows at A's gig -> forfeits to A the next morning.
  const nextMorning = new Date(new Date(later).getTime() + 11 * 3600 * 1000);
  const res = await svc.settleAgreements({ now: nextMorning, agreementId: deal.id });
  assert.equal(res.length, 1);
  assert.equal(res[0].payouts[0].to, 'The Neon Vipers');
  assert.equal(await svc.walletBalance(a.user.band.id), 10000 + 4000);
  assert.equal(await svc.walletBalance(b.user.band.id), 10000 - 4000);
  const settled = await svc.getAgreement(deal.id);
  assert.equal(settled.status, 'SETTLED');
  const bRow = await db.one('SELECT reputation FROM bands WHERE id=$1', [b.user.band.id]);
  assert.equal(bRow.reputation, 90);
});

test('stay-to-play requires same partner venue and another band', async () => {
  const c = await makeBand('c@example.com', 'Midnight Echoes');
  const d = await makeBand('d@example.com', 'Rusty Anchor');
  const when = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();
  const other = (await svc.listVenues()).find((v) => v.name === 'Sunset Tavern');
  const gc = await svc.createGig(c.user, { title: 'Echoes', venueId: venue.id, startsAt: when, deposit: 20 });
  const gd = await svc.createGig(d.user, { title: 'Anchor', venueId: venue.id, startsAt: when, deposit: 20 });
  const gd2 = await svc.createGig(d.user, { title: 'Anchor West', venueId: other.id, startsAt: when, deposit: 20 });
  const commit = await svc.stayCommit(c.user, { ownGigId: gc.id, targetGigId: gd.id, tickets: 4 });
  assert.equal(commit.tickets, 4);
  await assert.rejects(() => svc.stayCommit(c.user, { ownGigId: gc.id, targetGigId: gd2.id, tickets: 4 }), /same venue/);
  await assert.rejects(() => svc.stayCommit(c.user, { ownGigId: gc.id, targetGigId: gc.id, tickets: 4 }), /another band/);
});

test('rate limits block after the limit within the window', async () => {
  const req = { headers: new Headers() };
  for (let i = 0; i < 3; i++) await rateLimit('t:rl', 3, 60, req);
  await assert.rejects(() => rateLimit('t:rl', 3, 60, req), /Too many/);
});

test('deleting an account cascades its band and gigs', async () => {
  const e = await makeBand('e@example.com', 'Delete Me');
  await svc.createGig(e.user, { title: 'Bye', venueId: venue.id, startsAt: new Date(Date.now() + 86400000).toISOString() });
  await svc.deleteAccount(e.user.id);
  const left = await db.one(`SELECT count(*)::int AS n FROM bands WHERE name='Delete Me'`);
  assert.equal(left.n, 0);
  assert.equal(await userForToken(e.token), null);
});

test('host who never scans a shown code gets no payout; attendee is refunded (dispute)', async () => {
  const h = await makeBand('host@example.com', 'Host Band');
  const g = await makeBand('guest@example.com', 'Guest Band');
  const soon = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const later = new Date(Date.now() + 2 * 86400000).toISOString();
  const hostGig = await svc.createGig(h.user, { title: 'Host Show', venueId: venue.id, startsAt: soon, deposit: 20 });
  const guestGig = await svc.createGig(g.user, { title: 'Guest Show', venueId: venue.id, startsAt: later, deposit: 20 });
  const deal = await svc.proposeAgreement(g.user, { myGigId: guestGig.id, targetGigId: hostGig.id });
  await svc.respondAgreement(h.user, deal.id, 'accept');
  await svc.attendeeCode(g.user, deal.id); // guest shows up and opens code, host never scans
  const res = await svc.settleAgreements({ now: new Date(new Date(later).getTime() + 6 * 3600e3), agreementId: deal.id });
  const disputed = res[0].payouts.find((p) => p.disputed);
  assert.ok(disputed, 'guest attendance is disputed, not forfeited');
  assert.equal(await svc.walletBalance(g.user.band.id), 10000 + 2000, 'guest got own deposit back + host no-show payout');
  // Host never attended the guest's show and never opened a code -> forfeits to guest.
  assert.equal(await svc.walletBalance(h.user.band.id), 10000 - 2000);
});
