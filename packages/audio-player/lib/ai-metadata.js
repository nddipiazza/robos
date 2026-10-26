'use strict';

// Open-Source Media Metadata & Artwork Enricher for RobOS Audio Player.
//
// Strictly uses legal, open-source software and open-licensed databases:
// - music-metadata (MIT): tag & embedded cover parser
// - FFmpeg / ffprobe (LGPL/GPL): stream probing, attached_pic/frame extraction,
//   waveform cover synthesis, and lossless container tag writing
// - MusicBrainz WS/2 API (CC0 1.0 Public Domain): canonical recording & release metadata
// - Cover Art Archive (CC0 / Public Domain / Internet Archive): official release front covers
// - LRCLIB (MIT / Open Database): open lyrics & track verification
// - Local sidecar (.cue, .lrc, .nfo) and path structure heuristics

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { execFile } = require('child_process');
const { promisify } = require('util');
const {
  generateArtId,
  findFolderCover,
  guessFromRemotePath,
} = require('./track-metadata');

const execFileAsync = promisify(execFile);

const USER_AGENT = 'RobOSAudioPlayer/1.0.0 (https://github.com/ndipiazza/robos)';
const DEFAULT_SKILL_TOKEN = '@skill(robos:fix-media-metadata)';

const DEFAULT_FIX_METADATA_PROMPT = `${DEFAULT_SKILL_TOKEN}
Inspect all selected media files and fix missing, noisy, or incomplete metadata and artwork using open-source tools and open databases:
1. Clean noisy titles (strip [Official Video], (Lyrics), bitrate/resolution tags, leading track numbers, and underscores) while preserving legitimate feat./remix/live credits.
2. Infer missing artist, albumArtist, album, year, genre, composer, trackNumber/trackTotal, and discNumber/discTotal from container streams, folder/filename hierarchy, .cue/.lrc/.nfo sidecars, and MusicBrainz / LRCLIB open-data matches.
3. Ensure every track gets high-quality artwork: extract embedded pictures or video frames, use folder cover images, fetch Cover Art Archive release covers, or generate an open-source waveform/album cover when none exists.`;

const SUPPORTED_MEDIA_EXTENSIONS = new Set([
  '.mp3', '.m4a', '.flac', '.ogg', '.oga', '.wav', '.aac', '.opus', '.wma', '.aiff', '.aif', '.alac',
  '.mp4', '.m4v', '.mkv', '.webm', '.avi', '.mov',
]);

const VIDEO_CONTAINERS = new Set(['.mp4', '.m4v', '.mkv', '.webm', '.avi', '.mov']);

const NOISE_PATTERNS = [
  /\[\s*(?:official\s*(?:music\s*)?(?:video|audio|lyric\s*video|visualizer)|hd|hq|4k|1080p|720p|lyrics?|audio|explicit|clean|remastered|flac|320\s*kbps|mp3)\s*\]/gi,
  /\(\s*(?:official\s*(?:music\s*)?(?:video|audio|lyric\s*video|visualizer)|hd|hq|4k|1080p|720p|lyrics?\s*(?:video)?|official\s*release|320\s*kbps)\s*\)/gi,
  /\b(?:www\.[\w.-]+\.(?:com|net|org|io))\b/gi,
  /\s*-\s*\[[0-9a-f]{6,16}\]$/i,
  /\s*\[[a-zA-Z0-9_-]{11}\]$/, // trailing YouTube-style 11-char ID in brackets
];

function requireShared(modPath) {
  const candidates = [
    path.resolve(__dirname, '..', '..', modPath),
    `/usr/local/share/robos/${modPath}`,
  ];
  for (const p of candidates) {
    try { return require(p); } catch {}
  }
  return null;
}

function getOneShot() {
  return requireShared('robos-agent-client/one-shot') || {};
}

function getSkillCatalog() {
  return requireShared('robos-lib/skill-catalog') || {};
}

/**
 * Clean common filename/ripper noise from a raw title string.
 */
function cleanMediaTitle(raw) {
  if (!raw) return '';
  let s = String(raw).replace(/_/g, ' ').trim();
  // Strip known media extension if accidentally left in title
  const ext = path.extname(s).toLowerCase();
  if (SUPPORTED_MEDIA_EXTENSIONS.has(ext)) {
    s = s.slice(0, -ext.length);
  }
  for (const re of NOISE_PATTERNS) {
    s = s.replace(re, ' ');
  }
  return s.replace(/\s{2,}/g, ' ').trim();
}

function isMissingValue(val, placeholders = []) {
  if (val == null) return true;
  const s = String(val).trim();
  if (!s) return true;
  const lower = s.toLowerCase();
  return placeholders.some(p => lower === p.toLowerCase());
}

function isNoisyTitle(title, filePath) {
  if (!title) return true;
  const s = String(title).trim();
  if (!s) return true;
  if (NOISE_PATTERNS.some(re => { re.lastIndex = 0; return re.test(s); })) return true;
  if (/^(?:track\s*\d+|audiotrack\s*\d+|unknown(?:\s+title)?|untitled)$/i.test(s)) return true;
  if (/^\d{1,3}\s*[-._]\s*\S+/.test(s)) return true;
  if (s.includes('_')) return true;
  if (filePath && s === path.parse(filePath).name && s.includes(' - ')) return true;
  return false;
}

/**
 * Determine whether a track has missing or low-quality metadata/artwork.
 */
function trackNeedsMetadataFix(track) {
  if (!track) return false;
  if (isMissingValue(track.artist, ['Unknown Artist', 'Cloud Stream', 'Various'])) return true;
  if (isMissingValue(track.album, ['Unknown Album', 'Imported Playlist'])) return true;
  if (isNoisyTitle(track.title, track.filePath)) return true;
  if (!track.artId) return true;
  if (!track.year || !track.genre) return true;
  return false;
}

/**
 * Parse sibling .cue, .lrc, or .nfo files in the same directory for track metadata.
 */
