'use strict';
// Time-synced ("karaoke") lyrics. Lookup order: .lrc next to the audio file,
// the local lyrics cache, then LRCLIB (https://lrclib.net, no API key).

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const CACHE_DIR = path.join(process.env.HOME || os.homedir(), '.config', 'robos', 'audio-lyrics');
const LRCLIB = 'https://lrclib.net/api';
const FETCH_TIMEOUT_MS = 8000;

// "[01:23.45] text", also "[mm:ss]" and several stamps per line.
function parseLrc(text) {
  const lines = [];
  const stamp = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const times = [];
    let last = 0, m;
    stamp.lastIndex = 0;
    while ((m = stamp.exec(raw)) !== null) {
      const frac = m[3] ? Number('0.' + m[3]) : 0;
      times.push(Number(m[1]) * 60 + Number(m[2]) + frac);
      last = stamp.lastIndex;
    }
    if (!times.length) continue;
    const lyric = raw.slice(last).trim();
    for (const t of times) lines.push({ t, text: lyric });
  }
  return lines.sort((a, b) => a.t - b.t);
}

function cacheFile(track) {
  const key = crypto.createHash('sha1').update([track.artist, track.title, track.album].join('|').toLowerCase()).digest('hex');
  return path.join(CACHE_DIR, key + '.json');
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { 'User-Agent': 'RobOS Audio Player' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Lyrics service returned ${res.status}`);
  return res.json();
}

async function fromLrclib(track) {
  const q = new URLSearchParams({ artist_name: track.artist || '', track_name: track.title || '' });
  if (track.album) q.set('album_name', track.album);
  if (track.duration) q.set('duration', String(Math.round(track.duration)));
  let hit = await fetchJson(`${LRCLIB}/get?${q}`);
  if (!hit || !hit.syncedLyrics) {
    const results = await fetchJson(`${LRCLIB}/search?${new URLSearchParams({ artist_name: track.artist || '', track_name: track.title || '' })}`);
    const close = (results || []).filter(r => r.syncedLyrics && (!track.duration || Math.abs(r.duration - track.duration) <= 5));
    hit = close[0] || hit;
  }
  return hit;
}

async function getLyrics(track) {
  if (!track || !track.title) return { found: false };

  if (track.filePath) {
    const sidecar = track.filePath.replace(/\.[^./\\]+$/, '.lrc');
    try {
      const lines = parseLrc(fs.readFileSync(sidecar, 'utf8'));
      if (lines.length) return { found: true, source: 'file', synced: lines };
    } catch {}
  }

  const cached = cacheFile(track);
  try { return JSON.parse(fs.readFileSync(cached, 'utf8')); } catch {}

  let hit;
  try {
    hit = await fromLrclib(track);
  } catch (err) {
    return { found: false, error: `Lyrics lookup failed: ${err.message}` };
  }
  if (!hit || (!hit.syncedLyrics && !hit.plainLyrics)) return { found: false };

  const result = {
    found: true,
    source: 'lrclib',
    synced: hit.syncedLyrics ? parseLrc(hit.syncedLyrics) : [],
    plain: hit.plainLyrics || '',
  };
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cached, JSON.stringify(result));
  } catch {}
  return result;
}

module.exports = { getLyrics, parseLrc };
