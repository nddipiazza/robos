/**
 * Fast, low-allocation movie/video & audio metadata reader shared between
 * the main process and the background scan worker thread.
 *
 * Designed for scanning tens of thousands of movies, series, and video clips without
 * holding poster Buffers in RAM: posters are content-addressed on disk
 * (sha1 -> ~/.cache/robos/movie-player/art/<sha1>.<ext>) and tracks only store
 * the short `artId` string.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.webm', '.mov', '.m4v', '.avi', '.ogv', '.ts', '.m2ts',
  '.flv', '.wmv', '.mpg', '.mpeg', '.3gp'
]);

const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.opus', '.wma',
  ...VIDEO_EXTENSIONS
]);

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const FOLDER_ART_NAMES = [
  'poster', 'cover', 'folder', 'front', 'movie', 'fanart', 'thumb', 'artwork', 'album'
];

// Scene release & video tag tokens used to clean filenames into clean titles
const SCENE_NOISE_RE = /\b(2160p|1080p|720p|480p|4k|uhd|hdr|hdr10|dv|dolby\.?vision|bluray|blu-ray|bdrip|brrip|web-dl|webdl|webrip|hdtv|dvdrip|remux|proper|repack|extended|unrated|directors\.?cut|theatrical|x264|x265|h\.?264|h\.?265|hevc|av1|avc|aac|ac3|eac3|dts|truehd|atmos|10bit|8bit|5\.1|7\.1|2\.0|multi|subs|subbed|dubbed)\b/gi;

function detectResolutionFromName(name) {
  if (!name) return '';
  const s = String(name);
  if (/\b(2160p|4k|uhd)\b/i.test(s)) return '4K';
  if (/\b1440p\b/i.test(s)) return '1440p';
  if (/\b1080p\b/i.test(s)) return '1080p';
  if (/\b720p\b/i.test(s)) return '720p';
  if (/\b(480p|sd)\b/i.test(s)) return '480p';
  return '';
}

function detectCodecFromName(name) {
  if (!name) return '';
  const s = String(name);
  if (/\b(x265|h\.?265|hevc)\b/i.test(s)) return 'HEVC';
  if (/\bav1\b/i.test(s)) return 'AV1';
  if (/\b(x264|h\.?264|avc)\b/i.test(s)) return 'H.264';
  if (/\bvp9\b/i.test(s)) return 'VP9';
  if (/\bprores\b/i.test(s)) return 'ProRes';
  return '';
}

function cleanMovieFilename(baseName) {
  let raw = String(baseName || '').replace(/[._]+/g, ' ').trim();
  let year = null;
  let season = null;
  let episode = null;

  // Match S01E02 or 1x02
  const seMatch = raw.match(/\bS(\d{1,2})E(\d{1,3})\b/i) || raw.match(/\b(\d{1,2})x(\d{2,3})\b/);
  if (seMatch) {
    season = parseInt(seMatch[1], 10);
    episode = parseInt(seMatch[2], 10);
  }

  // Extract 4-digit release year in parens, brackets, or standalone before scene tags
  const yearParen = raw.match(/[\(\[](19\d{2}|20\d{2})[\)\]]/);
  if (yearParen) {
    year = parseInt(yearParen[1], 10);
    raw = raw.slice(0, yearParen.index).trim() || raw.replace(yearParen[0], ' ').trim();
  } else {
    const yearToken = raw.match(/\b(19\d{2}|20\d{2})\b/);
    if (yearToken && yearToken.index > 1) {
      year = parseInt(yearToken[1], 10);
      raw = raw.slice(0, yearToken.index).trim();
    }
  }

  raw = raw
    .replace(SCENE_NOISE_RE, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s+-\s+[A-Za-z0-9]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    title: raw || baseName,
    year,
    season,
    episode,
    resolution: detectResolutionFromName(baseName),
    videoCodec: detectCodecFromName(baseName)
  };
}

let mmModulePromise = null;
function loadMusicMetadata() {
  if (!mmModulePromise) {
    mmModulePromise = import('music-metadata').catch(() => null);
  }
  return mmModulePromise;
}

function extFromMime(mime = '') {
  const m = String(mime).toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  return 'jpg';
}

function storeArtworkBuffer(artDir, data, mime) {
  if (!artDir || !data || !data.length) return null;
  try {
    const hash = crypto.createHash('sha1').update(data).digest('hex').slice(0, 20);
    const ext = extFromMime(mime);
    const id = `${hash}.${ext}`;
    const target = path.join(artDir, id);
    if (!fs.existsSync(target)) {
      fs.mkdirSync(artDir, { recursive: true });
      fs.writeFileSync(target, data);
    }
    return id;
  } catch (_) {
    return null;
  }
}

function findFolderArt(dirPath, artDir, folderArtCache) {
  if (!dirPath || !artDir) return null;
  if (folderArtCache && folderArtCache.has(dirPath)) {
    return folderArtCache.get(dirPath);
  }
  let result = null;
  try {
    const entries = fs.readdirSync(dirPath);
    let picked = null;
    for (const wanted of FOLDER_ART_NAMES) {
      picked = entries.find(e => {
        const ext = path.extname(e).toLowerCase();
        const stem = path.basename(e, ext).toLowerCase();
        return IMAGE_EXTENSIONS.has(ext) && stem === wanted;
      });
      if (picked) break;
    }
    if (!picked) {
      picked = entries.find(e => IMAGE_EXTENSIONS.has(path.extname(e).toLowerCase()));
    }
    if (picked) {
      const full = path.join(dirPath, picked);
      const st = fs.statSync(full);
      if (st.isFile() && st.size > 0 && st.size <= 10 * 1024 * 1024) {
        const buf = fs.readFileSync(full);
        const ext = path.extname(picked).slice(1).toLowerCase();
        result = storeArtworkBuffer(artDir, buf, `image/${ext}`);
      }
    }
  } catch (_) {}
  if (folderArtCache) folderArtCache.set(dirPath, result);
  return result;
}

function findSidecarSubtitlePath(filePath) {
  if (!filePath || filePath.startsWith('http') || filePath.startsWith('cloud://')) return null;
  try {
    const dir = path.dirname(filePath);
    const stem = path.basename(filePath, path.extname(filePath));
    for (const ext of ['.srt', '.vtt', '.en.srt', '.en.vtt', '.lrc']) {
      const candidate = path.join(dir, stem + ext);
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch (_) {}
  return null;
}

/**
 * Parse a single media file into a lightweight track/movie record.
 * Never attaches raw base64 artwork to the returned object.
 */
