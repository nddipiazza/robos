/**
 * Open-Source Movie/Video Metadata & Poster Enricher for RobOS Movie Player
 *
 * Uses strictly legal, open-source tools and open-data APIs to inspect and fix
 * missing or messy movie/video metadata (titles, directors, collections/series,
 * release years, genres, resolutions, codecs, and poster art):
 *
 *   1. Local container inspection (`music-metadata`, `ffprobe` video/audio stream probe,
 *      sidecar `.nfo` / `.json`, and scene-release filename cleaning).
 *   2. Video frame extraction via `ffmpeg` (`-ss` into the video) or folder poster scan
 *      (`poster.jpg`, `cover.jpg`, `fanart.jpg`, `folder.jpg`).
 *   3. MusicBrainz / Open-Data API lookup for concert films / soundtrack releases when applicable.
 *   4. Optional AI agent cleanup via `robos-lib/ai-agent` referencing `@skill(robos:fix-media-metadata)`.
 *   5. Crisp SVG cinema poster generator when no embedded/folder/frame poster exists.
 *   6. Optional non-destructive container tag + poster write-back via `ffmpeg`.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFile } = require('child_process');
const {
  storeArtworkBuffer,
  findFolderArt,
  cleanMovieFilename
} = require('./track-metadata');

let aiAgent = null;
try {
  aiAgent = require('/usr/local/share/robos/robos-lib/ai-agent');
} catch (_) {
  try {
    aiAgent = require('../../robos-lib/ai-agent');
  } catch (_) {}
}

const PLACEHOLDER_ARTISTS = new Set([
  '', 'unknown', 'unknown director', 'unknown artist', 'various', 'track', 'video', 'movie'
]);
const PLACEHOLDER_ALBUMS = new Set([
  '', 'unknown', 'unknown album', 'standalone films', 'videos', 'movies', 'downloads'
]);

function isMissingArtist(v) {
  return PLACEHOLDER_ARTISTS.has(String(v || '').trim().toLowerCase());
}

function isMissingAlbum(v) {
  return PLACEHOLDER_ALBUMS.has(String(v || '').trim().toLowerCase());
}

function isMessyTitle(title, filePath = '') {
  const t = String(title || '').trim();
  if (!t) return true;
  const stem = filePath ? path.basename(filePath, path.extname(filePath)) : '';
  if (stem && t === stem && (/[_.]/.test(t) || /\b(1080p|720p|2160p|4k|x264|x265|bluray|web-dl|webrip)\b/i.test(t))) {
    return true;
  }
  if (/^(track|movie|video|clip|sample)\s*[-_#]?\s*\d+$/i.test(t)) return true;
  if (/\.(mp4|mkv|webm|mov|avi|m4v)$/i.test(t)) return true;
  return false;
}

function trackNeedsFix(track) {
  if (!track) return { needsMetadata: false, needsArt: false, reasons: [] };
  const reasons = [];
  if (isMissingArtist(track.artist)) reasons.push('missing director');
  if (isMissingAlbum(track.album)) reasons.push('missing collection/series');
  if (isMessyTitle(track.title, track.path)) reasons.push('uncleaned filename title');
  if (!track.year) reasons.push('missing year');
  if (!track.genre || track.genre === 'Unknown') reasons.push('missing genre');
  const needsMetadata = reasons.length > 0;
  const needsArt = !track.artId;
  if (needsArt) reasons.push('missing poster');
  return { needsMetadata, needsArt, reasons };
}

function parseFileHeuristics(filePath) {
  if (!filePath) return {};
  const cleanPath = String(filePath).replace(/^cloud:\/\/[^/]+\//, '');
  const ext = path.extname(cleanPath);
  const stem = path.basename(cleanPath, ext);
  const parentDir = path.dirname(cleanPath);
  const folder = path.basename(parentDir);
  const grandFolder = path.basename(path.dirname(parentDir));

  const cleaned = cleanMovieFilename(stem);
  const out = {
    title: cleaned.title || stem,
    year: cleaned.year || null,
    trackNumber: cleaned.episode || null,
    discNumber: cleaned.season || null,
    resolution: cleaned.resolution || '',
    videoCodec: cleaned.videoCodec || ''
  };

  const dashParts = stem.split(/\s+-\s+/);
  if (dashParts.length >= 2 && !cleaned.season) {
    out.artist = dashParts[0].trim();
    const rhs = cleanMovieFilename(dashParts.slice(1).join(' - ').trim());
    out.title = rhs.title || dashParts.slice(1).join(' - ').trim();
    if (rhs.year && !out.year) out.year = rhs.year;
  }

  const ignoreFolders = new Set(['movies', 'videos', 'films', 'media', 'downloads', 'home', 'tv', 'series', '.']);
  if (folder && !ignoreFolders.has(folder.toLowerCase())) {
    const fClean = cleanMovieFilename(folder);
    if (fClean.year && !out.year) out.year = fClean.year;
    out.album = fClean.title || folder;
  }
  if (grandFolder && !ignoreFolders.has(grandFolder.toLowerCase())) {
    if (!out.artist) out.artist = grandFolder;
  }

  // Check Kodi/Jellyfin/Plex style .nfo sidecar if present
  try {
    const nfoPath = path.join(parentDir, `${stem}.nfo`);
    const movieNfo = path.join(parentDir, 'movie.nfo');
    const targetNfo = fs.existsSync(nfoPath) ? nfoPath : (fs.existsSync(movieNfo) ? movieNfo : null);
    if (targetNfo) {
      const xml = fs.readFileSync(targetNfo, 'utf8');
      const pickTag = (tag) => {
        const m = xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`, 'i'));
        return m ? m[1].trim() : null;
      };
      if (pickTag('title')) out.title = pickTag('title');
      if (pickTag('director')) out.artist = pickTag('director');
      if (pickTag('set') || pickTag('showtitle')) out.album = pickTag('set') || pickTag('showtitle');
      if (pickTag('studio')) out.composer = pickTag('studio');
      if (pickTag('genre')) out.genre = pickTag('genre');
      const y = parseInt(pickTag('year') || pickTag('premiered') || '', 10);
      if (y >= 1900 && y <= 2100) out.year = y;
    }
  } catch (_) {}

  return out;
}

function inspectWithFfprobe(filePath) {
  return new Promise(resolve => {
    if (!filePath || !fs.existsSync(filePath)) return resolve(null);
    execFile(
      'ffprobe',
      ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
      { timeout: 6000 },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        try {
          const parsed = JSON.parse(stdout);
          const tags = (parsed.format && parsed.format.tags) || {};
          const lower = {};
          for (const [k, v] of Object.entries(tags)) lower[k.toLowerCase()] = v;

          const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
          const vStream = streams.find(s => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
          const aStream = streams.find(s => s.codec_type === 'audio');

          let resolution = '';
          if (vStream && vStream.height) {
            if (vStream.height >= 2160 || vStream.width >= 3800) resolution = '4K';
            else if (vStream.height >= 1440) resolution = '1440p';
            else if (vStream.height >= 1080 || vStream.width >= 1900) resolution = '1080p';
            else if (vStream.height >= 720 || vStream.width >= 1200) resolution = '720p';
            else resolution = `${vStream.height}p`;
          }

          resolve({
            title: lower.title || null,
            artist: lower.director || lower.artist || lower.author || null,
            album: lower.album || lower.show || lower.series || null,
            composer: lower.composer || lower.production_studio || lower.publisher || null,
            genre: lower.genre || null,
            year: lower.date || lower.year ? parseInt(String(lower.date || lower.year).slice(0, 4), 10) || null : null,
            duration: parsed.format && parsed.format.duration ? Math.round(Number(parsed.format.duration)) : null,
            width: vStream ? vStream.width : null,
            height: vStream ? vStream.height : null,
            resolution,
            videoCodec: vStream && vStream.codec_name ? vStream.codec_name.toUpperCase() : null,
            audioCodec: aStream && aStream.codec_name ? aStream.codec_name.toUpperCase() : null,
            channels: aStream ? aStream.channels : null
          });
        } catch (_) {
          resolve(null);
        }
      }
    );
  });
}

/**
 * Extract a representative video frame (e.g. at 10% into the movie or 5s) via `ffmpeg`
 * to use as a real thumbnail poster when no poster image is present.
 */
