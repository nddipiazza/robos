// Basic abuse controls: IP extraction, same-origin checks, fixed-window rate limits,
// honeypot / form-timing checks, and input validation helpers.

import { q } from './db.js';

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function clientIp(request) {
  const h = request.headers;
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim().slice(0, 64);
  return (h.get('x-real-ip') || '0.0.0.0').slice(0, 64);
}

/** Reject cross-site form posts (CSRF defense in depth on top of SameSite=Lax cookies). */
export function assertSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return; // non-browser clients (curl, tests) — still need a session cookie
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  try {
    if (new URL(origin).host !== host) throw new Error('mismatch');
  } catch {
    throw new HttpError(403, 'Cross-site request blocked.');
  }
}

function bypassesLimits(request) {
  const key = process.env.E2E_BYPASS_KEY;
  return Boolean(key && key.length >= 24 && request?.headers.get('x-e2e-key') === key);
}

/**
 * Fixed-window rate limit backed by Postgres so it holds across serverless instances.
 * @param {string} key unique bucket key, e.g. `signup:ip:1.2.3.4`
 * @param {number} limit max hits per window
 * @param {number} windowSec window length in seconds
 */
export async function rateLimit(key, limit, windowSec, request) {
  if (bypassesLimits(request)) return;
  const rows = await q(
    `INSERT INTO rate_limits (key, window_start, count) VALUES ($1, now(), 1)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2::double precision) THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2::double precision) THEN now() ELSE rate_limits.window_start END
     RETURNING count, window_start`,
    [key, windowSec],
  );
  const { count, window_start } = rows[0];
  if (count > limit) {
    const retry = Math.max(1, Math.ceil((new Date(window_start).getTime() + windowSec * 1000 - Date.now()) / 1000));
    throw new HttpError(429, 'Too many requests. Please slow down and try again later.', { retryAfter: retry });
  }
}

/** Honeypot + minimum fill time. Bots fill hidden fields and submit instantly. */
export function assertHuman(body, request) {
  if (bypassesLimits(request)) return;
  if (body.website) throw new HttpError(400, 'Submission rejected.');
  const started = Number(body.formStartedAt);
  if (!started || Date.now() - started < 1500) {
    throw new HttpError(400, 'Submission rejected. Please take a moment and try again.');
  }
}

export async function audit(action, { userId = null, ip = null, detail = '' } = {}) {
  try {
    await q('INSERT INTO audit_log (user_id, ip, action, detail) VALUES ($1,$2,$3,$4)', [
      userId,
      ip,
      action,
      String(detail).slice(0, 500),
    ]);
  } catch {
    // auditing must never break the request
  }
}

// ---------------------------------------------------------------- validation

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function cleanText(value, { max = 200, min = 0, field = 'Field', multiline = false } = {}) {
  let s = typeof value === 'string' ? value : value == null ? '' : String(value);
  s = s.replace(CONTROL, '');
  if (!multiline) s = s.replace(/\s+/g, ' ');
  s = s.trim();
  if (s.length < min) throw new HttpError(400, `${field} is required${min > 1 ? ` (at least ${min} characters)` : ''}.`);
  if (s.length > max) throw new HttpError(400, `${field} must be at most ${max} characters.`);
  return s;
}

const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'yopmail.com',
  'trashmail.com', 'sharklasers.com', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'throwawaymail.com',
  'fakeinbox.com', 'mintemail.com', 'mohmal.com', 'emailondeck.com',
]);

export function normalizeEmail(value) {
  const email = cleanText(value, { max: 254, min: 3, field: 'Email' }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  const domain = email.split('@')[1];
  if (DISPOSABLE.has(domain)) throw new HttpError(400, 'Disposable email addresses are not allowed.');
  return email;
}

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '123456789', '1234567890', 'qwertyuiop', 'iloveyou', 'letmein123',
  'welcome123', 'admin12345', 'passw0rd123', '11111111111', 'abc1234567', 'getemgigs', 'getemgigs1',
]);

export function validatePassword(pw, email = '') {
  if (typeof pw !== 'string' || pw.length < 10) throw new HttpError(400, 'Password must be at least 10 characters.');
  if (pw.length > 200) throw new HttpError(400, 'Password is too long.');
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) throw new HttpError(400, 'That password is too common.');
  if (email && pw.toLowerCase().includes(email.split('@')[0].toLowerCase()) && email.split('@')[0].length >= 4) {
    throw new HttpError(400, 'Password must not contain your email name.');
  }
  return pw;
}

export function toCents(value, { min = 0, max = 100000, field = 'Amount' } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new HttpError(400, `${field} must be a number.`);
  const cents = Math.round(n * 100);
  if (cents < min || cents > max) {
    throw new HttpError(400, `${field} must be between $${(min / 100).toFixed(0)} and $${(max / 100).toFixed(0)}.`);
  }
  return cents;
}

export function isUuid(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export function assertUuid(v, field = 'id') {
  if (!isUuid(v)) throw new HttpError(400, `Invalid ${field}.`);
  return v;
}
