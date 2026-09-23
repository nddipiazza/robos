// Venmo-style person-to-person check-in.
//
// When a Buddy Gig deal is accepted, every attendance row gets a random secret. At the gig the
// attendee opens their deal and shows a QR code; the HOST band scans it. The code is
//   base64url( attendanceId[16] | timeStep[4] | HMAC-SHA256(secret, attendanceId|timeStep)[0..10] )
// and rotates every 30 s, so a screenshot sent to someone who is not at the door expires quickly.
// The QR encodes https://<site>/scan/<code>, so the host can use the in-app scanner or any phone camera.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const WINDOW_OPENS_BEFORE_MS = 60 * 60 * 1000; // doors: 1h before start
export const WINDOW_CLOSES_AFTER_MS = 5 * 60 * 60 * 1000; // 5h after start
export const CODE_STEP_SEC = 30;
const PAST_STEPS = 3; // accept codes up to ~90 s old (scan + network lag)
const FUTURE_STEPS = 1; // small clock skew
const MAC_BYTES = 10;

export function checkInWindow(startsAt) {
  const start = new Date(startsAt).getTime();
  return { opensAt: new Date(start - WINDOW_OPENS_BEFORE_MS), closesAt: new Date(start + WINDOW_CLOSES_AFTER_MS) };
}

export function windowState(startsAt, now = new Date()) {
  const { opensAt, closesAt } = checkInWindow(startsAt);
  if (now < opensAt) return { open: false, reason: 'not_open', opensAt, closesAt };
  if (now > closesAt) return { open: false, reason: 'closed', opensAt, closesAt };
  return { open: true, opensAt, closesAt };
}

export function newCodeSecret() {
  return randomBytes(20).toString('base64url');
}

function uuidBytes(uuid) {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}
function bytesUuid(buf) {
  const h = buf.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
function stepAt(ms) {
  return Math.floor(ms / 1000 / CODE_STEP_SEC);
}
function mac(secret, payload) {
  return createHmac('sha256', secret).update(payload).digest().subarray(0, MAC_BYTES);
}

export function makeCode(attendanceId, secret, now = Date.now()) {
  const step = stepAt(now);
  const payload = Buffer.alloc(20);
  uuidBytes(attendanceId).copy(payload, 0);
  payload.writeUInt32BE(step, 16);
  const code = Buffer.concat([payload, mac(secret, payload)]).toString('base64url');
  const rotatesAt = new Date((step + 1) * CODE_STEP_SEC * 1000);
  return { code, step, rotatesAt };
}

/** Accepts a raw code or a scanned URL like https://www.getemgigs.com/scan/<code>. */
export function extractCode(input) {
  const s = String(input || '').trim();
  const m = s.match(/\/scan\/([A-Za-z0-9_-]{20,80})\/?(?:[?#].*)?$/);
  return m ? m[1] : s;
}

export function parseCode(input) {
  const code = extractCode(input);
  if (!/^[A-Za-z0-9_-]{36,48}$/.test(code)) return null;
  const buf = Buffer.from(code, 'base64url');
  if (buf.length !== 20 + MAC_BYTES) return null;
  return { attendanceId: bytesUuid(buf.subarray(0, 16)), step: buf.readUInt32BE(16), payload: buf.subarray(0, 20), mac: buf.subarray(20) };
}

/** @returns {'ok'|'expired'|'invalid'} */
export function verifyCode(parsed, secret, now = Date.now()) {
  if (!parsed || !secret) return 'invalid';
  const expected = mac(secret, parsed.payload);
  if (!timingSafeEqual(expected, parsed.mac)) return 'invalid';
  const cur = stepAt(now);
  if (parsed.step < cur - PAST_STEPS) return 'expired';
  if (parsed.step > cur + FUTURE_STEPS) return 'invalid';
  return 'ok';
}