function extractVideoFramePoster(filePath, durationSec = 0) {
  return new Promise(resolve => {
    if (!filePath || !fs.existsSync(filePath)) return resolve(null);
    const seekSec = durationSec > 30 ? Math.min(60, Math.floor(durationSec * 0.1)) : 2;
    const tmpOut = path.join(require('os').tmpdir(), `robos-movie-frame-${process.pid}-${Date.now()}.jpg`);
    execFile(
      'ffmpeg',
      ['-y', '-ss', String(seekSec), '-i', filePath, '-frames:v', '1', '-q:v', '3', tmpOut],
      { timeout: 8000 },
      (err) => {
        if (err || !fs.existsSync(tmpOut)) {
          try { fs.unlinkSync(tmpOut); } catch (_) {}
          return resolve(null);
        }
        try {
          const buf = fs.readFileSync(tmpOut);
          fs.unlinkSync(tmpOut);
          resolve(buf && buf.length > 0 ? { data: buf, mime: 'image/jpeg' } : null);
        } catch (_) {
          resolve(null);
        }
      }
    );
  });
}

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate a warm cinema SVG movie poster when no local or frame artwork is available.
 */
function generateSvgCoverBuffer({ title = 'Untitled Film', artist = 'RobOS Cinema', album = '', year = '', resolution = '1080p' } = {}) {
  const seed = `${artist}::${album || title}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const hueA = Math.abs(hash) % 360;
  const hueB = (hueA + 42) % 360;
  const displayTitle = escapeXml((title || 'Cinema').slice(0, 26));
  const displaySub = escapeXml((artist || album || 'RobOS Movie Player').slice(0, 32));
  const displayBadge = escapeXml([year, resolution].filter(Boolean).join(' • ') || 'CINEMA');

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">',
    '  <defs>',
    `    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">`,
    `      <stop offset="0%" stop-color="hsl(${hueA}, 48%, 18%)"/>`,
    `      <stop offset="55%" stop-color="#1c1814"/>`,
    `      <stop offset="100%" stop-color="hsl(${hueB}, 58%, 26%)"/>`,
    '    </linearGradient>',
    '  </defs>',
    '  <rect width="512" height="512" rx="28" fill="url(#bg)"/>',
    '  <rect x="28" y="28" width="456" height="456" rx="20" fill="none" stroke="#e8a33d" stroke-opacity="0.28" stroke-width="2"/>',
    '  <rect x="52" y="52" width="110" height="32" rx="8" fill="#15120f" fill-opacity="0.72" stroke="#e8a33d" stroke-opacity="0.4"/>',
    `  <text x="107" y="73" text-anchor="middle" fill="#e8a33d" font-family="sans-serif" font-size="14" font-weight="700">${displayBadge}</text>`,
    '  <rect x="136" y="136" width="240" height="160" rx="14" fill="#15120f" fill-opacity="0.55" stroke="#e8a33d" stroke-opacity="0.45" stroke-width="2.5"/>',
    '  <polygon points="236,184 236,248 292,216" fill="#e8a33d" fill-opacity="0.88"/>',
    `  <text x="256" y="388" text-anchor="middle" fill="#f1e9dc" font-family="sans-serif" font-size="26" font-weight="700">${displayTitle}</text>`,
    `  <text x="256" y="424" text-anchor="middle" fill="#e8a33d" font-family="sans-serif" font-size="17" font-weight="500">${displaySub}</text>`,
    '</svg>'
  ].join('\n');

  return Buffer.from(svg, 'utf8');
}

