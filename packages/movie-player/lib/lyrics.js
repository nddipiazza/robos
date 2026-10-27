/**
 * Subtitles, Closed Captions & Synced Dialogue Service for RobOS Movie Player
 *
 * Resolves time-synced subtitles (`.srt`, `.vtt`, `.lrc`) or plain dialogue scripts
 * for any movie or episode in priority order:
 *   1. Local sidecar `.srt`, `.vtt`, `.en.srt`, `.en.vtt`, or `.lrc` file next to the video
 *   2. Cached subtitle file in `~/.cache/robos/movie-subtitles/<trackId>.json`
 *   3. Built-in synced cinema subtitles for bundled open-source sample films (Sintel, Tears of Steel, etc.)
 *   4. Embedded subtitle stream extraction via `ffmpeg -i <video> -map 0:s:0 -f srt -`
 *   5. Optional open-data lookup via LRCLIB (`https://lrclib.net/api/get`)
 *
 * Returns `{ found, source, synced: [{ t, end, text }], plain, vttDataUrl }`.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { execFile } = require('child_process');

const SUBTITLES_CACHE_DIR = path.join(os.homedir(), '.cache', 'robos', 'movie-subtitles');

const SAMPLE_SUBTITLES = {
  'sample-blender-sintel': [
    { t: 2, end: 8, text: '[Wind howling across the frozen mountain pass]' },
    { t: 12, end: 18, text: 'Sintel: Hold on... I have to keep moving.' },
    { t: 22, end: 29, text: 'Shaman: Why do you cross the Gate of the Guardians alone, child?' },
    { t: 32, end: 39, text: 'Sintel: I am searching for Scales — a young dragon I raised from a broken wing.' },
    { t: 44, end: 52, text: 'Shaman: What you seek lies beyond the desert of ashes. Guard your heart.' },
    { t: 60, end: 70, text: '[Orchestral score swells — Blender Open Movie Project]' }
  ],
  'sample-blender-tears-of-steel': [
    { t: 2, end: 8, text: 'Thom: All I wanted was to go to space. You wanted to be a robot.' },
    { t: 10, end: 17, text: 'Celia: And look where that got us — forty years later in Neo-Amsterdam.' },
    { t: 20, end: 28, text: 'Captain: Memory override initialized. Prepare the Oude Kerk containment dome.' },
    { t: 32, end: 42, text: '[Synth telemetry hums as the neural memory bridge stabilizes]' }
  ],
  'sample-big-buck-bunny': [
    { t: 2, end: 9, text: '[Morning birds chirping in the sunlit meadow]' },
    { t: 12, end: 20, text: '[Big Buck Bunny stretches and steps out of his burrow]' },
    { t: 25, end: 34, text: '[A blue butterfly lands gently on a dandelion]' }
  ],
  'sample-elephants-dream': [
    { t: 2, end: 10, text: 'Proog: Look around you, Emo. The Machine provides everything we see.' },
    { t: 12, end: 20, text: 'Emo: I don\'t see anything there, Proog. Why won\'t you tell me what is outside?' }
  ]
};

/**
 * Parse a timestamp like `00:01:23,450` or `01:23.450` into seconds.
 */
function parseTimecode(str) {
  if (!str) return null;
  const s = String(str).trim().replace(',', '.');
  const parts = s.split(':');
  if (parts.length === 3) {
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const sec = parseFloat(parts[2]) || 0;
    return Math.round((h * 3600 + m * 60 + sec) * 100) / 100;
  }
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10) || 0;
    const sec = parseFloat(parts[1]) || 0;
    return Math.round((m * 60 + sec) * 100) / 100;
  }
  return null;
}

/**
 * Parse SubRip (.srt) text into `{ synced: [{ t, end, text }], plain }`.
 */
function parseSrt(srtText) {
  if (!srtText || typeof srtText !== 'string') return { synced: [], plain: '' };
  const cleaned = srtText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const blocks = cleaned.split(/\n\s*\n/);
  const synced = [];

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    let timeLineIdx = lines.findIndex(l => l.includes('-->'));
    if (timeLineIdx === -1) continue;
    const [startRaw, endRaw] = lines[timeLineIdx].split('-->').map(s => s.trim().split(/\s+/)[0]);
    const t = parseTimecode(startRaw);
    const end = parseTimecode(endRaw);
    if (t === null) continue;
    const text = lines
      .slice(timeLineIdx + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\{\\[^}]+\}/g, '')
      .trim();
    if (text) {
      synced.push({ t, end: end !== null ? end : t + 4, text });
    }
  }

  synced.sort((a, b) => a.t - b.t);
  const plain = synced.map(l => l.text).join('\n');
  return { synced, plain };
}

