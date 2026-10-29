'use strict';

// Internet Archive Wayback Machine connector. Older fan shrines (rpgamer,
// RPGClassics, GeoCities-era guides) often refuse automated clients or have
// gone offline; their archived copies are the citable source.

class WaybackConnector {
  constructor({ http }) { this.http = http; }

  async latestSnapshot(url) {
    const res = await this.http.json(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`);
    if (!res.ok) return { ok: false, error: res.error };
    const snap = res.body?.archived_snapshots?.closest;
    if (!snap || !snap.available) return { ok: false, error: 'no snapshot' };
    // "id_" asks for the original bytes without the Wayback toolbar.
    const raw = snap.url.replace(/\/web\/(\d+)\//, '/web/$1id_/');
    return { ok: true, timestamp: snap.timestamp, url: snap.url, rawUrl: raw };
  }

  async fetchArchived(url) {
    const snap = await this.latestSnapshot(url);
    if (!snap.ok) return snap;
    const res = await this.http.text(snap.rawUrl);
    return res.ok ? { ok: true, snapshot: snap, body: res.body } : { ok: false, error: res.error, snapshot: snap };
  }
}

module.exports = { WaybackConnector };