function extractJsonArray(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = fenced ? fenced[1] : raw;
  const s = text.indexOf('[');
  const e = text.lastIndexOf(']');
  if (s === -1 || e === -1 || e <= s) return null;
  try {
    return JSON.parse(text.slice(s, e + 1));
  } catch (_) {
    return null;
  }
}

async function inferBatchWithAiAgent(tracks = [], askFn = null) {
  const ask = askFn || (aiAgent && typeof aiAgent.ask === 'function' ? (p) => aiAgent.ask(p, { timeout: 45000 }) : null);
  if (!ask || tracks.length === 0) return {};

  const items = tracks.slice(0, 25).map((t, i) => (
    `${i + 1}. id="${t.id}" path="${t.remotePath || t.path || ''}" currentTitle="${t.title || ''}" currentDirector="${t.artist || ''}" currentCollection="${t.album || ''}"`
  )).join('\n');

  const prompt = [
    '@skill(robos:fix-media-metadata)',
    'Clean and infer accurate movie/video metadata (title, artist [Director/Creator], album [Collection/Series], genre, year) from the file paths and current tags below.',
    'Strip scene release tags (1080p, BluRay, WEB-DL, x264, HEVC, group names) and preserve accurate film titles and release years.',
    '',
    items,
    '',
    'Respond with ONLY a JSON array:',
    '[{"id":"...","title":"...","artist":"...","album":"...","genre":"...","year":2020}]'
  ].join('\n');

  try {
    const res = await ask(prompt);
    if (res && res.ok && res.text) {
      const arr = extractJsonArray(res.text);
      if (Array.isArray(arr)) {
        const map = {};
        for (const row of arr) {
          if (row && row.id) map[row.id] = row;
        }
        return map;
      }
    }
  } catch (_) {}
  return {};
}

