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
  const key = crypto.createHash('sha1')
    .update(['v2', track.artist, track.title, track.album, Math.round(track.duration || 0)].join('|').toLowerCase())
    .digest('hex');
  return path.join(CACHE_DIR, key + '.json');
}

// Placeholders the library fills in when tags are missing; sending them to
// LRCLIB only guarantees a miss.
const PLACEHOLDER = /^(unknown (artist|album)|cloud stream)$/i;
// LRCLIB rejects durations outside 1..3600s with a 400; anything that long is
// a compilation/OST rip rather than a song with lyrics anyway.
const MAX_DURATION = 3600;
const RETRY_DELAYS_MS = [600, 1500];

async function fetchJson(url) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { 'User-Agent': 'RobOS Audio Player' } });
    if (res.status === 404) return null;
    // LRCLIB answers 503 "ServerOverloaded" (and 429) intermittently; retry briefly.
    if ((res.status === 503 || res.status === 429) && attempt < RETRY_DELAYS_MS.length) {
      await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      continue;
    }
    if (!res.ok) throw new Error(`Lyrics service returned ${res.status}`);
    return res.json();
  }
}

// Strip placeholder tags so the query matches what LRCLIB stores. Cloud tracks
// often carry the artist only in the folder-derived album ("Artist - Album (2016)").
// Try the title as tagged, then remove filename track numbers and lyric-video labels.
function normalizeQuery(track) {
  const clean = v => (v && !PLACEHOLDER.test(String(v).trim()) ? String(v).trim() : '');
  let artist = clean(track.artist);
  let album = clean(track.album);
  const title = String(track.title || '').trim();
  const stripped = title.replace(/^\d{1,3}(\s*[-.]\s*|\s+)(?=\S)/, '').trim();
  if (!artist && album) {
    const m = album.match(/^(.+?)\s+-\s+(.+?)(?:\s*[([]\d{4}[)\]])?$/);
    if (m) { artist = m[1]; album = m[2]; }
  }
  const lyricLabel = /\s+(?:with lyrics|(?:official )?lyric video|\[(?:lyrics|with lyrics|(?:official )?lyric video)\]|\((?:lyrics|with lyrics|(?:official )?lyric video)\))$/i;
  const undecorated = stripped.replace(lyricLabel, '').trim();
  let cleaned = undecorated;
  if (artist && undecorated.toLowerCase().startsWith(artist.toLowerCase())) {
    const suffix = undecorated.slice(artist.length);
    if (/^\s*[-–—:]\s*\S/.test(suffix) || (undecorated !== stripped && /^\s+\S/.test(suffix))) {
      cleaned = suffix.replace(/^\s*[-–—:]?\s*/, '');
    }
  }
  const titles = [...new Set([title, stripped, cleaned].filter(Boolean))];
  const duration = track.duration > 0 && track.duration <= MAX_DURATION ? Math.round(track.duration) : 0;
  return { artist, album, titles, duration };
}

async function fromLrclib(track) {
  const { titles, ...rest } = normalizeQuery(track);
  let plainHit = null;
  for (const title of titles) {
    const hit = await queryLrclib({ ...rest, title });
    if (!hit) continue;
    const canSync = rest.duration ? matchesDuration(hit, rest.duration) : titles.length === 1;
    if (canSync && hit.syncedLyrics) return hit;
    if (!plainHit && hit.plainLyrics) plainHit = { plainLyrics: hit.plainLyrics };
  }
  return plainHit;
}

const matchesDuration = (result, duration) => Number.isFinite(result.duration) && Math.abs(result.duration - duration) <= 5;
const matchesTag = (actual, expected) => typeof actual === 'string' && actual.trim().toLowerCase() === expected.trim().toLowerCase();

async function queryLrclib({ artist, album, title, duration }) {
  let hit = null;
  // /get expects the complete recording metadata. Other tracks use search.
  if (artist && album && duration) {
    const q = new URLSearchParams({ artist_name: artist, track_name: title, album_name: album, duration: String(duration) });
    hit = await fetchJson(`${LRCLIB}/get?${q}`);
    if (hit?.syncedLyrics && matchesDuration(hit, duration)) return hit;
  }
  const q = new URLSearchParams({ track_name: title });
  if (artist) q.set('artist_name', artist);
  let results;
  try {
    results = await fetchJson(`${LRCLIB}/search?${q}`);
  } catch (err) {
    if (hit) return hit;
    throw err;
  }
  const exact = (Array.isArray(results) ? results : []).filter(r =>
    matchesTag(r.trackName || r.name, title) && (!artist || matchesTag(r.artistName, artist)));
  const close = exact.filter(r => !duration || matchesDuration(r, duration));
  return close.find(r => r.syncedLyrics && matchesTag(r.albumName, album))
    || close.find(r => r.syncedLyrics)
    || (hit?.plainLyrics ? hit : null)
    || exact.find(r => r.plainLyrics && matchesTag(r.albumName, album))
    || exact.find(r => r.plainLyrics)
    || null;
}

async function getLyrics(track) {
  if (!track || !track.title) return { found: false };

  if (track.mediaService?.lyricsUrl) {
    try {
      const res = await fetch(track.mediaService.lyricsUrl, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const text = await res.text();
        const lines = parseLrc(text);
        if (lines.length) return { found: true, source: 'media-server', synced: lines };
      }
    } catch {}
  }

  if (track.filePath) {
    const sidecar = track.filePath.replace(/\.[^./\\]+$/, '.lrc');
    try {
      const lines = parseLrc(fs.readFileSync(sidecar, 'utf8'));
      if (lines.length) return { found: true, source: 'file', synced: lines };
    } catch {}
  }

  const cached = cacheFile(track);
  try { return JSON.parse(fs.readFileSync(cached, 'utf8')); } catch {}
  if (track.duration > MAX_DURATION) return { found: false };

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

module.exports = { getLyrics, parseLrc, normalizeQuery };