function readSidecarMetadata(filePath) {
  const result = {};
  if (!filePath || !fs.existsSync(path.dirname(filePath))) return result;
  const dir = path.dirname(filePath);
  const baseName = path.parse(filePath).name;

  // 1. Check matching .lrc file
  try {
    const lrcPath = path.join(dir, `${baseName}.lrc`);
    if (fs.existsSync(lrcPath) && fs.statSync(lrcPath).size < 256 * 1024) {
      const lrc = fs.readFileSync(lrcPath, 'utf8');
      const ti = /^\[ti:\s*(.+?)\s*\]/im.exec(lrc);
      const ar = /^\[ar:\s*(.+?)\s*\]/im.exec(lrc);
      const al = /^\[al:\s*(.+?)\s*\]/im.exec(lrc);
      const au = /^\[(?:au|by):\s*(.+?)\s*\]/im.exec(lrc);
      if (ti) result.title = ti[1].trim();
      if (ar) result.artist = ar[1].trim();
      if (al) result.album = al[1].trim();
      if (au) result.composer = au[1].trim();
    }
  } catch {}

  // 2. Check any .cue file in the directory
  try {
    const files = fs.readdirSync(dir);
    const cueName = files.find(f => f.toLowerCase().endsWith('.cue'));
    if (cueName) {
      const cuePath = path.join(dir, cueName);
      if (fs.statSync(cuePath).size < 512 * 1024) {
        const cue = fs.readFileSync(cuePath, 'utf8');
        const albumMatch = /^\s*TITLE\s+"([^"]+)"/m.exec(cue);
        const albumPerfMatch = /^\s*PERFORMER\s+"([^"]+)"/m.exec(cue);
        const dateMatch = /^\s*REM\s+DATE\s+"?(\d{4})"?/im.exec(cue);
        const genreMatch = /^\s*REM\s+GENRE\s+"?([^"\r\n]+)"?/im.exec(cue);
        if (albumMatch && !result.album) result.album = albumMatch[1].trim();
        if (albumPerfMatch && !result.albumArtist) result.albumArtist = albumPerfMatch[1].trim();
        if (dateMatch && !result.year) result.year = Number(dateMatch[1]);
        if (genreMatch && !result.genre) result.genre = genreMatch[1].trim();

        // Try matching FILE "<basename>" block or track number
        const fileRegex = new RegExp(`FILE\\s+"[^"]*${escapeRegExp(baseName)}[^"]*"[\\s\\S]*?TRACK\\s+(\\d+)\\s+AUDIO([\\s\\S]*?)(?=FILE\\s+|TRACK\\s+\\d+|$)`, 'i');
        const block = fileRegex.exec(cue);
        if (block) {
          result.trackNumber = Number(block[1]);
          const tTitle = /TITLE\s+"([^"]+)"/i.exec(block[2]);
          const tPerf = /PERFORMER\s+"([^"]+)"/i.exec(block[2]);
          if (tTitle) result.title = tTitle[1].trim();
          if (tPerf) result.artist = tPerf[1].trim();
        }
      }
    }

    // 3. Check .nfo file for Year / Genre / Album
    const nfoName = files.find(f => f.toLowerCase().endsWith('.nfo'));
    if (nfoName) {
      const nfoPath = path.join(dir, nfoName);
      if (fs.statSync(nfoPath).size < 256 * 1024) {
        const nfo = fs.readFileSync(nfoPath, 'utf8');
        const genre = /(?:genre|style)\s*[:.]+\s*([^\r\n]+)/i.exec(nfo);
        const year = /(?:year|date|released)\s*[:.]+\s*(?:.*?\b)((?:19|20)\d\d)\b/i.exec(nfo);
        if (genre && !result.genre) result.genre = genre[1].trim();
        if (year && !result.year) result.year = Number(year[1]);
      }
    }
  } catch {}

  return result;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Probe a local file with ffprobe for container tags, audio technical stream info,
 * and embedded visual/attached_pic streams.
 */
async function probeWithFfprobe(filePath, execFn = execFileAsync) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const { stdout } = await execFn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ], { timeout: 6000 });
    const data = JSON.parse(stdout || '{}');
    const fmt = data.format || {};
    const rawTags = fmt.tags || {};
    const streams = Array.isArray(data.streams) ? data.streams : [];

    // Stream-level tags (e.g. Ogg/Opus stores Vorbis comments on stream 0)
    const mergedTags = {};
    for (const st of streams) {
      if (st.tags) {
        for (const [k, v] of Object.entries(st.tags)) {
          mergedTags[k.toLowerCase()] = v;
        }
      }
    }
    for (const [k, v] of Object.entries(rawTags)) {
      mergedTags[k.toLowerCase()] = v;
    }

    const audioStream = streams.find(s => s.codec_type === 'audio') || {};
    const videoStream = streams.find(s => s.codec_type === 'video') || null;
    const hasAttachedPic = !!(videoStream && videoStream.disposition && videoStream.disposition.attached_pic);
    const hasVideoFrame = !!(videoStream && !hasAttachedPic);

    const parseTrackPair = (val) => {
      if (!val) return { no: null, of: null };
      const m = /^(\d+)(?:\/(\d+))?/.exec(String(val).trim());
      return m ? { no: Number(m[1]), of: m[2] ? Number(m[2]) : null } : { no: null, of: null };
    };

    const trk = parseTrackPair(mergedTags.track || mergedTags.tracknumber);
    const dsk = parseTrackPair(mergedTags.disc || mergedTags.discnumber);
    const yearMatch = /\b((?:19|20)\d\d)\b/.exec(mergedTags.date || mergedTags.year || mergedTags.originaldate || '');

    return {
      title: mergedTags.title || null,
      artist: mergedTags.artist || mergedTags.performer || null,
      albumArtist: mergedTags.album_artist || mergedTags.albumartist || null,
      album: mergedTags.album || null,
      year: yearMatch ? Number(yearMatch[1]) : null,
      genre: mergedTags.genre || null,
      composer: mergedTags.composer || null,
      trackNumber: trk.no,
      trackTotal: trk.of || (mergedTags.tracktotal ? Number(mergedTags.tracktotal) : null),
      discNumber: dsk.no,
      discTotal: dsk.of || (mergedTags.disctotal ? Number(mergedTags.disctotal) : null),
      duration: Number(fmt.duration || audioStream.duration || 0) || 0,
      bitrate: Number(fmt.bit_rate || audioStream.bit_rate || 0) || 0,
      sampleRate: Number(audioStream.sample_rate || 0) || 0,
      channels: Number(audioStream.channels || 0) || null,
      codec: audioStream.codec_name || fmt.format_name || null,
      hasAttachedPic,
      hasVideoFrame,
    };
  } catch {
    return null;
  }
}

/**
 * Extract embedded artwork or a representative video frame via FFmpeg.
 */
