// Email + password auth with opaque, server-side sessions.
// The cookie holds a random token; the DB stores only its SHA-256 hash.

import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { q, one } from './db.js';

export const SESSION_COOKIE = '__APP_SLUG___session';
const SESSION_DAYS = 30;
const BCRYPT_COST = 11;
// Used so that unknown-email logins take as long as wrong-password logins.
let dummyHash = null;

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export async function hashPassword(pw) {
  return bcrypt.hash(pw, BCRYPT_COST);
}

export async function checkPassword(pw, hash) {
  if (!hash) {
    dummyHash ||= await bcrypt.hash('not-a-real-password', BCRYPT_COST);
    await bcrypt.compare(pw, dummyHash);
    return false;
  }
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId, { ip = null, userAgent = null } = {}) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await q(
    'INSERT INTO sessions (id, user_id, ip, user_agent, expires_at) VALUES ($1,$2,$3,$4,$5)',
    [hashToken(token), userId, ip, (userAgent || '').slice(0, 300), expires.toISOString()],
  );
  return { token, expires };
}

export async function destroySession(token) {
  if (!token) return;
  await q('DELETE FROM sessions WHERE id = $1', [hashToken(token)]);
}

export async function userForToken(token) {
  if (!token || typeof token !== 'string' || token.length > 100) return null;
  const row = await one(
    `SELECT u.id, u.email, u.display_name, u.created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.expires_at > now() AND u.is_disabled = false`,
    [hashToken(token)],
  );
  if (!row) return null;
  return { id: row.id, email: row.email, displayName: row.display_name, createdAt: row.created_at };
}

export function sessionCookieOptions(expires) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires,
  };
}