/**
 * Parse WebVTT (.vtt) text into `{ synced: [{ t, end, text }], plain }`.
 */
function parseVtt(vttText) {
  if (!vttText || typeof vttText !== 'string') return { synced: [], plain: '' };
  const body = vttText.replace(/^\uFEFF?WEBVTT[^\n]*\n/i, '');
  return parseSrt(body);
}

/**
 * Parse LRC text (`[mm:ss.xx] line`) into `{ synced: [{ t, end, text }], plain }`.
 */
function parseLrc(lrcText) {
  if (!lrcText || typeof lrcText !== 'string') return { synced: [], plain: '' };
  const lines = lrcText.split(/\r?\n/);
  const synced = [];
  const timeRe = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^\[(ti|ar|al|by|offset|length|re|ve):/i.test(line)) continue;

    const times = [];
    let m;
    timeRe.lastIndex = 0;
    while ((m = timeRe.exec(line)) !== null) {
      const mins = parseInt(m[1], 10);
      const secs = parseInt(m[2], 10);
      const frac = m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) / 1000 : 0;
      times.push(Math.round((mins * 60 + secs + frac) * 100) / 100);
    }

    if (times.length > 0) {
      const text = line.replace(timeRe, '').trim();
      for (const t of times) {
        synced.push({ t, end: t + 5, text: text || '♪' });
      }
    }
  }

  synced.sort((a, b) => a.t - b.t);
  for (let i = 0; i < synced.length - 1; i++) {
    synced[i].end = synced[i + 1].t;
  }
  const plain = synced.length > 0
    ? synced.map(l => l.text).join('\n')
    : lrcText.trim();
  return { synced, plain };
}

