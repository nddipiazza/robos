import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceMeters, verifyCheckIn, CHECKIN_RADIUS_M } from '../../src/lib/geo.js';

const venue = { venueLat: 30.2697, venueLon: -97.7362 };
const startsAt = new Date('2026-10-02T01:00:00Z');
const during = new Date('2026-10-02T01:30:00Z');

test('haversine distance is ~0 for identical points and ~111km per degree latitude', () => {
  assert.equal(distanceMeters(30, -97, 30, -97), 0);
  const d = distanceMeters(30, -97, 31, -97);
  assert.ok(d > 110000 && d < 112000, `got ${d}`);
});

test('check-in inside 150m during the window is verified', () => {
  const r = verifyCheckIn({ lat: 30.2703, lon: -97.7362, accuracy: 20, ...venue, startsAt, now: during });
  assert.equal(r.ok, true);
  assert.ok(r.distanceM <= CHECKIN_RADIUS_M);
});

test('check-in 1km away is rejected with the distance', () => {
  const r = verifyCheckIn({ lat: 30.2787, lon: -97.7362, accuracy: 10, ...venue, startsAt, now: during });
  assert.equal(r.ok, false);
  assert.ok(r.distanceM > 900);
});

test('check-in before doors or after the window is rejected', () => {
  const early = verifyCheckIn({ lat: 30.2697, lon: -97.7362, ...venue, startsAt, now: new Date('2026-10-01T20:00:00Z') });
  assert.equal(early.ok, false);
  const late = verifyCheckIn({ lat: 30.2697, lon: -97.7362, ...venue, startsAt, now: new Date('2026-10-02T07:00:00Z') });
  assert.equal(late.ok, false);
});

test('low GPS accuracy is rejected', () => {
  const r = verifyCheckIn({ lat: 30.2697, lon: -97.7362, accuracy: 900, ...venue, startsAt, now: during });
  assert.equal(r.ok, false);
  assert.match(r.reason, /accuracy/);
});

test('invalid coordinates are rejected', () => {
  assert.equal(verifyCheckIn({ lat: 'x', lon: 1, ...venue, startsAt, now: during }).ok, false);
  assert.equal(verifyCheckIn({ lat: 95, lon: 1, ...venue, startsAt, now: during }).ok, false);
});
