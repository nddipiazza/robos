'use strict';

/**
 * fetch() for the Google Drive v3 REST API, with the retries Drive needs.
 *
 * RobOS signs in with rclone's public OAuth client by default, and that client's
 * project-wide Drive quota is used up most minutes. Drive then answers 403 with reason
 * rateLimitExceeded (domain usageLimits, status PERMISSION_DENIED), which looks like a
 * permission error but is not one. This helper retries those, per-user throttling
 * (userRateLimitExceeded), 429 and 5xx with exponential backoff, honours Retry-After, and
 * classifies the final failure so callers can say "rate limited" instead of "no access".
 *
 *   const { driveFetch, readDriveError } = require('./google-drive-fetch');
 *   const res = await driveFetch(url, { headers }, { timeoutMs: 12000 });
 *   if (!res.ok) { const err = await readDriveError(res); err.kind === 'rate_limited' ... }
 *
 * Env:
 *   ROBOS_GDRIVE_API_BASE      replaces https://www.googleapis.com (tests point it at the mock)
 *   ROBOS_GDRIVE_MAX_RETRIES   retries after the first attempt (default 6)
 *   ROBOS_GDRIVE_RETRY_BASE_MS first backoff step (default 500, doubles each attempt)
 */

const GOOGLE_API_ORIGIN = 'https://www.googleapis.com';
const RATE_LIMIT_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'RATE_LIMIT_EXCEEDED']);
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRY_AFTER_MS = 60000;

function driveApiBase() {
  return (process.env.ROBOS_GDRIVE_API_BASE || GOOGLE_API_ORIGIN).replace(/\/+$/, '');
}

/** Absolute Drive URL: relative paths get the API base, and the real origin is swapped for ROBOS_GDRIVE_API_BASE. */
function resolveDriveUrl(url) {
  const s = String(url);
  if (!/^https?:\/\//i.test(s)) return driveApiBase() + (s.startsWith('/') ? s : `/${s}`);
  if (process.env.ROBOS_GDRIVE_API_BASE && s.startsWith(GOOGLE_API_ORIGIN + '/')) return driveApiBase() + s.slice(GOOGLE_API_ORIGIN.length);
  return s;
}

/** Retry-After in ms (delta-seconds or an HTTP date), or null when absent. */
function parseRetryAfter(value, now = Date.now()) {
  if (value == null || value === '') return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds >= 0 ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS) : null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.min(Math.max(at - now, 0), MAX_RETRY_AFTER_MS) : null;
}

function retryDelayMs(attempt, retryAfter, baseMs = Number(process.env.ROBOS_GDRIVE_RETRY_BASE_MS || 500)) {
  const hinted = parseRetryAfter(retryAfter);
  if (hinted != null) return hinted;
  return Math.min(baseMs * 2 ** attempt, 32000) + Math.floor(Math.random() * baseMs);
}

/**
 * Classifies a Drive error from its status and body (a parsed object or JSON text).
 *   kind: rate_limited | auth | scope | storage_full | no_access | not_found | server | error
 */
function classifyDriveError(status, body) {
  let parsed = body;
  if (typeof body === 'string') { try { parsed = JSON.parse(body); } catch { parsed = null; } }
  const err = (parsed && typeof parsed === 'object' && (parsed.error && typeof parsed.error === 'object' ? parsed.error : parsed)) || {};
  const reason = err.errors?.[0]?.reason || err.details?.find?.(d => d && d.reason)?.reason || '';
  const message = err.message || (typeof body === 'string' && !parsed ? body.slice(0, 240) : '');
  const rateLimited = status === 429 || (status === 403 && (RATE_LIMIT_REASONS.has(reason) || (!reason && /rate ?limit|quota exceeded|queries per minute/i.test(message))));
  let kind = 'error';
  if (rateLimited) kind = 'rate_limited';
  else if (status === 401) kind = 'auth';
  else if (status === 403 && /insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT/.test(reason)) kind = 'scope';
  else if (status === 403 && reason === 'storageQuotaExceeded') kind = 'storage_full';
  else if (status === 403) kind = 'no_access';
  else if (status === 404) kind = 'not_found';
  else if (status >= 500) kind = 'server';
  return { status, reason, message, kind, rateLimited };
}