async function extractCoverWithFfmpeg(filePath, { duration = 0, isVideo = false } = {}, execFn = execFileAsync) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const tmpFile = path.join(os.tmpdir(), `robos-art-extract-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`);
  try {
    if (!isVideo) {
      // First try direct attached_pic copy/transcode
      await execFn('ffmpeg', [
        '-y', '-v', 'quiet',
        '-i', filePath,
        '-an',
        '-frames:v', '1',
        '-vf', "scale='min(600,iw)':-1",
        '-q:v', '2',
        tmpFile,
      ], { timeout: 8000 });
    } else {
      // Seek to ~20% of duration (or 5s) to grab a representative non-black frame
      const seekSec = duration > 10 ? Math.min(Math.round(duration * 0.2), 60) : 1;
      await execFn('ffmpeg', [
        '-y', '-v', 'quiet',
        '-ss', String(seekSec),
        '-i', filePath,
        '-an',
        '-frames:v', '1',
        '-vf', "scale='min(600,iw)':-1",
        '-q:v', '2',
        tmpFile,
      ], { timeout: 8000 });
    }
    if (fs.existsSync(tmpFile) && fs.statSync(tmpFile).size > 256) {
      const buffer = fs.readFileSync(tmpFile);
      return { buffer, format: 'image/jpeg', source: isVideo ? 'video-frame' : 'embedded' };
    }
  } catch {} finally {
    try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
  }
  return null;
}

/**
 * Generate a clean, open-source audio waveform PNG via FFmpeg lavfi showwavespic,
 * or fall back to a deterministic SVG/PNG-compatible cover buffer.
 */
async function generateWaveformCover(filePath, { title, artist, album } = {}, execFn = execFileAsync) {
  if (filePath && fs.existsSync(filePath)) {
    const tmpFile = path.join(os.tmpdir(), `robos-wave-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.png`);
    try {
      const hue = hashHue(`${artist || ''}-${album || title || ''}`);
      const c1 = hslToHex(hue, 75, 58);
      const c2 = hslToHex((hue + 45) % 360, 75, 65);
      const bg = hslToHex(hue, 35, 12);
      await execFn('ffmpeg', [
        '-y', '-v', 'quiet',
        '-i', filePath,
        '-filter_complex',
        `color=c=0x${bg}:s=600x600[bg];[0:a]showwavespic=s=520x220:colors=0x${c1}|0x${c2}[fg];[bg][fg]overlay=40:190:format=auto`,
        '-frames:v', '1',
        tmpFile,
      ], { timeout: 10000 });
      if (fs.existsSync(tmpFile) && fs.statSync(tmpFile).size > 256) {
        const buffer = fs.readFileSync(tmpFile);
        return { buffer, format: 'image/png', source: 'waveform' };
      }
    } catch {} finally {
      try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
    }
  }
  return generateSvgAlbumCover({ title, artist, album });
}

function hashHue(text) {
  let h = 0;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = x => Math.round(255 * f(x)).toString(16).padStart(2, '0');
  return `${toHex(0)}${toHex(8)}${toHex(4)}`;
}

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate a clean, open-source procedural cover image (PNG via FFmpeg if available,
 * or valid SVG/PNG fallback).
 */
function generateSvgAlbumCover({ title = 'Unknown Track', artist = 'Unknown Artist', album = '' } = {}) {
  const seed = `${artist} - ${album || title}`;
  const hue = hashHue(seed);
  const c1 = `#${hslToHex(hue, 55, 22)}`;
  const c2 = `#${hslToHex((hue + 45) % 360, 62, 12)}`;
  const accent = `#${hslToHex((hue + 15) % 360, 82, 62)}`;
  const displayAlbum = (album && album !== 'Unknown Album' ? album : title).slice(0, 36);
  const displayArtist = (artist || 'Unknown Artist').slice(0, 40);

  // Build decorative waveform bars deterministically from seed
  const bars = [];
  for (let i = 0; i < 28; i++) {
    const h = 24 + ((hashHue(`${seed}:${i}`) % 90));
    const x = 76 + i * 16;
    const y = 310 - Math.round(h / 2);
    bars.push(`<rect x="${x}" y="${y}" width="10" height="${h}" rx="5" fill="${accent}" opacity="${(0.45 + (i % 5) * 0.1).toFixed(2)}"/>`);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="600" height="600" fill="url(#bg)"/>
  <circle cx="300" cy="250" r="170" fill="none" stroke="${accent}" stroke-opacity="0.18" stroke-width="2"/>
  <circle cx="300" cy="250" r="125" fill="none" stroke="${accent}" stroke-opacity="0.12" stroke-width="1.5"/>
  ${bars.join('\n  ')}
  <text x="60" y="475" fill="#f8fafc" font-family="sans-serif" font-size="30" font-weight="700">${escapeXml(displayAlbum)}</text>
  <text x="60" y="518" fill="${accent}" font-family="sans-serif" font-size="22" font-weight="500">${escapeXml(displayArtist)}</text>
</svg>`;

  return {
    buffer: Buffer.from(svg, 'utf8'),
    format: 'image/svg+xml',
    source: 'generated',
  };
}

// ── HTTP helpers for Open-Data APIs (MusicBrainz, Cover Art Archive, LRCLIB) ─

function httpGetBuffer(url, { timeoutMs = 5500, maxRedirects = 4, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: '*/*',
        ...headers,
      },
      timeout: timeoutMs,
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && maxRedirects > 0) {
        res.resume();
        const nextUrl = new URL(res.headers.location, url).href;
        httpGetBuffer(nextUrl, { timeoutMs, maxRedirects: maxRedirects - 1, headers })
          .then(resolve, reject);
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      let total = 0;
      res.on('data', (chunk) => {
        total += chunk.length;
        if (total > 10 * 1024 * 1024) {
          req.destroy(new Error('Response too large'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: res.headers['content-type'] || 'application/octet-stream',
        });
      });
    });
    req.on('timeout', () => req.destroy(new Error('Request timeout')));
    req.on('error', reject);
  });
}

async function httpGetJson(url, opts = {}) {
  const { buffer } = await httpGetBuffer(url, {
    ...opts,
    headers: { Accept: 'application/json', ...(opts.headers || {}) },
  });
  return JSON.parse(buffer.toString('utf8'));
}

/**
 * Query MusicBrainz WS/2 API (CC0 Public Domain) for canonical track & release info.
 */
async function lookupMusicBrainz({ title, artist, album, duration } = {}, fetchJson = httpGetJson) {
  const cleanT = cleanMediaTitle(title);
  if (!cleanT) return null;

  const qParts = [`recording:"${cleanT.replace(/"/g, '')}"`];
  if (artist && !isMissingValue(artist, ['Unknown Artist', 'Cloud Stream', 'Various'])) {
    qParts.push(`artist:"${String(artist).replace(/"/g, '')}"`);
  }
  if (album && !isMissingValue(album, ['Unknown Album', 'Imported Playlist'])) {
    qParts.push(`release:"${String(album).replace(/"/g, '')}"`);
  }

  const query = encodeURIComponent(qParts.join(' AND '));
  const url = `https://musicbrainz.org/ws/2/recording/?query=${query}&limit=5&fmt=json`;

  try {
    const data = await fetchJson(url, { timeoutMs: 4500 });
    const recordings = Array.isArray(data && data.recordings) ? data.recordings : [];
    if (!recordings.length) return null;

    // Pick best recording (prefer close duration and official album release)
    let bestRec = recordings[0];
    let bestScore = -1;
    for (const rec of recordings) {
      let score = Number(rec.score || 0);
      if (duration > 0 && rec.length) {
        const diffSec = Math.abs(rec.length / 1000 - duration);
        if (diffSec <= 4) score += 25;
        else if (diffSec <= 12) score += 10;
      }
      if (score > bestScore) {
        bestScore = score;
        bestRec = rec;
      }
    }

    const artistCredit = Array.isArray(bestRec['artist-credit'])
      ? bestRec['artist-credit'].map(c => (c.name || (c.artist && c.artist.name) || '') + (c.joinphrase || '')).join('').trim()
      : null;

    const releases = Array.isArray(bestRec.releases) ? bestRec.releases : [];
    const officialRelease = releases.find(r => r.status === 'Official' && r.date) || releases[0] || null;

    let trackNumber = null;
    let trackTotal = null;
    let discNumber = null;
    if (officialRelease && Array.isArray(officialRelease.media) && officialRelease.media[0]) {
      const med = officialRelease.media[0];
      discNumber = med.position || null;
      trackTotal = med['track-count'] || null;
      if (Array.isArray(med.track) && med.track[0]) {
        const num = parseInt(med.track[0].number, 10);
        if (!Number.isNaN(num)) trackNumber = num;
      }
    }

    const dateStr = (bestRec['first-release-date'] || (officialRelease && officialRelease.date) || '');
    const yearMatch = /^(\d{4})/.exec(dateStr);
    const tags = Array.isArray(bestRec.tags) ? bestRec.tags.slice().sort((a, b) => (b.count || 0) - (a.count || 0)) : [];
    const topGenre = tags[0] && tags[0].name ? capitalizeGenre(tags[0].name) : null;

    return {
      source: 'musicbrainz',
      recordingMbid: bestRec.id || null,
      releaseMbid: officialRelease ? officialRelease.id : null,
      title: bestRec.title || null,
      artist: artistCredit || null,
      albumArtist: artistCredit || null,
      album: officialRelease ? officialRelease.title : null,
      year: yearMatch ? Number(yearMatch[1]) : null,
      genre: topGenre,
      trackNumber,
      trackTotal,
      discNumber,
    };
  } catch {
    return null;
  }
}