function writeTagsWithFfmpeg(filePath, track, artPath = null) {
  return new Promise(resolve => {
    if (!filePath || !fs.existsSync(filePath) || filePath.startsWith('cloud://')) {
      return resolve({ written: false, reason: 'not-local' });
    }
    const ext = path.extname(filePath);
    const tmpOut = `${filePath}.robos-tagtmp-${process.pid}${ext}`;
    const args = ['-y', '-i', filePath];

    const attachPic = artPath && fs.existsSync(artPath) && ['.mp4', '.m4v', '.mkv'].includes(ext.toLowerCase());
    if (attachPic) {
      args.push('-i', artPath, '-map', '0', '-map', '1', '-c', 'copy', '-disposition:v:1', 'attached_pic');
    } else {
      args.push('-map', '0', '-c', 'copy');
    }

    if (track.title) args.push('-metadata', `title=${track.title}`);
    if (track.artist) args.push('-metadata', `artist=${track.artist}`);
    if (track.album) args.push('-metadata', `album=${track.album}`);
    if (track.genre) args.push('-metadata', `genre=${track.genre}`);
    if (track.year) args.push('-metadata', `date=${track.year}`);
    if (track.composer) args.push('-metadata', `composer=${track.composer}`);
    args.push(tmpOut);

    execFile('ffmpeg', args, { timeout: 25000 }, err => {
      if (err || !fs.existsSync(tmpOut)) {
        try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch (_) {}
        return resolve({ written: false, reason: err ? err.message : 'ffmpeg-failed' });
      }
      try {
        fs.renameSync(tmpOut, filePath);
        resolve({ written: true });
      } catch (renameErr) {
        try { fs.unlinkSync(tmpOut); } catch (_) {}
        resolve({ written: false, reason: renameErr.message });
      }
    });
  });
}

