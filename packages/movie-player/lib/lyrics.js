'use strict';
// Time-synced ("karaoke") lyrics. Lookup order: .lrc next to the audio file,
// the local lyrics cache, then LRCLIB (https://lrclib.net, no API key).

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const CACHE_DIR = path.join(process.env.HOME || os.homedir(), '.config', 'robos', 'movie-subtitles');
const LRCLIB = 'https://lrclib.net/api';
const FETCH_TIMEOUT_MS = 8000;

function parseSrtOrVtt(text) {
  const lines = [];
  const blocks = String(text || '').replace(/\r\n/g, '\n').split(/\n\s*\n/);
  const timeRe = /(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{1,3})/;
  for (const block of blocks) {
    const rawLines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (!rawLines.length) continue;
    const tIdx = rawLines.findIndex(l => timeRe.test(l));
    if (tIdx === -1) continue;
    const m = timeRe.exec(rawLines[tIdx]);
    const h = m[1] ? Number(m[1]) : 0;
    const min = Number(m[2]);
    const s = Number(m[3]);
    const ms = Number('0.' + m[4]);
    const t = h * 3600 + min * 60 + s + ms;
    const caption = rawLines.slice(tIdx + 1).join(' ').replace(/<[^>]+>/g, '').trim();
    if (caption) lines.push({ t, text: caption });
  }
  return lines.sort((a, b) => a.t - b.t);
}

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
// `titles` holds the title as tagged plus, when it has a filename-style track
// number ("12 Song", "01 - Song"), a stripped variant to try second.
function normalizeQuery(track) {
  const clean = v => (v && !PLACEHOLDER.test(String(v).trim()) ? String(v).trim() : '');
  let artist = clean(track.artist);
  let album = clean(track.album);
  const title = String(track.title || '').trim();
  const stripped = title.replace(/^\d{1,3}(\s*[-.]\s*|\s+)(?=\S)/, '').trim();
  const titles = stripped && stripped !== title ? [title, stripped] : [title];
  if (!artist && album) {
    const m = album.match(/^(.+?)\s+-\s+(.+?)(?:\s*[([]\d{4}[)\]])?$/);
    if (m) { artist = m[1]; album = m[2]; }
  }
  const duration = track.duration > 0 && track.duration <= MAX_DURATION ? Math.round(track.duration) : 0;
  return { artist, album, titles, duration };
}

async function fromLrclib(track) {
  const { titles, ...rest } = normalizeQuery(track);
  let hit = null;
  for (const title of titles) {
    hit = await queryLrclib({ ...rest, title });
    if (hit && (hit.syncedLyrics || hit.plainLyrics)) break;
  }
  return hit;
}

async function queryLrclib({ artist, album, title, duration }) {
  let hit = null;
  // /get needs an artist; without one go straight to search.
  if (artist) {
    const q = new URLSearchParams({ artist_name: artist, track_name: title });
    if (album) q.set('album_name', album);
    if (duration) q.set('duration', String(duration));
    hit = await fetchJson(`${LRCLIB}/get?${q}`);
  }
  if (!hit || !hit.syncedLyrics) {
    const q = new URLSearchParams({ track_name: title });
    if (artist) q.set('artist_name', artist);
    let results;
    try {
      results = await fetchJson(`${LRCLIB}/search?${q}`);
    } catch (err) {
      // Keep a plain-lyrics /get hit rather than failing the whole lookup.
      if (hit) return hit;
      throw err;
    }
    const usable = (results || []).filter(r => r.syncedLyrics || r.plainLyrics);
    const close = usable.filter(r => !duration || Math.abs(r.duration - duration) <= 5);
    hit = close.find(r => r.syncedLyrics) || (hit && hit.plainLyrics ? hit : close[0]) || hit;
  }
  return hit;
}

async function getLyrics(track) {
  if (!track || !track.title) return { found: false };

  if (track.filePath) {
    for (const ext of ['.srt', '.vtt', '.en.srt', '.en.vtt']) {
      const subFile = track.filePath.replace(/\.[^./\\]+$/, ext);
      try {
        const lines = parseSrtOrVtt(fs.readFileSync(subFile, 'utf8'));
        if (lines.length) return { found: true, source: 'subtitles', synced: lines };
      } catch {}
    }
    const sidecar = track.filePath.replace(/\.[^./\\]+$/, '.lrc');
    try {
      const lines = parseLrc(fs.readFileSync(sidecar, 'utf8'));
      if (lines.length) return { found: true, source: 'file', synced: lines };
    } catch {}
  }

  // If this is a remote SFTP/cloud movie, check for a sidecar .srt file next to remotePath
  if (track.cloud && track.cloud.connectionId && track.cloud.remotePath && track.filePath) {
    const localSrt = track.filePath.replace(/\.[^./\\]+$/, '.srt');
    const remoteSrt = track.cloud.remotePath.replace(/\.[^./\\]+$/, '.srt');
    try {
      const cloud = require('./cloud-storage');
      const rs = require('../../data-sources/lib/remote-storage');
      const ds = cloud.listConnections().find(c => c.id === track.cloud.connectionId);
      if (ds) {
        const rawConfigs = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config', 'robos', 'data-sources.json'), 'utf8'));
        const fullDs = Array.isArray(rawConfigs) ? rawConfigs.find(d => d.id === track.cloud.connectionId) : null;
        if (fullDs) {
          await rs.download(fullDs, remoteSrt, localSrt);
          const lines = parseSrtOrVtt(fs.readFileSync(localSrt, 'utf8'));
          if (lines.length) return { found: true, source: 'subtitles', synced: lines };
        }
      }
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