function formatVttTime(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = (s % 60).toFixed(3).padStart(6, '0');
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${secs}`;
}

function syncedToVttDataUrl(synced = []) {
  if (!Array.isArray(synced) || synced.length === 0) return null;
  const lines = ['WEBVTT', ''];
  for (let i = 0; i < synced.length; i++) {
    const cue = synced[i];
    const start = formatVttTime(cue.t);
    const end = formatVttTime(cue.end != null ? cue.end : (synced[i + 1] ? synced[i + 1].t : cue.t + 4));
    lines.push(`${i + 1}`);
    lines.push(`${start} --> ${end}`);
    lines.push(cue.text);
    lines.push('');
  }
  const vtt = lines.join('\n');
  return `data:text/vtt;charset=utf-8,${encodeURIComponent(vtt)}`;
}

function findSidecarSubtitles(trackPath) {
  if (!trackPath || trackPath.startsWith('cloud://') || trackPath.startsWith('http')) return null;
  try {
    const dir = path.dirname(trackPath);
    const base = path.basename(trackPath, path.extname(trackPath));
    const candidates = [
      { ext: '.srt', type: 'srt' },
      { ext: '.en.srt', type: 'srt' },
      { ext: '.eng.srt', type: 'srt' },
      { ext: '.vtt', type: 'vtt' },
      { ext: '.en.vtt', type: 'vtt' },
      { ext: '.lrc', type: 'lrc' },
      { ext: '.txt', type: 'txt' }
    ];
    for (const c of candidates) {
      const full = path.join(dir, `${base}${c.ext}`);
      if (fs.existsSync(full)) {
        const text = fs.readFileSync(full, 'utf8');
        if (text && text.trim()) return { text, type: c.type, path: full };
      }
    }
  } catch (_) {}
  return null;
}

function extractEmbeddedSrtWithFfmpeg(filePath) {
  return new Promise(resolve => {
    if (!filePath || !fs.existsSync(filePath)) return resolve(null);
    execFile(
      'ffmpeg',
      ['-v', 'error', '-i', filePath, '-map', '0:s:0', '-f', 'srt', '-'],
      { timeout: 6000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout || !stdout.trim()) return resolve(null);
        resolve(stdout);
      }
    );
  });
}

function fetchLrcLib({ title, artist, album, duration }) {
  return new Promise(resolve => {
    if (!title) return resolve(null);
    const params = new URLSearchParams({
      track_name: title,
      artist_name: artist && artist !== 'Unknown Director' ? artist : ''
    });
    if (album && album !== 'Standalone Films') params.set('album_name', album);
    if (duration && duration > 0) params.set('duration', String(Math.round(duration)));

    const req = https.request({
      hostname: 'lrclib.net',
      path: `/api/get?${params.toString()}`,
      method: 'GET',
      headers: {
        'User-Agent': 'RobOS-Movie-Player/0.1.0 (https://github.com/robos)'
      }
    }, res => {
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(null);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve(data);
        } catch (_) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

async function getLyrics(track) {
  if (!track) return { found: false, source: 'none', synced: [], plain: '', vttDataUrl: null };

  // 1. Local sidecar (.srt, .vtt, .lrc, .txt)
  const sidecar = findSidecarSubtitles(track.path);
  if (sidecar) {
    let parsed;
    if (sidecar.type === 'srt') parsed = parseSrt(sidecar.text);
    else if (sidecar.type === 'vtt') parsed = parseVtt(sidecar.text);
    else if (sidecar.type === 'lrc') parsed = parseLrc(sidecar.text);
    else parsed = { synced: [], plain: sidecar.text.trim() };

    return {
      found: true,
      source: `sidecar (${path.extname(sidecar.path)})`,
      synced: parsed.synced,
      plain: parsed.plain,
      vttDataUrl: syncedToVttDataUrl(parsed.synced)
    };
  }

  // 2. Disk cache
  fs.mkdirSync(SUBTITLES_CACHE_DIR, { recursive: true });
  const cacheFile = path.join(SUBTITLES_CACHE_DIR, `${track.id}.json`);
  try {
    if (fs.existsSync(cacheFile)) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (cached && cached.found) {
        cached.vttDataUrl = syncedToVttDataUrl(cached.synced || []);
        return cached;
      }
    }
  } catch (_) {}

  // 3. Built-in sample film subtitles
  if (SAMPLE_SUBTITLES[track.id]) {
    const synced = SAMPLE_SUBTITLES[track.id];
    const plain = synced.map(s => s.text).join('\n');
    return {
      found: true,
      source: 'built-in-captions',
      synced,
      plain,
      vttDataUrl: syncedToVttDataUrl(synced)
    };
  }

  // 4. Embedded subtitle track via ffmpeg
  if (track.path && !track.path.startsWith('http') && !track.path.startsWith('cloud://')) {
    const embeddedSrt = await extractEmbeddedSrtWithFfmpeg(track.path);
    if (embeddedSrt) {
      const parsed = parseSrt(embeddedSrt);
      if (parsed.synced.length > 0) {
        const result = {
          found: true,
          source: 'embedded-stream',
          synced: parsed.synced,
          plain: parsed.plain,
          vttDataUrl: syncedToVttDataUrl(parsed.synced)
        };
        try { fs.writeFileSync(cacheFile, JSON.stringify(result)); } catch (_) {}
        return result;
      }
    }
  }

  // 5. LRCLIB fallback
  const remote = await fetchLrcLib(track);
  if (remote && (remote.syncedLyrics || remote.plainLyrics)) {
    const parsed = remote.syncedLyrics ? parseLrc(remote.syncedLyrics) : { synced: [], plain: remote.plainLyrics };
    const result = {
      found: true,
      source: 'lrclib',
      synced: parsed.synced,
      plain: remote.plainLyrics || parsed.plain,
      vttDataUrl: syncedToVttDataUrl(parsed.synced)
    };
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(result));
    } catch (_) {}
    return result;
  }

  return { found: false, source: 'none', synced: [], plain: '', vttDataUrl: null };
}

function saveCustomSubtitles(trackId, srtOrVttText) {
  if (!trackId || !srtOrVttText) return { found: false, source: 'none', synced: [], plain: '' };
  fs.mkdirSync(SUBTITLES_CACHE_DIR, { recursive: true });
  const cacheFile = path.join(SUBTITLES_CACHE_DIR, `${trackId}.json`);
  const parsed = srtOrVttText.includes('-->')
    ? parseSrt(srtOrVttText)
    : parseLrc(srtOrVttText);
  const result = {
    found: true,
    source: 'imported-subtitles',
    synced: parsed.synced,
    plain: parsed.plain || srtOrVttText.trim(),
    vttDataUrl: syncedToVttDataUrl(parsed.synced)
  };
  fs.writeFileSync(cacheFile, JSON.stringify(result));
  return result;
}

module.exports = {
  parseSrt,
  parseVtt,
  parseLrc,
  parseTimecode,
  syncedToVttDataUrl,
  getLyrics,
  getSubtitles: getLyrics,
  saveCustomSubtitles,
  LYRICS_CACHE_DIR: SUBTITLES_CACHE_DIR,
  SUBTITLES_CACHE_DIR
};