async function readTrackMetadata(filePath, { artDir = null, stat = null, folderArtCache = null } = {}) {
  const baseName = path.basename(filePath, path.extname(filePath));
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const cleaned = cleanMovieFilename(baseName);

  const track = {
    id: crypto.createHash('md5').update(filePath).digest('hex'),
    path: filePath,
    title: cleaned.title || baseName,
    artist: 'Unknown Director',
    album: 'Standalone Films',
    albumArtist: '',
    genre: 'Cinema',
    year: cleaned.year || null,
    trackNumber: cleaned.episode || null,
    discNumber: cleaned.season || null,
    composer: '',
    duration: 0,
    bitrate: 0,
    sampleRate: 0,
    codec: cleaned.videoCodec || ext.toUpperCase(),
    videoCodec: cleaned.videoCodec || ext.toUpperCase(),
    resolution: cleaned.resolution || '1080p',
    width: cleaned.resolution === '4K' ? 3840 : cleaned.resolution === '720p' ? 1280 : 1920,
    height: cleaned.resolution === '4K' ? 2160 : cleaned.resolution === '720p' ? 720 : 1080,
    format: ext,
    size: 0,
    mtimeMs: 0,
    addedAt: Date.now(),
    artId: null,
    hasSubtitles: Boolean(findSidecarSubtitlePath(filePath)),
    source: 'local'
  };

  try {
    const st = stat || fs.statSync(filePath);
    track.size = st.size;
    track.mtimeMs = Math.floor(st.mtimeMs || 0);
    track.addedAt = Math.floor(st.birthtimeMs || st.ctimeMs || st.mtimeMs || Date.now());
  } catch (_) {}

  // Heuristic fallback from folder hierarchy: .../Director/Collection (or Series)/Movie.mp4
  const parentDir = path.dirname(filePath);
  const folderName = path.basename(parentDir);
  const grandParent = path.basename(path.dirname(parentDir));

  // Leading episode/track number "01 - Pilot"
  const numMatch = baseName.match(/^(\d{1,3})\s*[-._)\s]\s*(.+)$/);
  if (numMatch) {
    track.trackNumber = parseInt(numMatch[1], 10);
    const subClean = cleanMovieFilename(numMatch[2].trim());
    track.title = subClean.title || numMatch[2].trim();
  }

  // "Director - Title" in filename
  const dashParts = baseName.split(' - ');
  if (dashParts.length >= 2 && !cleaned.season) {
    track.artist = dashParts[0].trim();
    const rhsClean = cleanMovieFilename(dashParts.slice(1).join(' - ').trim());
    track.title = rhsClean.title || dashParts.slice(1).join(' - ').trim();
    if (rhsClean.year && !track.year) track.year = rhsClean.year;
  }

  if (folderName && !['movies', 'videos', 'films', 'media', 'downloads', 'tv', 'series'].includes(folderName.toLowerCase())) {
    const folderClean = cleanMovieFilename(folderName);
    if (folderClean.year && !track.year) track.year = folderClean.year;
    track.album = folderClean.title || folderName;
  }
  if (grandParent && !['movies', 'videos', 'films', 'media', 'downloads', 'home', 'tv', 'series'].includes(grandParent.toLowerCase())) {
    if (track.artist === 'Unknown Director') track.artist = grandParent;
  }

  try {
    const mm = await loadMusicMetadata();
    if (mm) {
      const metadata = await mm.parseFile(filePath, {
        duration: true,
        skipPostHeaders: true
      });
      if (metadata && metadata.common) {
        const c = metadata.common;
        if (c.title) track.title = c.title;
        if (c.artist) track.artist = c.artist;
        if (c.album) track.album = c.album;
        if (c.albumartist) track.albumArtist = c.albumartist;
        if (Array.isArray(c.genre) && c.genre[0]) track.genre = c.genre[0];
        else if (typeof c.genre === 'string' && c.genre) track.genre = c.genre;
        if (c.year) track.year = c.year;
        if (c.track && c.track.no) track.trackNumber = c.track.no;
        if (c.disk && c.disk.no) track.discNumber = c.disk.no;
        if (Array.isArray(c.composer) && c.composer[0]) track.composer = c.composer[0];
        else if (typeof c.composer === 'string') track.composer = c.composer;
        if (artDir && Array.isArray(c.picture) && c.picture.length > 0) {
          const pic = c.picture[0];
          const raw = Buffer.isBuffer(pic.data) ? pic.data : Buffer.from(pic.data);
          track.artId = storeArtworkBuffer(artDir, raw, pic.format);
        }
      }
      if (metadata && metadata.format) {
        const f = metadata.format;
        if (f.duration) track.duration = Math.round(f.duration);
        if (f.bitrate) track.bitrate = Math.round(f.bitrate / 1000);
        if (f.sampleRate) track.sampleRate = f.sampleRate;
        if (f.codec) {
          track.codec = f.codec;
          track.videoCodec = f.codec;
        }
      }
    }
  } catch (_) {
    // Metadata parse errors are non-fatal; filename fallbacks remain intact
  }

  if (!track.artId && artDir) {
    track.artId = findFolderArt(parentDir, artDir, folderArtCache);
  }
  if (!track.albumArtist) track.albumArtist = track.artist;

  return track;
}