function capitalizeGenre(g) {
  return String(g || '')
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Fetch official open cover art from the Cover Art Archive (Internet Archive + MusicBrainz).
 */
async function fetchCoverArtArchive(releaseMbid, fetchBuf = httpGetBuffer) {
  if (!releaseMbid || !/^[0-9a-f-]{36}$/i.test(releaseMbid)) return null;
  const url = `https://coverartarchive.org/release/${releaseMbid}/front-500`;
  try {
    const { buffer, contentType } = await fetchBuf(url, { timeoutMs: 6000 });
    if (buffer && buffer.length > 512) {
      const format = contentType.includes('png') ? 'image/png' : 'image/jpeg';
      return { buffer, format, source: 'coverartarchive' };
    }
  } catch {}
  return null;
}

/**
 * Query LRCLIB open database for track/album/artist verification.
 */
async function lookupLrclib({ title, artist } = {}, fetchJson = httpGetJson) {
  const cleanT = cleanMediaTitle(title);
  if (!cleanT) return null;
  const q = encodeURIComponent([artist, cleanT].filter(t => t && !isMissingValue(t, ['Unknown Artist', 'Cloud Stream'])).join(' '));
  try {
    const list = await fetchJson(`https://lrclib.net/api/search?q=${q}`, { timeoutMs: 4000 });
    if (!Array.isArray(list) || !list.length) return null;
    const hit = list[0];
    return {
      source: 'lrclib',
      title: hit.trackName || hit.name || null,
      artist: hit.artistName || null,
      album: hit.albumName || null,
      duration: hit.duration || null,
    };
  } catch {
    return null;
  }
}

/**
 * Inspect a single track using all local open-source methods:
 * - Path/filename structure heuristics
 * - Sidecar files (.cue, .lrc, .nfo)
 * - music-metadata & ffprobe stream/container inspection
 * - Embedded & sibling folder cover art check
 */
async function inspectTrackMedia(track, { parser = null, execFn = execFileAsync } = {}) {
  const filePath = track.filePath || '';
  const remotePath = (track.cloud && track.cloud.remotePath) || filePath;
  const pathGuess = guessFromRemotePath(remotePath, path.basename(remotePath || ''));
  pathGuess.title = cleanMediaTitle(pathGuess.title);

  const sidecar = filePath && !track.cloud ? readSidecarMetadata(filePath) : {};
  const probed = filePath && fs.existsSync(filePath) ? await probeWithFfprobe(filePath, execFn) : null;

  // Also check music-metadata if local file exists
  let mmTags = null;
  let embeddedCover = null;
  if (filePath && fs.existsSync(filePath) && parser && typeof parser.parseFile === 'function') {
    try {
      const meta = await parser.parseFile(filePath, { duration: true, skipCovers: false });
      const c = meta.common || {};
      const f = meta.format || {};
      mmTags = {
        title: c.title || null,
        artist: c.artist || c.albumartist || null,
        albumArtist: c.albumartist || null,
        album: c.album || null,
        year: c.year || null,
        genre: Array.isArray(c.genre) ? c.genre[0] : (c.genre || null),
        composer: Array.isArray(c.composer) ? c.composer[0] : (c.composer || null),
        trackNumber: (c.track && c.track.no) || null,
        trackTotal: (c.track && c.track.of) || null,
        discNumber: (c.disk && c.disk.no) || null,
        discTotal: (c.disk && c.disk.of) || null,
        duration: f.duration || 0,
        bitrate: f.bitrate || 0,
        sampleRate: f.sampleRate || 0,
        codec: f.codec || f.container || null,
        lossless: !!f.lossless,
      };
      const pic = typeof parser.selectCover === 'function' ? parser.selectCover(c.picture) : (c.picture && c.picture[0]);
      if (pic && pic.data) {
        embeddedCover = { buffer: Buffer.from(pic.data), format: pic.format || 'image/jpeg', source: 'embedded' };
      }
    } catch {}
  }

  const folderCover = filePath && fs.existsSync(path.dirname(filePath))
    ? findFolderCover(path.dirname(filePath))
    : null;

  const ext = path.extname(filePath).toLowerCase();
  const isVideoContainer = VIDEO_CONTAINERS.has(ext) || !!(probed && probed.hasVideoFrame);

  return {
    id: track.id,
    filePath,
    ext,
    isVideoContainer,
    hasExistingArt: !!track.artId,
    hasEmbeddedArt: !!(embeddedCover || (probed && (probed.hasAttachedPic || probed.hasVideoFrame))),
    hasFolderArt: !!(folderCover && folderCover.data),
    embeddedCover,
    folderCover: folderCover && folderCover.data
      ? { buffer: Buffer.from(folderCover.data), format: folderCover.format || 'image/jpeg', source: 'folder' }
      : null,
    current: {
      title: track.title || null,
      artist: track.artist || null,
      albumArtist: track.albumArtist || null,
      album: track.album || null,
      year: track.year || null,
      genre: track.genre || null,
      composer: track.composer || null,
      trackNumber: track.trackNumber || null,
      trackTotal: track.trackTotal || null,
      discNumber: track.discNumber || null,
      discTotal: track.discTotal || null,
      duration: track.duration || (probed && probed.duration) || (mmTags && mmTags.duration) || 0,
    },
    pathGuess,
    sidecar,
    probed,
    mmTags,
  };
}

/**
 * Deterministic baseline synthesis combining current tags, container probe,
 * sidecar files, path structure, and open-source lookups (MusicBrainz / LRCLIB).
 */
function buildBaselineProposal(inspection, openData = {}) {
  const cur = inspection.current || {};
  const mm = inspection.mmTags || {};
  const pr = inspection.probed || {};
  const sc = inspection.sidecar || {};
  const pg = inspection.pathGuess || {};
  const mb = openData.musicbrainz || {};
  const lrc = openData.lrclib || {};

  const pickBestText = (candidates, placeholders = []) => {
    for (const val of candidates) {
      if (!isMissingValue(val, placeholders)) return String(val).trim();
    }
    return null;
  };

  // For title: if current title is noisy or just a raw filename, prefer cleaned title or MB/sidecar/path
  const rawTitle = !isNoisyTitle(cur.title, inspection.filePath)
    ? cur.title
    : pickBestText([
      sc.title,
      mb.title,
      lrc.title,
      mm.title && !isNoisyTitle(mm.title, inspection.filePath) ? mm.title : null,
      pr.title && !isNoisyTitle(pr.title, inspection.filePath) ? pr.title : null,
      pg.title,
      cleanMediaTitle(cur.title),
    ]);

  const title = cleanMediaTitle(rawTitle || cur.title || 'Unknown Title') || cur.title;

  const artist = pickBestText(
    [sc.artist, mm.artist, pr.artist, cur.artist, mb.artist, lrc.artist, pg.artist],
    ['Unknown Artist', 'Cloud Stream']
  ) || cur.artist || 'Unknown Artist';

  const album = pickBestText(
    [sc.album, mm.album, pr.album, cur.album, mb.album, lrc.album, pg.album],
    ['Unknown Album', 'Imported Playlist']
  ) || cur.album || 'Unknown Album';

  const albumArtist = pickBestText(
    [sc.albumArtist, mm.albumArtist, pr.albumArtist, cur.albumArtist, mb.albumArtist, artist],
    ['Unknown Artist', 'Cloud Stream']
  );

  const year = cur.year || sc.year || mm.year || pr.year || mb.year || pg.year || null;
  const genre = pickBestText([cur.genre, sc.genre, mm.genre, pr.genre, mb.genre]);
  const composer = pickBestText([cur.composer, sc.composer, mm.composer, pr.composer]);
  const trackNumber = cur.trackNumber || sc.trackNumber || mm.trackNumber || pr.trackNumber || mb.trackNumber || pg.trackNumber || null;
  const trackTotal = cur.trackTotal || mm.trackTotal || pr.trackTotal || mb.trackTotal || null;
  const discNumber = cur.discNumber || mm.discNumber || pr.discNumber || mb.discNumber || pg.discNumber || null;
  const discTotal = cur.discTotal || mm.discTotal || pr.discTotal || null;

  let coverAction = 'keep';
  if (!inspection.hasExistingArt) {
    if (inspection.hasEmbeddedArt) coverAction = 'embedded';
    else if (inspection.hasFolderArt) coverAction = 'folder';
    else if (mb.releaseMbid) coverAction = 'caa';
    else if (inspection.filePath && fs.existsSync(inspection.filePath)) coverAction = 'waveform';
    else coverAction = 'generated';
  }

  return {
    id: inspection.id,
    title,
    artist,
    albumArtist,
    album,
    year: year ? Number(year) : null,
    genre: genre || null,
    composer: composer || null,
    trackNumber: trackNumber ? Number(trackNumber) : null,
    trackTotal: trackTotal ? Number(trackTotal) : null,
    discNumber: discNumber ? Number(discNumber) : null,
    discTotal: discTotal ? Number(discTotal) : null,
    coverAction,
    releaseMbid: mb.releaseMbid || null,
    reason: 'Inferred from open-source container probe, path/sidecars, and MusicBrainz/LRCLIB',
  };
}

/**
 * Build the prompt sent to the RobOS AI agent, resolving any @skill(...) tokens.
 */
function buildAgentFixPrompt({ userPrompt, inspections, openDataByTrackId, baselines }) {
  const rawPrompt = String(userPrompt || DEFAULT_FIX_METADATA_PROMPT).trim();
  const skillCatalog = getSkillCatalog();
  const expandedUserPrompt = typeof skillCatalog.resolveSkillReferences === 'function'
    ? skillCatalog.resolveSkillReferences(rawPrompt)
    : rawPrompt;

  const trackLines = inspections.map((ins) => {
    const base = baselines.get(ins.id) || {};
    const od = openDataByTrackId.get(ins.id) || {};
    return JSON.stringify({
      id: ins.id,
      file: path.basename(ins.filePath || ''),
      dir: path.basename(path.dirname(ins.filePath || '')),
      ext: ins.ext,
      hasArt: ins.hasExistingArt,
      hasEmbeddedArt: ins.hasEmbeddedArt,
      hasFolderArt: ins.hasFolderArt,
      current: ins.current,
      pathGuess: ins.pathGuess,
      sidecar: Object.keys(ins.sidecar || {}).length ? ins.sidecar : undefined,
      probed: ins.probed ? {
        title: ins.probed.title,
        artist: ins.probed.artist,
        album: ins.probed.album,
        year: ins.probed.year,
        genre: ins.probed.genre,
        trackNumber: ins.probed.trackNumber,
        codec: ins.probed.codec,
      } : undefined,
      musicbrainz: od.musicbrainz || undefined,
      lrclib: od.lrclib || undefined,
      baselineSuggestion: base,
    });
  });

  return [
    'You are the RobOS Audio Player Open-Source Media Metadata & Artwork Agent.',
    'Follow the user request and the attached skill guidelines to normalize and enrich track metadata and artwork.',
    '',
    'User Request & Skill Instructions:',
    expandedUserPrompt,
    '',
    `Tracks to inspect (${inspections.length}):`,
    trackLines.join('\n'),
    '',
    'Reply ONLY with a valid JSON object (no prose outside JSON):',
    '{',
    '  "summary": "1-2 sentence explanation of fixes applied",',
    '  "fixes": [',
    '    {',
    '      "id": "<track id from above>",',
    '      "title": "<clean canonical title>",',
    '      "artist": "<canonical artist>",',
    '      "albumArtist": "<canonical album artist>",',
    '      "album": "<canonical album>",',
    '      "year": 2001,',
    '      "genre": "<genre or null>",',
    '      "composer": "<composer or null>",',
    '      "trackNumber": 1,',
    '      "trackTotal": 12,',
    '      "discNumber": 1,',
    '      "discTotal": 1,',
    '      "coverAction": "keep" | "embedded" | "folder" | "caa" | "waveform" | "generated",',
    '      "releaseMbid": "<optional MusicBrainz release UUID>",',
    '      "reason": "<brief explanation>"',
    '    }',
    '  ]',
    '}',
  ].join('\n');
}

function extractJsonObject(text) {
  if (!text) return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function diffFields(before, after, hasNewCover = false) {
  const fields = ['title', 'artist', 'albumArtist', 'album', 'year', 'genre', 'composer', 'trackNumber', 'trackTotal', 'discNumber', 'discTotal'];
  const changes = [];
  for (const f of fields) {
    const b = before[f] ?? null;
    const a = after[f] ?? null;
    if (a != null && String(a).trim() !== '' && String(a) !== String(b ?? '')) {
      changes.push({ field: f, from: b, to: a });
    }
  }
  if (hasNewCover) {
    changes.push({ field: 'artwork', from: before.artId ? 'Existing cover' : 'Missing', to: after.coverAction || 'New cover' });
  }
  return changes;
}

/**
 * Resolve or synthesize cover art according to `coverAction` and store in mediaLibrary.
 */
async function resolveCoverArtForFix({ fix, inspection, mediaLibrary, fetchCaa = fetchCoverArtArchive, execFn = execFileAsync }) {
  const action = fix.coverAction || (inspection.hasExistingArt ? 'keep' : 'generated');
  if (action === 'keep' && inspection.hasExistingArt) return null;

  let artObj = null;

  // 1. Embedded cover (from music-metadata or ffmpeg stream/video frame)
  if (action === 'embedded' || (!artObj && inspection.hasEmbeddedArt && action !== 'generated' && action !== 'waveform')) {
    if (inspection.embeddedCover && inspection.embeddedCover.buffer) {
      artObj = inspection.embeddedCover;
    } else if (inspection.filePath) {
      artObj = await extractCoverWithFfmpeg(inspection.filePath, {
        duration: inspection.current.duration,
        isVideo: inspection.isVideoContainer,
      }, execFn);
    }
  }

  // 2. Folder cover (cover.jpg / folder.png)
  if (!artObj && (action === 'folder' || (!inspection.hasExistingArt && inspection.hasFolderArt && action !== 'generated'))) {
    if (inspection.folderCover && inspection.folderCover.buffer) {
      artObj = inspection.folderCover;
    }
  }

  // 3. Cover Art Archive (Internet Archive + MusicBrainz CC0 release MBID)
  if (!artObj && (action === 'caa' || fix.releaseMbid)) {
    artObj = await fetchCaa(fix.releaseMbid);
  }

  // 4. FFmpeg open-source waveform cover
  if (!artObj && action === 'waveform') {
    artObj = await generateWaveformCover(inspection.filePath, {
      title: fix.title,
      artist: fix.artist,
      album: fix.album,
    }, execFn);
  }

  // 5. Fallback to deterministic open-source SVG album cover if cover was requested
  if (!artObj && action !== 'keep') {
    artObj = generateSvgAlbumCover({
      title: fix.title,
      artist: fix.artist,
      album: fix.album,
    });
  }

  if (!artObj || !artObj.buffer) return null;

  const artId = generateArtId(artObj.buffer);
  if (mediaLibrary && typeof mediaLibrary.storeArt === 'function') {
    // Store SVG as PNG/JPG-servable or raw buffer in mediaLibrary
    mediaLibrary.storeArt(artId, artObj.buffer, artObj.format || 'image/jpeg');
  }
  return {
    artId,
    buffer: artObj.buffer,
    format: artObj.format || 'image/jpeg',
    source: artObj.source || action,
  };
}

/**
 * Losslessly write metadata tags (and optional raster cover art) to a local audio file via FFmpeg.
 */
async function writeMetadataWithFfmpeg(filePath, metadata = {}, art = null, execFn = execFileAsync) {
  if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: 'File does not exist locally' };
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_MEDIA_EXTENSIONS.has(ext)) {
    return { ok: false, error: `Unsupported container extension: ${ext}` };
  }

  const dir = path.dirname(filePath);
  const tmpOut = path.join(dir, `.robos-meta-tmp-${process.pid}-${Date.now()}${ext}`);
  let tmpCover = null;

  try {
    const args = ['-y', '-v', 'error', '-i', filePath];
    const canEmbedCover = art && art.buffer && (art.format === 'image/jpeg' || art.format === 'image/png')
      && ['.mp3', '.flac', '.m4a', '.mp4', '.ogg', '.opus'].includes(ext);

    if (canEmbedCover) {
      const coverExt = art.format === 'image/png' ? '.png' : '.jpg';
      tmpCover = path.join(os.tmpdir(), `robos-embed-cover-${process.pid}-${Date.now()}${coverExt}`);
      fs.writeFileSync(tmpCover, art.buffer);
      args.push('-i', tmpCover, '-map', '0:a', '-map', '1:v', '-c', 'copy');
      if (ext === '.mp3') args.push('-id3v2_version', '3');
      args.push(
        '-metadata:s:v', 'title=Album cover',
        '-metadata:s:v', 'comment=Cover (front)',
        '-disposition:v:0', 'attached_pic'
      );
    } else {
      args.push('-map', '0', '-c', 'copy');
      if (ext === '.mp3') args.push('-id3v2_version', '3');
      if (ext === '.wav') args.push('-write_id3v2', '1');
    }

    const setMeta = (key, val) => {
      if (val != null && String(val).trim() !== '') {
        args.push('-metadata', `${key}=${String(val).trim()}`);
      }
    };

    setMeta('title', metadata.title);
    setMeta('artist', metadata.artist);
    setMeta('album_artist', metadata.albumArtist);
    setMeta('album', metadata.album);
    setMeta('date', metadata.year);
    setMeta('genre', metadata.genre);
    setMeta('composer', metadata.composer);
    if (metadata.trackNumber) {
      const trk = metadata.trackTotal ? `${metadata.trackNumber}/${metadata.trackTotal}` : String(metadata.trackNumber);
      setMeta('track', trk);
    }
    if (metadata.discNumber) {
      const dsk = metadata.discTotal ? `${metadata.discNumber}/${metadata.discTotal}` : String(metadata.discNumber);
      setMeta('disc', dsk);
    }

    args.push(tmpOut);
    await execFn('ffmpeg', args, { timeout: 15000 });

    if (fs.existsSync(tmpOut) && fs.statSync(tmpOut).size > 0) {
      fs.renameSync(tmpOut, filePath);
      return { ok: true };
    }
    return { ok: false, error: 'FFmpeg produced an empty output file' };
  } catch (err) {
    try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch {}
    return { ok: false, error: err.message };
  } finally {
    try { if (tmpCover && fs.existsSync(tmpCover)) fs.unlinkSync(tmpCover); } catch {}
  }
}