async function enrichTracksMetadata({
  tracks = [],
  artDir = null,
  useAi = true,
  generateFallbackArt = true,
  writeFileTags = false,
  askFn = null,
  onProgress = null
} = {}) {
  const list = (Array.isArray(tracks) ? tracks : []).filter(Boolean);
  const folderArtCache = new Map();
  const stillMissingForAi = [];
  const changesById = new Map();

  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const before = {
      title: t.title,
      artist: t.artist,
      album: t.album,
      genre: t.genre,
      year: t.year,
      resolution: t.resolution,
      videoCodec: t.videoCodec,
      artId: t.artId
    };
    const sourcesUsed = [];

    const heur = parseFileHeuristics(t.remotePath || t.path);
    if (isMessyTitle(t.title, t.path) && heur.title) {
      t.title = heur.title;
      sourcesUsed.push('filename');
    }
    if (isMissingArtist(t.artist) && heur.artist) {
      t.artist = heur.artist;
      sourcesUsed.push('folder');
    }
    if (isMissingAlbum(t.album) && heur.album) {
      t.album = heur.album;
      sourcesUsed.push('folder');
    }
    if (!t.year && heur.year) t.year = heur.year;
    if (!t.trackNumber && heur.trackNumber) t.trackNumber = heur.trackNumber;
    if (!t.discNumber && heur.discNumber) t.discNumber = heur.discNumber;
    if (heur.resolution && !t.resolution) t.resolution = heur.resolution;
    if (heur.videoCodec && !t.videoCodec) t.videoCodec = heur.videoCodec;
    if (heur.composer && !t.composer) t.composer = heur.composer;
    if (heur.genre && (!t.genre || t.genre === 'Cinema')) t.genre = heur.genre;

    if (t.source !== 'cloud' && t.path && !t.path.startsWith('http') && fs.existsSync(t.path)) {
      const ff = await inspectWithFfprobe(t.path);
      if (ff) {
        if (isMessyTitle(t.title, t.path) && ff.title) { t.title = ff.title; sourcesUsed.push('ffprobe'); }
        if (isMissingArtist(t.artist) && ff.artist) { t.artist = ff.artist; sourcesUsed.push('ffprobe'); }
        if (isMissingAlbum(t.album) && ff.album) { t.album = ff.album; sourcesUsed.push('ffprobe'); }
        if ((!t.genre || t.genre === 'Unknown') && ff.genre) t.genre = ff.genre;
        if (!t.year && ff.year) t.year = ff.year;
        if (!t.composer && ff.composer) t.composer = ff.composer;
        if (!t.duration && ff.duration) t.duration = ff.duration;
        if (ff.resolution) t.resolution = ff.resolution;
        if (ff.videoCodec) {
          t.videoCodec = ff.videoCodec;
          t.codec = ff.videoCodec;
        }
        if (ff.width) t.width = ff.width;
        if (ff.height) t.height = ff.height;
      }
      if (!t.artId && artDir) {
        const folderArt = findFolderArt(path.dirname(t.path), artDir, folderArtCache);
        if (folderArt) {
          t.artId = folderArt;
          sourcesUsed.push('folder-poster');
        }
      }
      if (!t.artId && artDir) {
        const frame = await extractVideoFramePoster(t.path, t.duration);
        if (frame) {
          t.artId = storeArtworkBuffer(artDir, frame.data, frame.mime);
          if (t.artId) sourcesUsed.push('ffmpeg-frame');
        }
      }
    }

    if (useAi && (isMissingArtist(t.artist) || isMissingAlbum(t.album) || isMessyTitle(t.title, t.path))) {
      stillMissingForAi.push(t);
    }

    changesById.set(t.id, { track: t, before, sourcesUsed });
    if (onProgress) {
      onProgress({ stage: 'enriching', processed: i + 1, total: list.length, currentTitle: t.title });
    }
  }

  if (useAi && stillMissingForAi.length > 0) {
    const aiMap = await inferBatchWithAiAgent(stillMissingForAi, askFn);
    for (const t of stillMissingForAi) {
      const row = aiMap[t.id];
      if (!row) continue;
      const entry = changesById.get(t.id);
      if (row.title && isMessyTitle(t.title, t.path)) t.title = String(row.title).trim();
      if (row.artist && isMissingArtist(t.artist)) t.artist = String(row.artist).trim();
      if (row.album && isMissingAlbum(t.album)) t.album = String(row.album).trim();
      if (row.genre && (!t.genre || t.genre === 'Unknown')) t.genre = String(row.genre).trim();
      if (row.year && !t.year) t.year = parseInt(row.year, 10) || t.year;
      if (entry) entry.sourcesUsed.push('ai-agent');
    }
  }

  const results = [];
  let updatedCount = 0;
  let artAddedCount = 0;

  for (const { track: t, before, sourcesUsed } of changesById.values()) {
    if (!t.artId && generateFallbackArt && artDir) {
      const svgBuf = generateSvgCoverBuffer({
        title: t.title,
        artist: t.artist,
        album: t.album,
        year: t.year,
        resolution: t.resolution
      });
      t.artId = storeArtworkBuffer(artDir, svgBuf, 'image/svg+xml');
      if (t.artId) sourcesUsed.push('generated-svg-poster');
    }

    if (t.artist && (!t.albumArtist || isMissingArtist(t.albumArtist))) {
      t.albumArtist = t.artist;
    }

    const metadataChanged =
      t.title !== before.title ||
      t.artist !== before.artist ||
      t.album !== before.album ||
      t.genre !== before.genre ||
      t.year !== before.year ||
      t.resolution !== before.resolution ||
      t.videoCodec !== before.videoCodec;
    const artChanged = t.artId !== before.artId;

    if (metadataChanged || artChanged) updatedCount++;
    if (artChanged && t.artId) artAddedCount++;

    if (writeFileTags && (metadataChanged || artChanged) && t.source !== 'cloud') {
      const artPath = (artDir && t.artId && !t.artId.endsWith('.svg')) ? path.join(artDir, t.artId) : null;
      await writeTagsWithFfmpeg(t.path, t, artPath);
    }

    results.push({
      id: t.id,
      before,
      after: {
        title: t.title,
        artist: t.artist,
        album: t.album,
        genre: t.genre,
        year: t.year,
        resolution: t.resolution,
        videoCodec: t.videoCodec,
        artId: t.artId
      },
      changed: metadataChanged || artChanged,
      sources: Array.from(new Set(sourcesUsed))
    });
  }

  return {
    total: list.length,
    updatedCount,
    artAddedCount,
    tracks: list,
    results
  };
}

module.exports = {
  trackNeedsFix,
  parseFileHeuristics,
  inspectWithFfprobe,
  extractVideoFramePoster,
  generateSvgCoverBuffer,
  enrichTracksMetadata,
  writeTagsWithFfmpeg
};