/**
 * Build a track/movie record from a cloud/remote path without downloading the file.
 * Extracts Director / Collection / Season-Episode / Title / Year / Resolution from path structure.
 */
function guessFromRemotePath({ sourceId, sourceName, sourceType, remotePath, size = 0, mtime = null }) {
  const ext = path.extname(remotePath).slice(1).toLowerCase();
  const base = path.basename(remotePath, path.extname(remotePath));
  const parts = remotePath.split('/').filter(Boolean);
  const folder = parts.length >= 2 ? parts[parts.length - 2] : '';
  const grandFolder = parts.length >= 3 ? parts[parts.length - 3] : '';

  const cleaned = cleanMovieFilename(base);
  let title = cleaned.title || base;
  let artist = grandFolder || sourceName || 'Cloud Cinema';
  let album = folder || sourceName || 'Cloud Collection';
  let trackNumber = cleaned.episode || null;
  let year = cleaned.year || null;

  const numMatch = base.match(/^(\d{1,3})\s*[-._)\s]\s*(.+)$/);
  if (numMatch) {
    trackNumber = parseInt(numMatch[1], 10);
    const subClean = cleanMovieFilename(numMatch[2].trim());
    title = subClean.title || numMatch[2].trim();
  }
  const dash = title.split(' - ');
  if (dash.length >= 2 && !grandFolder) {
    artist = dash[0].trim();
    title = dash.slice(1).join(' - ').trim();
  }

  if (folder) {
    const folderClean = cleanMovieFilename(folder);
    if (folderClean.year && !year) year = folderClean.year;
    album = folderClean.title || folder;
  }

  const key = `cloud://${sourceId}/${remotePath.replace(/^\/+/, '')}`;
  return {
    id: crypto.createHash('md5').update(key).digest('hex'),
    path: key,
    remotePath,
    sourceId,
    sourceName: sourceName || sourceId,
    sourceType: sourceType || 'cloud',
    source: 'cloud',
    title,
    artist,
    album,
    albumArtist: artist,
    genre: 'Cloud Cinema',
    year,
    trackNumber,
    discNumber: cleaned.season || null,
    composer: '',
    duration: 0,
    bitrate: 0,
    sampleRate: 0,
    codec: cleaned.videoCodec || ext.toUpperCase(),
    videoCodec: cleaned.videoCodec || ext.toUpperCase(),
    resolution: cleaned.resolution || '1080p',
    format: ext,
    size: Number(size) || 0,
    mtimeMs: mtime ? new Date(mtime).getTime() || 0 : 0,
    addedAt: Date.now(),
    artId: null
  };
}

module.exports = {
  VIDEO_EXTENSIONS,
  AUDIO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  cleanMovieFilename,
  detectResolutionFromName,
  detectCodecFromName,
  readTrackMetadata,
  guessFromRemotePath,
  storeArtworkBuffer,
  findFolderArt,
  findSidecarSubtitlePath
};