/**
 * Preview AI Metadata Fixes for a batch of tracks:
 * 1. Probes local containers/streams, sidecars, and folder cover art
 * 2. Queries open-source MusicBrainz / LRCLIB for tracks needing enrichment
 * 3. Sends prompt + skill context + track inspections to the selected RobOS agent
 * 4. Resolves/generates cover art previews and returns a structured diff preview
 */
async function previewAiMetadataFixes({
  tracks = [],
  prompt = DEFAULT_FIX_METADATA_PROMPT,
  providerId = null,
  mediaLibrary = null,
  enableOpenLookup = true,
  maxTracks = 40,
  onProgress = () => {},
  askFn = null,
  lookupMbFn = lookupMusicBrainz,
  lookupLrcFn = lookupLrclib,
  fetchCaaFn = fetchCoverArtArchive,
  execFn = execFileAsync,
} = {}) {
  const batch = (Array.isArray(tracks) ? tracks : []).filter(Boolean).slice(0, maxTracks);
  if (!batch.length) {
    throw new Error('No tracks selected to inspect.');
  }

  const ask = askFn || getOneShot().ask;
  if (typeof ask !== 'function') {
    throw new Error('No AI agent client available. Open RobOS Agents to configure a provider.');
  }

  onProgress({ stage: 'probing', message: `Probing ${batch.length} media file${batch.length === 1 ? '' : 's'} (music-metadata, ffprobe, sidecars)…` });

  const parser = mediaLibrary && typeof mediaLibrary._getParser === 'function'
    ? await mediaLibrary._getParser().catch(() => null)
    : null;

  const inspections = [];
  for (let i = 0; i < batch.length; i++) {
    const t = batch[i];
    const ins = await inspectTrackMedia(t, { parser, execFn });
    inspections.push(ins);
  }

  const openDataByTrackId = new Map();
  const baselines = new Map();

  // Perform open-source MusicBrainz / LRCLIB lookups for tracks missing info (cap at 12 network lookups per batch for speed)
  const lookupCap = enableOpenLookup ? Math.min(inspections.length, 12) : 0;
  if (lookupCap > 0) {
    onProgress({ stage: 'open-lookup', message: 'Querying open-source MusicBrainz & LRCLIB databases…' });
  }

  for (let i = 0; i < inspections.length; i++) {
    const ins = inspections[i];
    const od = {};
    if (i < lookupCap) {
      const qTitle = ins.sidecar.title || ins.pathGuess.title || ins.current.title;
      const qArtist = !isMissingValue(ins.current.artist, ['Unknown Artist', 'Cloud Stream'])
        ? ins.current.artist
        : (ins.sidecar.artist || ins.pathGuess.artist);
      const qAlbum = !isMissingValue(ins.current.album, ['Unknown Album', 'Imported Playlist'])
        ? ins.current.album
        : (ins.sidecar.album || ins.pathGuess.album);

      const [mb, lrc] = await Promise.all([
        lookupMbFn({ title: qTitle, artist: qArtist, album: qAlbum, duration: ins.current.duration }).catch(() => null),
        lookupLrcFn({ title: qTitle, artist: qArtist }).catch(() => null),
      ]);
      if (mb) od.musicbrainz = mb;
      if (lrc) od.lrclib = lrc;
    }
    openDataByTrackId.set(ins.id, od);
    baselines.set(ins.id, buildBaselineProposal(ins, od));
  }

  const fullPrompt = buildAgentFixPrompt({
    userPrompt: prompt || DEFAULT_FIX_METADATA_PROMPT,
    inspections,
    openDataByTrackId,
    baselines,
  });

  onProgress({ stage: 'thinking', message: 'RobOS Agent is analyzing media tags, paths, and artwork…' });

  const callAsk = async () => {
    if (askFn) {
      return askFn(fullPrompt, { providerId: providerId || undefined, timeoutMs: 120000 });
    }
    return ask({
      provider: providerId || undefined,
      prompt: fullPrompt,
      timeoutMs: 120000,
    });
  };

  const res = await callAsk();
  if (!res || !res.ok) {
    throw new Error((res && res.error) || 'AI agent did not return a response.');
  }

  const parsed = extractJsonObject(res.text);
  const agentFixesById = new Map();
  if (parsed && Array.isArray(parsed.fixes)) {
    for (const f of parsed.fixes) {
      if (f && f.id) agentFixesById.set(f.id, f);
    }
  }

  onProgress({ stage: 'artwork', message: 'Preparing cover art previews…' });

  const proposals = [];
  for (let i = 0; i < batch.length; i++) {
    const track = batch[i];
    const ins = inspections[i];
    const base = baselines.get(track.id) || {};
    const ag = agentFixesById.get(track.id) || {};

    const merged = {
      id: track.id,
      filePath: track.filePath,
      title: cleanMediaTitle(ag.title || base.title || track.title) || track.title,
      artist: ag.artist || base.artist || track.artist || 'Unknown Artist',
      albumArtist: ag.albumArtist || base.albumArtist || track.albumArtist || null,
      album: ag.album || base.album || track.album || 'Unknown Album',
      year: Number(ag.year || base.year || track.year) || null,
      genre: ag.genre || base.genre || track.genre || null,
      composer: ag.composer || base.composer || track.composer || null,
      trackNumber: Number(ag.trackNumber || base.trackNumber || track.trackNumber) || null,
      trackTotal: Number(ag.trackTotal || base.trackTotal || track.trackTotal) || null,
      discNumber: Number(ag.discNumber || base.discNumber || track.discNumber) || null,
      discTotal: Number(ag.discTotal || base.discTotal || track.discTotal) || null,
      coverAction: ag.coverAction || base.coverAction || 'keep',
      releaseMbid: ag.releaseMbid || base.releaseMbid || null,
      reason: ag.reason || base.reason || 'Normalized metadata',
    };

    const resolvedArt = await resolveCoverArtForFix({
      fix: merged,
      inspection: ins,
      mediaLibrary,
      fetchCaa: fetchCaaFn,
      execFn,
    });

    const nextArtId = (resolvedArt && resolvedArt.artId) || track.artId || null;
    const hasNewCover = !!(resolvedArt && resolvedArt.artId && resolvedArt.artId !== track.artId);
    const changes = diffFields(track, merged, hasNewCover);

    proposals.push({
      id: track.id,
      filePath: track.filePath,
      before: {
        title: track.title,
        artist: track.artist,
        albumArtist: track.albumArtist || null,
        album: track.album,
        year: track.year || null,
        genre: track.genre || null,
        composer: track.composer || null,
        trackNumber: track.trackNumber || null,
        trackTotal: track.trackTotal || null,
        discNumber: track.discNumber || null,
        discTotal: track.discTotal || null,
        artId: track.artId || null,
      },
      after: {
        title: merged.title,
        artist: merged.artist,
        albumArtist: merged.albumArtist,
        album: merged.album,
        year: merged.year,
        genre: merged.genre,
        composer: merged.composer,
        trackNumber: merged.trackNumber,
        trackTotal: merged.trackTotal,
        discNumber: merged.discNumber,
        discTotal: merged.discTotal,
        artId: nextArtId,
        coverAction: merged.coverAction,
        coverSource: resolvedArt ? resolvedArt.source : (track.artId ? 'existing' : null),
      },
      changes,
      changed: changes.length > 0,
      reason: merged.reason,
    });
  }

  return {
    ok: true,
    summary: (parsed && parsed.summary) || `Inspected ${proposals.length} track${proposals.length === 1 ? '' : 's'} with open-source media tools.`,
    providerId: res.providerId,
    proposals,
  };
}