const KIND_MESSAGES = {
  rate_limited: 'Google Drive is rate-limiting requests right now. Try again in a minute.',
  auth: 'The Google sign-in expired. Sign in with Google again in Preferences → Cloud Suite Accounts.',
  scope: 'This Google sign-in does not include Drive access. Sign in with Google again in Preferences → Cloud Suite Accounts.',
  storage_full: "This Google account's Drive storage is full.",
  no_access: 'This Google account does not have access to that Drive item.',
  not_found: 'Google Drive could not find that item, or this account cannot see it.',
  server: 'Google Drive had a temporary server error. Try again in a minute.',
};

/** One-line, user-facing text for a classified error. */
function describeDriveError(info) {
  const lead = KIND_MESSAGES[info.kind] || `Google Drive request failed (HTTP ${info.status}).`;
  return info.message ? `${lead} ${info.message}` : lead;
}

class DriveError extends Error {
  constructor(message, status, reason = '', kind = '') {
    super(message);
    this.status = status;
    this.reason = reason;
    this.kind = kind || classifyDriveError(status, { error: { errors: [{ reason }] } }).kind;
    this.rateLimited = this.kind === 'rate_limited';
  }
}

/** Reads a failed Response's body and returns a classified error (with a user-facing message). */
async function readDriveError(res) {
  const text = await res.text().catch(() => '');
  const info = classifyDriveError(res.status, text);
  return { ...info, text, userMessage: describeDriveError(info) };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * fetch() with Drive retries. Returns the final Response: successes untouched (streams
 * intact), failures with their body still readable. 401 is never retried here; the caller
 * refreshes its token.
 *
 * opts: fetchImpl, maxRetries, retryBaseMs, timeoutMs (a fresh timeout per attempt; used
 * only when init has no signal), onRetry({ attempt, status, reason, delayMs }).
 */
async function driveFetch(url, init = {}, opts = {}) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const maxRetries = opts.maxRetries ?? Number(process.env.ROBOS_GDRIVE_MAX_RETRIES || 6);
  const target = resolveDriveUrl(url);
  for (let attempt = 0; ; attempt++) {
    const signal = init.signal || (opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined);
    const res = await fetchImpl(target, signal ? { ...init, signal } : init);
    if (res.ok || (res.status !== 403 && !RETRY_STATUSES.has(res.status))) return res;

    // 403 needs its body to tell rate limiting from a real denial, so buffer it and hand
    // back an equivalent Response the caller can still read.
    const text = await res.text().catch(() => '');
    const info = classifyDriveError(res.status, text);
    const retryable = info.rateLimited || RETRY_STATUSES.has(res.status);
    if (!retryable || attempt >= maxRetries) {
      const out = new Response(text, { status: res.status, statusText: res.statusText, headers: res.headers });
      out.driveError = { ...info, attempts: attempt + 1 };
      return out;
    }
    const delayMs = retryDelayMs(attempt, res.headers?.get?.('retry-after'), opts.retryBaseMs);
    if (opts.onRetry) opts.onRetry({ attempt: attempt + 1, status: res.status, reason: info.reason, delayMs });
    await sleep(delayMs);
  }
}

/**
 * driveFetch, then JSON. Throws DriveError (status, reason, kind, rateLimited) with a
 * user-facing message on failure; returns null for 204.
 */
async function driveFetchJson(url, init = {}, opts = {}) {
  const res = await driveFetch(url, init, opts);
  if (!res.ok) {
    const err = await readDriveError(res);
    throw new DriveError(err.userMessage, err.status, err.reason, err.kind);
  }
  if (res.status === 204) return null;
  return res.json();
}

module.exports = {
  GOOGLE_API_ORIGIN, RATE_LIMIT_REASONS, RETRY_STATUSES,
  driveApiBase, resolveDriveUrl, parseRetryAfter, retryDelayMs,
  classifyDriveError, describeDriveError, readDriveError, DriveError,
  driveFetch, driveFetchJson,
};
