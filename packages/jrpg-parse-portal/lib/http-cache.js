'use strict';

// Polite fetcher for fan sites: one honest User-Agent, a minimum gap between
// requests to the same host, retries on 429/5xx, and an on-disk cache so a
// re-run never hits a site twice for the same URL.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const USER_AGENT = 'RobOS-JRPG-Parse-Portal/1.0 (+https://github.com/nddipiazza/robos; fan-remake research)';

class HttpCache {
  constructor({ cacheDir, minIntervalMs = 400, retries = 3, fetchImpl, log } = {}) {
    this.cacheDir = cacheDir || null;
    this.minIntervalMs = minIntervalMs;
    this.retries = retries;
    this.fetch = fetchImpl || globalThis.fetch;
    this.log = log || (() => {});
    this.lastHit = new Map();
    this.stats = { network: 0, cached: 0, failed: 0 };
    if (this.cacheDir) fs.mkdirSync(this.cacheDir, { recursive: true });
  }

  keyFor(url) {
    return crypto.createHash('sha256').update(url).digest('hex').slice(0, 32);
  }

  cachePath(url, ext) {
    return this.cacheDir ? path.join(this.cacheDir, this.keyFor(url) + ext) : null;
  }

  async throttle(url) {
    const host = new URL(url).host;
    const last = this.lastHit.get(host) || 0;
    const wait = last + this.minIntervalMs - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    this.lastHit.set(host, Date.now());
  }

  async request(url, { binary = false } = {}) {
    const file = this.cachePath(url, binary ? '.bin' : '.txt');
    if (file && fs.existsSync(file)) {
      this.stats.cached++;
      return { ok: true, status: 200, cached: true, body: binary ? fs.readFileSync(file) : fs.readFileSync(file, 'utf8') };
    }
    let lastError = null;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      await this.throttle(url);
      try {
        const res = await this.fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: binary ? '*/*' : 'application/json,text/html;q=0.9,*/*;q=0.5' } });
        this.stats.network++;
        if (res.status === 429 || res.status >= 500) {
          lastError = `HTTP ${res.status}`;
          await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
          continue;
        }
        if (!res.ok) {
          this.stats.failed++;
          return { ok: false, status: res.status, error: `HTTP ${res.status}` };
        }
        const body = binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
        if (file) fs.writeFileSync(file, body);
        return { ok: true, status: res.status, cached: false, body, contentType: res.headers.get('content-type') || '' };
      } catch (error) {
        lastError = error.cause?.code || error.message;
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    this.stats.failed++;
    return { ok: false, status: 0, error: lastError || 'request failed' };
  }

  async text(url) { return this.request(url); }

  async json(url) {
    const res = await this.request(url);
    if (!res.ok) return res;
    try { return { ...res, body: JSON.parse(res.body) }; }
    catch (error) { return { ok: false, status: res.status, error: `Invalid JSON from ${url}: ${error.message}` }; }
  }

  async binary(url) { return this.request(url, { binary: true }); }
}

module.exports = { HttpCache, USER_AGENT };