/**
 * Apply approved metadata & artwork fixes to MediaLibrary, playlists, and optionally local files on disk.
 */
async function applyAiMetadataFixes({
  fixes = [],
  writeFiles = false,
  mediaLibrary,
  execFn = execFileAsync,
} = {}) {
  if (!mediaLibrary) throw new Error('MediaLibrary instance required');
  const list = Array.isArray(fixes) ? fixes : [];
  const byId = new Map(mediaLibrary.tracks.map(t => [t.id, t]));
  const updatedTracks = [];
  const fileWriteResults = [];

  for (const fix of list) {
    if (!fix || !fix.id) continue;
    const track = byId.get(fix.id);
    if (!track) continue;

    const after = fix.after || fix;
    const fields = ['title', 'artist', 'albumArtist', 'album', 'year', 'genre', 'composer', 'trackNumber', 'trackTotal', 'discNumber', 'discTotal', 'artId'];
    for (const f of fields) {
      if (after[f] !== undefined && after[f] !== null && String(after[f]).trim() !== '') {
        track[f] = after[f];
      }
    }

    if (writeFiles && track.filePath && !track.cloud && fs.existsSync(track.filePath)) {
      const art = track.artId ? mediaLibrary.getArt(track.artId) : null;
      const writeRes = await writeMetadataWithFfmpeg(track.filePath, track, art, execFn);
      fileWriteResults.push({ id: track.id, filePath: track.filePath, ...writeRes });
    }

    updatedTracks.push(track);
  }

  // Also propagate updated metadata to any playlists containing these tracks
  if (updatedTracks.length && Array.isArray(mediaLibrary.playlists)) {
    const updatedMap = new Map(updatedTracks.map(t => [t.id, t]));
    let plChanged = false;
    for (const pl of mediaLibrary.playlists) {
      if (!Array.isArray(pl.tracks)) continue;
      for (let i = 0; i < pl.tracks.length; i++) {
        const pt = pl.tracks[i];
        const fresh = pt && updatedMap.get(pt.id);
        if (fresh) {
          pl.tracks[i] = { ...pt, ...fresh };
          plChanged = true;
        }
      }
    }
    if (plChanged && typeof mediaLibrary._savePlaylists === 'function') {
      mediaLibrary._savePlaylists();
    }
  }

  if (updatedTracks.length) {
    mediaLibrary._rebuildIndexes();
    mediaLibrary._saveCache();
  }

  return {
    ok: true,
    updatedCount: updatedTracks.length,
    tracks: updatedTracks,
    fileWriteResults,
    library: mediaLibrary.getLibrary(),
  };
}

module.exports = {
  DEFAULT_SKILL_TOKEN,
  DEFAULT_FIX_METADATA_PROMPT,
  SUPPORTED_MEDIA_EXTENSIONS,
  cleanMediaTitle,
  trackNeedsMetadataFix,
  readSidecarMetadata,
  probeWithFfprobe,
  extractCoverWithFfmpeg,
  generateWaveformCover,
  generateSvgAlbumCover,
  lookupMusicBrainz,
  fetchCoverArtArchive,
  lookupLrclib,
  inspectTrackMedia,
  buildBaselineProposal,
  buildAgentFixPrompt,
  previewAiMetadataFixes,
  applyAiMetadataFixes,
  writeMetadataWithFfmpeg,
};
