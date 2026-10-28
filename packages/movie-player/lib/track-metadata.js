'use strict';

// Shared track-building helpers used by MediaLibrary (main thread) and the
// background scan worker, so both produce identical track records.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const AUDIO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.webm', '.mov', '.m4v', '.avi', '.ogv', '.ts', '.m2ts', '.mpg', '.mpeg', '.flv', '.wmv', '.3gp',
  '.mp3', '.m4a', '.flac', '.ogg', '.wav', '.aac', '.opus', '.wma',
]);
const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.webm', '.mov', '.m4v', '.avi', '.ogv', '.ts', '.m2ts', '.mpg', '.mpeg', '.flv', '.wmv', '.3gp',
]);

// Image files commonly dropped next to movies or albums, in preference order.
const FOLDER_COVER_NAMES = ['poster', 'cover', 'folder', 'front', 'movie', 'thumb', 'fanart', 'album', 'albumart'];
const FOLDER_COVER_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
const MAX_FOLDER_COVER_BYTES = 8 * 1024 * 1024;
const FOLDER_COVER_CACHE_SIZE = 32;

function generateTrackId(filePath) {
  return `trk_${crypto.createHash('sha1').update(filePath).digest('hex').slice(0, 16)}`;
}

// Art is keyed by image content so every track of an album shares one cached file.
function generateArtId(buffer) {
  return `art_${crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 16)}`;
}

function toSafeFileUrl(filePath) {
  try {
    return pathToFileURL(filePath).href;
  } catch {
    return encodeURI(`file://${filePath}`);
  }
}

function imageFormatForExt(ext) {
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

/**
 * Look for cover.jpg / folder.png / ... beside a track. Results are memoised
 * per directory in `cache` (a small LRU Map) so a 20-track album costs one readdir.
 */
function findFolderCover(dir, cache = null) {
  if (cache && cache.has(dir)) return cache.get(dir);
  let found = null;
  try {
    const byLower = new Map(fs.readdirSync(dir).map(name => [name.toLowerCase(), name]));
    outer:
    for (const base of FOLDER_COVER_NAMES) {
      for (const ext of FOLDER_COVER_EXTS) {
        const real = byLower.get(base + ext);
        if (!real) continue;
        const full = path.join(dir, real);
        const stat = fs.statSync(full);
        if (stat.isFile() && stat.size > 0 && stat.size <= MAX_FOLDER_COVER_BYTES) {
          found = { data: fs.readFileSync(full), format: imageFormatForExt(ext) };
          break outer;
        }
      }
    }
  } catch {}
  if (cache) {
    // Scans visit one folder at a time, so a few recent folders are all that's worth
    // keeping; caching every folder's image would hold ~1 GB for a 100k-track library.
    if (cache.size >= FOLDER_COVER_CACHE_SIZE) cache.delete(cache.keys().next().value);
    cache.set(dir, found);
  }
  return found;
}

function firstOf(value) {
  if (Array.isArray(value)) return value.find(v => v != null && String(v).trim()) || null;
  return value || null;
}

/**
 * Build a library track from music-metadata output.
 * Returns { track, art } where art is { artId, buffer, format } or null.
 */
function trackFromMetadata(filePath, metadata, parser, coverCache = null) {
  const common = metadata.common || {};
  const format = metadata.format || {};

  let cover = parser && typeof parser.selectCover === 'function' ? parser.selectCover(common.picture) : null;
  if (!cover || !cover.data) cover = findFolderCover(path.dirname(filePath), coverCache);

  let art = null;
  if (cover && cover.data) {
    const buffer = Buffer.from(cover.data);
    art = { artId: generateArtId(buffer), buffer, format: cover.format || 'image/jpeg' };
  }

  const parentDir = path.basename(path.dirname(filePath));
  const grandParentDir = path.basename(path.dirname(path.dirname(filePath)));
  const isVideo = VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
  const tvInfo = isVideo ? parseVideoMediaInfo(common.title || path.parse(filePath).name, parentDir, grandParentDir, filePath) : null;

  const cleaned = cleanMovieTitle(common.title || path.parse(filePath).name);
  const folderCleaned = cleanMovieTitle(parentDir);
  const useFolderTitle = (!common.title && folderCleaned.year && !cleaned.year) || /^(movie|video|film|track|sample)$/i.test(cleaned.title);
  const bestTitle = (tvInfo && tvInfo.isTvShow)
    ? tvInfo.displayTitle
    : (common.title || (useFolderTitle ? folderCleaned.title : cleaned.title) || path.parse(filePath).name);
  const bestYear = common.year || (tvInfo && tvInfo.year) || cleaned.year || folderCleaned.year || null;
  const resBadge = [
    (tvInfo && tvInfo.resolution) || cleaned.resolution || folderCleaned.resolution,
    (tvInfo && tvInfo.source) || cleaned.source || folderCleaned.source,
  ].filter(Boolean).join(' ');

  const track = {
    id: generateTrackId(filePath),
    filePath,
    title: bestTitle,
    artist: common.artist || common.albumartist || (resBadge ? resBadge : (tvInfo && tvInfo.isTvShow ? 'TV Series' : 'Feature Film')),
    albumArtist: common.albumartist || (tvInfo && tvInfo.isTvShow ? tvInfo.showName : null),
    album: (tvInfo && tvInfo.isTvShow)
      ? tvInfo.showName
      : (common.album || (bestYear ? `${bestTitle} (${bestYear})` : bestTitle)),
    year: bestYear,
    genre: firstOf(common.genre) || (tvInfo && tvInfo.isTvShow ? 'TV Series' : (isVideo ? 'Movies' : null)),
    composer: firstOf(common.composer),
    trackNumber: (tvInfo && tvInfo.isTvShow && tvInfo.episodeNumber) ? tvInfo.episodeNumber : (common.track?.no || null),
    trackTotal: common.track?.of || null,
    discNumber: (tvInfo && tvInfo.isTvShow && tvInfo.seasonNumber) ? tvInfo.seasonNumber : (common.disk?.no || null),
    discTotal: common.disk?.of || null,
    mediaType: isVideo ? ((tvInfo && tvInfo.isTvShow) ? 'tv' : 'movie') : 'audio',
    showName: (tvInfo && tvInfo.isTvShow) ? tvInfo.showName : null,
    seasonNumber: (tvInfo && tvInfo.isTvShow) ? tvInfo.seasonNumber : null,
    episodeNumber: (tvInfo && tvInfo.isTvShow) ? tvInfo.episodeNumber : null,
    episodeTitle: (tvInfo && tvInfo.isTvShow) ? tvInfo.episodeTitle : null,
    episodeCode: (tvInfo && tvInfo.isTvShow) ? tvInfo.episodeCode : null,
    duration: format.duration || 0,
    bitrate: format.bitrate || 0,
    sampleRate: format.sampleRate || 0,
    bitsPerSample: format.bitsPerSample || null,
    channels: format.numberOfChannels || null,
    codec: format.codec || format.container || null,
    lossless: !!format.lossless,
    artId: art ? art.artId : null,
    src: toSafeFileUrl(filePath),
  };
  return { track, art };
}

function fallbackTrack(filePath, err, coverCache = null) {
  const cover = findFolderCover(path.dirname(filePath), coverCache);
  let art = null;
  if (cover) {
    const buffer = Buffer.from(cover.data);
    art = { artId: generateArtId(buffer), buffer, format: cover.format };
  }
  const parentDir = path.basename(path.dirname(filePath));
  const grandParentDir = path.basename(path.dirname(path.dirname(filePath)));
  const isVideo = VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
  const tvInfo = isVideo ? parseVideoMediaInfo(path.parse(filePath).name, parentDir, grandParentDir, filePath) : null;

  const cleaned = cleanMovieTitle(path.parse(filePath).name);
  const folderCleaned = cleanMovieTitle(parentDir);
  const bestTitle = (tvInfo && tvInfo.isTvShow)
    ? tvInfo.displayTitle
    : ((folderCleaned.year && !cleaned.year ? folderCleaned.title : cleaned.title) || path.parse(filePath).name);
  const bestYear = (tvInfo && tvInfo.year) || cleaned.year || folderCleaned.year || null;
  const resBadge = [
    (tvInfo && tvInfo.resolution) || cleaned.resolution || folderCleaned.resolution,
    (tvInfo && tvInfo.source) || cleaned.source || folderCleaned.source,
  ].filter(Boolean).join(' ');
  return {
    track: {
      id: generateTrackId(filePath),
      filePath,
      title: bestTitle,
      artist: resBadge || (tvInfo && tvInfo.isTvShow ? 'TV Series' : 'Feature Film'),
      albumArtist: (tvInfo && tvInfo.isTvShow) ? tvInfo.showName : null,
      album: (tvInfo && tvInfo.isTvShow) ? tvInfo.showName : (bestYear ? `${bestTitle} (${bestYear})` : bestTitle),
      year: bestYear,
      genre: (tvInfo && tvInfo.isTvShow) ? 'TV Series' : (isVideo ? 'Movies' : null),
      trackNumber: (tvInfo && tvInfo.isTvShow) ? tvInfo.episodeNumber : null,
      discNumber: (tvInfo && tvInfo.isTvShow) ? tvInfo.seasonNumber : null,
      mediaType: isVideo ? ((tvInfo && tvInfo.isTvShow) ? 'tv' : 'movie') : 'audio',
      showName: (tvInfo && tvInfo.isTvShow) ? tvInfo.showName : null,
      seasonNumber: (tvInfo && tvInfo.isTvShow) ? tvInfo.seasonNumber : null,
      episodeNumber: (tvInfo && tvInfo.isTvShow) ? tvInfo.episodeNumber : null,
      episodeTitle: (tvInfo && tvInfo.isTvShow) ? tvInfo.episodeTitle : null,
      episodeCode: (tvInfo && tvInfo.isTvShow) ? tvInfo.episodeCode : null,
      duration: 0,
      artId: art ? art.artId : null,
      src: toSafeFileUrl(filePath),
      error: err ? err.message : undefined,
    },
    art,
  };
}

// Folder names that say nothing about the movie collection ("Movies", "Downloads").
const GENERIC_FOLDERS = new Set(['', '.', '/', 'movies', 'movie', 'films', 'video', 'videos', 'tv', 'shows', 'music', 'my music',
  'mp3', 'mp3s', 'audio', 'songs', 'albums', 'my drive', 'drive', 'onedrive', 'cloud', 'media', 'downloads', 'library',
  'itunes', 'itunes media', 'itunes music', 'shared with me', 'flac', 'misc', 'various', 'unsorted', 'new folder', 'sync', 'documents']);
const DISC_FOLDER = /^(cd|disc|disk|part|pt)\s*(\d+)$/i;

/**
 * Cleans scene-release movie filenames & folder names:
 * e.g. "Beetlejuice.Beetlejuice.2024.1080p.WEB.H264-BEETLEJUICE[TGx]"
 *   -> { title: "Beetlejuice Beetlejuice", year: 2024, resolution: "1080p", source: "WEB" }
 * e.g. "Dune (2021) [1080p] [WEBRip] [5.1] [YTS.MX]"
 *   -> { title: "Dune", year: 2021, resolution: "1080p", source: "WEBRip" }
 */
function isSampleVideoPath(filePath) {
  if (!filePath) return false;
  const norm = String(filePath).replace(/\\/g, '/');
  if (/\/samples?\//i.test(norm)) return true;
  const base = path.parse(norm).name.trim();
  if (/^(?:sample|rarbg\.com|etrg)$/i.test(base)) return true;
  if (/[-._\s]sample$/i.test(base)) return true;
  return false;
}

function cleanMovieTitle(raw) {
  const str = String(raw || '')
    .replace(/^(?:\[\s*)?www\.[a-z0-9.-]+(?:\s*\])?\s*[-–—:]+\s*/i, '')
    .replace(/^\d{1,2}\.\s+(?=[A-Z])/i, '')
    .trim();
  if (!str) return { title: '', year: null, resolution: null, source: null };

  const resMatch = /\b(2160p|4k|1080p|720p|480p)\b/i.exec(str);
  const resolution = resMatch ? resMatch[1].toUpperCase().replace('P', 'p') : null;

  const srcMatch = /\b(BluRay|BRRip|BDRip|WEBRip|WEB-DL|WEB|HDRip|DVDRip|HDTV|REMUX)\b/i.exec(str);
  const source = srcMatch ? srcMatch[1] : null;

  // Match year in parentheses/brackets or dot/space/underscore separated before quality tags
  const yearMatch = /[([.\s_]((19\d\d|20\d\d))(?:[)\].\s_]|$)/.exec(str);
  const year = yearMatch ? Number(yearMatch[1]) : null;

  let head = str;
  if (yearMatch && yearMatch.index > 0) {
    head = str.slice(0, yearMatch.index);
  } else if (resMatch && resMatch.index >= 0) {
    head = str.slice(0, resMatch.index);
  } else if (srcMatch && srcMatch.index >= 0) {
    head = str.slice(0, srcMatch.index);
  }

  // Strip bracketed tags, release groups, leading/trailing dashes, and replace dots/underscores with spaces
  head = head
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\([^)]*$/g, ' ')
    .replace(/\[[^\]]*$/g, ' ')
    .replace(/\b(2160p|4k|1080p|720p|480p|BluRay|BRRip|BDRip|WEBRip|WEB-DL|WEB|HDRip|DVDRip|HDTV|REMUX|camrip|hdcam|ts|hdts|telesync|dvdscr|xvid|x264|x265|hevc|h264|aac|ac3|ddp5|dts|10bit|repack|proper|internal)\b.*$/i, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/^\d{1,2}\s+(?=(?:The\s+)?Final\s+Destination\b)/i, '')
    .replace(/^\s*[-–—:]+\s*/, '')
    .replace(/\s*[-–—:]+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (head && head === head.toLowerCase() && /[a-z]/.test(head)) {
    head = toCanonicalShowCase(head);
  }
  if (/^Avengers\s+End\s+Game$/i.test(head)) {
    head = 'Avengers: Endgame';
  } else if (/^Avengers\s+Endgame$/i.test(head)) {
    head = 'Avengers: Endgame';
  }

  return {
    title: head || str.replace(/[._]+/g, ' ').trim(),
    year,
    resolution,
    source,
  };
}

const NON_SHOW_FOLDER_RE = /^(?:featurettes?|specials?|deleted\s*scenes?|extras?(?:\s*[-–]\s*season\s*\d+)?|s\d{1,2}\s*extras?|season\s*\d+(?:\s*(?:to|and|-)\s*\d+)?|series\s*\d+|book\s*(?:one|two|three|four|\d+).*|subtitles?|subs|samples?|bonus|movies?)$/i;

const SMALL_TITLE_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'on', 'or', 'the', 'to', 'with']);

function toCanonicalShowCase(str) {
  const words = String(str || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  return words.map((w, idx) => {
    const lower = w.toLowerCase();
    if (lower === 'bojack') return 'BoJack';
    if (lower === 'sg1' || lower === 'sg-1') return 'SG-1';
    if (lower === 'handmaids') return "Handmaid's";
    if (/^(?:tv|uk|us|au|md|ii|iii|iv)$/i.test(w)) return w.toUpperCase();
    if (idx > 0 && SMALL_TITLE_WORDS.has(lower)) return lower;
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
}

/**
 * Cleans a TV Show name from a filename prefix or season folder name:
 * e.g. "Atypical.SEASON.01.S01.COMPLETE.720p..." -> "Atypical"
 * e.g. "Stranger_Things_S04" -> "Stranger Things"
 */
function cleanShowName(raw) {
  const preCleaned = String(raw || '')
    .replace(/^www\.[a-z0-9.-]+\s*[-–—:]+\s*/i, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/^(?:movie[.\s_-]*\d+|x[m\d]+|\d{1,3})\b\s*[-–—:.]?\s*/i, ' ');
  const cleaned = cleanMovieTitle(preCleaned).title;
  let out = String(cleaned || '')
    .replace(/\b(?:season|series|book)\s*(?:\d{1,2}|one|two|three|four|five)\b.*$/i, ' ')
    .replace(/\bs\d{1,2}(?:[.\s_-]*e\d{1,3}|\s*[-–]\s*s?\d{1,2})?\b.*$/i, ' ')
    .replace(/\bcomplete(?:\s*series)?\b.*$/i, ' ')
    .replace(/\b(?:extras?|featurettes?|specials?|deleted\s*scenes?|bonus)\b.*$/i, ' ')
    .replace(/\b(?:eng(?:\s*uncut|\s*subs?)?|uncut|dubbed|subbed|multi|repack|proper|sci-?fi|mp4)\b.*$/i, ' ')
    .replace(/^\s*[-–—:._]+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*[-–—:._]+\s*$/, '')
    .replace(/\s+\b(?:US|UK)\b$/i, '')
    .trim();

  if (NON_SHOW_FOLDER_RE.test(out)) return '';

  // Canonicalize well-known punctuation variants so multi-season folders merge into one show
  if (/^house(?:,?\s*m\.?\s*d\.?)?$/i.test(out)) return 'House';
  if (/^avatar\s*[-:]?\s*the\s+last\s+airbender$/i.test(out)) return 'Avatar: The Last Airbender';
  if (/^stargate\s+sg-?1$/i.test(out)) return 'Stargate SG-1';
  if (/^bojack\s+horseman$/i.test(out)) return 'BoJack Horseman';

  return toCanonicalShowCase(out);
}

function parseSeasonFromText(text) {
  const str = String(text || '');
  const m = /\b(?:season|series|s)[.\s_-]*0?(\d{1,2})\b/i.exec(str);
  if (m) return Number(m[1]);
  const book = /\bbook\s+(one|two|three|four)\b/i.exec(str);
  if (book) {
    const map = { one: 1, two: 2, three: 3, four: 4 };
    return map[book[1].toLowerCase()] || 1;
  }
  return null;
}

/**
 * Distinguishes whether a video file is a TV Show episode or a standalone Movie,
 * and extracts { isTvShow, mediaType, showName, seasonNumber, episodeNumber, episodeCode, episodeTitle, displayTitle }.
 */
function parseVideoMediaInfo(rawName, parentDir = '', grandParentDir = '', fullPath = '') {
  const fileStr = String(rawName || '')
    .replace(/^www\.[a-z0-9.-]+\s*[-–—:]+\s*/i, '')
    .trim();
  const parentStr = String(parentDir || '').trim();
  const grandStr = String(grandParentDir || '').trim();
  const normPath = String(fullPath || '').replace(/\\/g, '/');

  // Detect if file lives inside a /shows/ (or /tv/) directory hierarchy and extract the top-level show folder
  let topShowDir = '';
  let inShowsFolder = false;
  const pathParts = normPath.split('/').filter(Boolean);
  const showsIdx = pathParts.findIndex(p => /^(?:shows|tv_shows|tv|series)$/i.test(p));
  if (showsIdx >= 0) {
    inShowsFolder = true;
    if (showsIdx + 1 < pathParts.length - 1) {
      topShowDir = pathParts[showsIdx + 1];
    }
  }
  const isSpecialsPath = pathParts.some(p => /^(?:featurettes?|specials?|deleted\s*scenes?|extras?(?:\s*[-–]\s*season\s*\d+)?|s\d{1,2}\s*extras?)$/i.test(p));

  const fileCleaned = cleanMovieTitle(fileStr);
  const folderCleaned = parentStr && !GENERIC_FOLDERS.has(parentStr.toLowerCase()) && !NON_SHOW_FOLDER_RE.test(parentStr)
    ? cleanMovieTitle(parentStr)
    : { title: '', year: null, resolution: null, source: null };

  const year = fileCleaned.year || folderCleaned.year || null;
  const resolution = fileCleaned.resolution || folderCleaned.resolution || null;
  const source = fileCleaned.source || folderCleaned.source || null;

  let seasonNumber = null;
  let episodeNumber = null;
  let beforeMatch = '';
  let afterMatch = '';

  // 1. Standard S01E01 / S1E2 / s02ep1 / S03E10&E11 / S01E01E02E03 / S01E04Loves pattern
  const seMatch = /(?:^|[.\s_\-([\]])S(\d{1,2})[.\s_-]*(?:EP|E)(\d{1,3})(?:[.\s_&+-]*(?:EP|E)?\d{1,3})*(?=[.\s_\-)\]]|[A-Z][a-z]|$)/i.exec(fileStr);
  if (seMatch) {
    seasonNumber = Number(seMatch[1]);
    episodeNumber = Number(seMatch[2]);
    beforeMatch = fileStr.slice(0, seMatch.index);
    afterMatch = fileStr.slice(seMatch.index + seMatch[0].length);
  }

  // 2. S01Extra pattern (e.g. "House, M.D. - S01Extra - Casting Session 1")
  if (seasonNumber == null) {
    const exMatch = /(?:^|[.\s_\-([\]])S(\d{1,2})[.\s_-]*Extra\b/i.exec(fileStr);
    if (exMatch) {
      seasonNumber = 0;
      const trailNum = /(\d{1,3})\s*$/.exec(fileStr);
      episodeNumber = trailNum ? Number(trailNum[1]) : 1;
      beforeMatch = fileStr.slice(0, exMatch.index);
      afterMatch = fileStr.slice(exMatch.index + exMatch[0].length);
    }
  }

  // 3. 1x01 / 01x02 pattern (excluding resolutions like 1920x1080 or 720x480)
  if (seasonNumber == null) {
    const xMatch = /(?:^|[.\s_\-([\]])(0?[1-9]|[1-4]\d)x(\d{2,3})(?=[.\s_\-)\]]|$)/i.exec(fileStr);
    if (xMatch && Number(xMatch[2]) <= 200) {
      seasonNumber = Number(xMatch[1]);
      episodeNumber = Number(xMatch[2]);
      beforeMatch = fileStr.slice(0, xMatch.index);
      afterMatch = fileStr.slice(xMatch.index + xMatch[0].length);
    }
  }

  // 4. "Episode 2" / "Ep.01" / "Ep 01" / "E02" pattern
  if (seasonNumber == null) {
    const folderSeason = parseSeasonFromText(`${parentStr} ${grandStr} ${topShowDir}`);
    const fileSeason = parseSeasonFromText(fileStr);
    const epWordMatch = /\b(?:episode|ep)[.\s_-]*0?(\d{1,3})\b/i.exec(fileStr)
      || (folderSeason != null ? /(?:^|[.\s_\-])E0?(\d{1,3})(?=[.\s_\-]|$)/i.exec(fileStr) : null);
    if (epWordMatch) {
      seasonNumber = fileSeason != null ? fileSeason : (folderSeason != null ? folderSeason : 1);
      episodeNumber = Number(epWordMatch[1]);
      beforeMatch = fileStr.slice(0, epWordMatch.index);
      afterMatch = fileStr.slice(epWordMatch.index + epWordMatch[0].length);
    }
  }

  // 5. Fallback for files inside a /shows/ folder (e.g. Specials/Featurettes, Pilot "00 ...", "X1 ...", or single-file season packs)
  if (seasonNumber == null && inShowsFolder) {
    const detectedSeason = parseSeasonFromText(`${fileStr} ${parentStr} ${grandStr} ${topShowDir}`);
    seasonNumber = isSpecialsPath ? 0 : (detectedSeason != null ? detectedSeason : 1);
    const leadNum = /^(?:movie[.\s_-]*|x)?0?(\d{1,2})\b/i.exec(fileStr);
    episodeNumber = leadNum ? Number(leadNum[1]) : 1;
    beforeMatch = topShowDir || grandStr || parentStr || fileStr;
    afterMatch = fileStr;
  }

  if (seasonNumber != null && episodeNumber != null) {
    if (isSpecialsPath && seasonNumber > 0 && /^(?:deleted\s*scenes?|featurettes?|specials?|extras?)/i.test(parentStr)) {
      seasonNumber = 0;
    }
    const folderShow = (topShowDir ? cleanShowName(topShowDir) : '')
      || (!NON_SHOW_FOLDER_RE.test(parentStr) && !GENERIC_FOLDERS.has(parentStr.toLowerCase()) ? cleanShowName(parentStr) : '')
      || (!NON_SHOW_FOLDER_RE.test(grandStr) && !GENERIC_FOLDERS.has(grandStr.toLowerCase()) ? cleanShowName(grandStr) : '');

    let beforeShow = cleanShowName(beforeMatch);
    let extraEpTitleFromBefore = '';
    if (folderShow && beforeShow && folderShow.toLowerCase().startsWith(beforeShow.toLowerCase()) && folderShow.length > beforeShow.length) {
      beforeShow = folderShow;
    } else if (folderShow && beforeShow && beforeShow.toLowerCase().startsWith(folderShow.toLowerCase() + ' ')) {
      const rem = beforeShow.slice(folderShow.length).trim();
      extraEpTitleFromBefore = rem ? rem.charAt(0).toUpperCase() + rem.slice(1) : '';
      beforeShow = folderShow;
    }

    const candidates = isSpecialsPath
      ? [folderShow, beforeShow]
      : [beforeShow, folderShow];

    const showName = candidates.find(Boolean) || 'TV Series';

    let episodeTitle = cleanMovieTitle(afterMatch).title || extraEpTitleFromBefore;
    if (episodeTitle && episodeTitle.toLowerCase() === showName.toLowerCase()) {
      episodeTitle = '';
    }
    if (episodeTitle && episodeTitle.toLowerCase().startsWith(showName.toLowerCase() + ' ')) {
      episodeTitle = episodeTitle.slice(showName.length).trim();
    }
    episodeTitle = episodeTitle
      .replace(/^(?:&|\+)?\s*(?:EP|E)?\d{1,3}\b\s*[-–—:.\s]*/i, '')
      .replace(/^[-–—:.\s]+/, '')
      .replace(/[-–—:.\s]+$/, '')
      .trim();

    const episodeCode = `S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`;
    const displayTitle = episodeTitle
      ? `${showName} · ${episodeCode} · ${episodeTitle}`
      : `${showName} · ${episodeCode}`;

    return {
      isTvShow: true,
      mediaType: 'tv',
      showName,
      seasonNumber,
      episodeNumber,
      episodeCode,
      episodeTitle: episodeTitle || (seasonNumber === 0 ? cleanMovieTitle(fileStr).title || `Special ${episodeNumber}` : `Episode ${episodeNumber}`),
      displayTitle,
      year,
      resolution,
      source,
    };
  }

  return {
    isTvShow: false,
    mediaType: 'movie',
    showName: null,
    seasonNumber: null,
    episodeNumber: null,
    episodeCode: null,
    episodeTitle: null,
    displayTitle: fileCleaned.title || rawName,
    year,
    resolution,
    source,
  };
}

/**
 * Self-heals an existing cached track record so TV Show episodes and Movies
 * have consistent mediaType, showName, seasonNumber, episodeNumber, and grouped album.
 * Returns true if any property on `track` was updated.
 */
function upgradeTrackVideoGrouping(track) {
  if (!track) return false;
  const filePath = String(track.cloud?.remotePath || track.filePath || '');
  const ext = path.extname(filePath).toLowerCase();
  if (ext && !VIDEO_EXTENSIONS.has(ext)) return false;

  const parts = filePath.split('/').filter(Boolean);
  const rawFile = parts.length ? path.parse(parts[parts.length - 1]).name : (track.title || '');
  const parentDir = parts.length >= 2 ? parts[parts.length - 2] : '';
  const grandParentDir = parts.length >= 3 ? parts[parts.length - 3] : '';

  // Check raw filename first, then fallback to track.title / track.album
  let info = parseVideoMediaInfo(rawFile, parentDir, grandParentDir, filePath);
  if (!info.isTvShow && track.title) {
    info = parseVideoMediaInfo(track.title, parentDir, grandParentDir, filePath);
  }
  if (!info.isTvShow && track.album) {
    info = parseVideoMediaInfo(track.album, parentDir, grandParentDir, filePath);
  }

  let changed = false;
  const set = (k, v) => {
    if (v !== undefined && track[k] !== v) {
      track[k] = v;
      changed = true;
    }
  };

  if (info.isTvShow) {
    const existingEpTitle = String(track.episodeTitle || '').trim();
    const hasCleanEnrichedEpTitle = existingEpTitle
      && !/^Episode\s+\d+$/i.test(existingEpTitle)
      && !/\b(2160p|4k|1080p|720p|480p|BluRay|BRRip|BDRip|WEBRip|WEB-DL|WEB|HDRip|DVDRip|HDTV|x264|x265|hevc|h264|aac|ac3|dts)\b/i.test(existingEpTitle)
      && (/^Episode\s+\d+$/i.test(info.episodeTitle || '') || track.metadataProvider === 'tvmaze');
    const finalEpTitle = hasCleanEnrichedEpTitle ? existingEpTitle : info.episodeTitle;
    const finalDisplayTitle = finalEpTitle
      ? `${info.showName} · ${info.episodeCode} · ${finalEpTitle}`
      : info.displayTitle;

    set('mediaType', 'tv');
    set('showName', info.showName);
    set('seasonNumber', info.seasonNumber);
    set('episodeNumber', info.episodeNumber);
    set('episodeCode', info.episodeCode);
    set('episodeTitle', finalEpTitle);
    set('album', info.showName);
    set('albumArtist', info.showName);
    set('discNumber', info.seasonNumber);
    set('trackNumber', info.episodeNumber);
    set('title', finalDisplayTitle);
    if (!track.genre || track.genre === 'Movies') set('genre', 'TV Series');
  } else {
    set('mediaType', 'movie');
    if (info.displayTitle) {
      const needsTitleClean = !track.title
        || track.title.includes('(')
        || /^\d{1,2}\s+(?:The\s+)?Final\s+Destination\b/i.test(track.title)
        || /^Avengers\s+End\s*Game$/i.test(track.title)
        || (track.title === track.title.toLowerCase() && /[a-z]/.test(track.title));
      if (needsTitleClean) {
        const cleanedTitle = info.displayTitle;
        const yr = info.year || track.year || null;
        set('title', cleanedTitle);
        set('album', yr ? `${cleanedTitle} (${yr})` : cleanedTitle);
      }
    }
  }

  return changed;
}

/**
 * Best guess at title / artist / album / year from a remote movie or audio path.
 */
function guessFromRemotePath(remotePath, name = '') {
  const parts = String(remotePath || '').split('/').filter(Boolean);
  const file = name || parts[parts.length - 1] || '';
  const ext = path.extname(file).toLowerCase();
  const rawName = path.parse(file).name;
  const isVideo = VIDEO_EXTENSIONS.has(ext);

  const dirs = parts.slice(0, -1);
  let discNumber = null;
  if (dirs.length && DISC_FOLDER.test(dirs[dirs.length - 1])) {
    discNumber = Number(DISC_FOLDER.exec(dirs[dirs.length - 1])[2]);
    dirs.pop();
  }
  const parentDir = dirs[dirs.length - 1] || '';
  const grandParentDir = dirs[dirs.length - 2] || '';

  if (isVideo) {
    const tvInfo = parseVideoMediaInfo(rawName, parentDir, grandParentDir, remotePath);
    if (tvInfo.isTvShow) {
      const badge = [tvInfo.resolution, tvInfo.source].filter(Boolean).join(' ');
      return {
        title: tvInfo.displayTitle,
        artist: badge || 'TV Series',
        albumArtist: tvInfo.showName,
        album: tvInfo.showName,
        trackNumber: tvInfo.episodeNumber,
        discNumber: tvInfo.seasonNumber,
        year: tvInfo.year,
        genre: 'TV Series',
        resolution: tvInfo.resolution,
        mediaType: 'tv',
        showName: tvInfo.showName,
        seasonNumber: tvInfo.seasonNumber,
        episodeNumber: tvInfo.episodeNumber,
        episodeTitle: tvInfo.episodeTitle,
        episodeCode: tvInfo.episodeCode,
      };
    }

    const fileCleaned = cleanMovieTitle(rawName);
    const folderCleaned = parentDir && !GENERIC_FOLDERS.has(parentDir.toLowerCase())
      ? cleanMovieTitle(parentDir)
      : { title: '', year: null, resolution: null, source: null };

    const preferFolder = folderCleaned.title && (
      (folderCleaned.year && !fileCleaned.year) ||
      /^(movie|video|film|sample|feature|disc\s*\d+|part\s*\d+)$/i.test(fileCleaned.title) ||
      fileCleaned.title.length < 2
    );

    const title = (preferFolder ? folderCleaned.title : fileCleaned.title) || folderCleaned.title || rawName;
    const year = fileCleaned.year || folderCleaned.year || null;
    const resolution = fileCleaned.resolution || folderCleaned.resolution || null;
    const source = fileCleaned.source || folderCleaned.source || null;
    const badge = [resolution, source].filter(Boolean).join(' ');

    // Each movie gets its own poster card in the Library grid ("Title (Year)")
    const album = year ? `${title} (${year})` : title;
    const artist = badge || (grandParentDir && !GENERIC_FOLDERS.has(grandParentDir.toLowerCase()) ? grandParentDir : 'Feature Film');

    return {
      title,
      artist,
      album,
      trackNumber: null,
      discNumber,
      year,
      genre: 'Movies',
      resolution,
      mediaType: 'movie',
    };
  }

  let title = rawName.replace(/_/g, ' ').trim();
  const out = { title, artist: 'Unknown Artist', album: 'Unknown Album', trackNumber: null, discNumber, year: null };

  const num = /^(?:(\d{1,2})[-.])?(\d{1,3})(?:\s*[-.)_]\s*|\s+)(.+)$/.exec(title);
  if (num && Number(num[2]) > 0 && Number(num[2]) < 200) {
    out.trackNumber = Number(num[2]);
    if (num[1]) out.discNumber = Number(num[1]);
    title = num[3].trim();
  }
  const dash = title.split(' - ');
  if (dash.length >= 2 && dash[0].trim() && !/^\d+$/.test(dash[0].trim())) {
    out.artist = dash[0].trim();
    title = dash.slice(1).join(' - ').trim();
  }
  out.title = title || out.title;

  let albumDir = parentDir;
  const artistDir = grandParentDir;
  if (albumDir && !GENERIC_FOLDERS.has(albumDir.toLowerCase())) {
    const year = /\s*[([]((?:19|20)\d\d)[)\]]\s*/.exec(albumDir) || /^((?:19|20)\d\d)\s*-\s*/.exec(albumDir);
    if (year) { out.year = Number(year[1]); albumDir = albumDir.replace(year[0], ' ').trim(); }
    const split = albumDir.split(' - ');
    if (split.length >= 2 && !/^\d+$/.test(split[0].trim())) {
      if (out.artist === 'Unknown Artist') out.artist = split[0].trim();
      albumDir = split.slice(1).join(' - ').trim();
    }
    out.album = albumDir || out.album;
    if (out.artist === 'Unknown Artist' && artistDir && !GENERIC_FOLDERS.has(artistDir.toLowerCase())) out.artist = artistDir;
  }
  return out;
}

module.exports = {
  isSampleVideoPath,
  cleanMovieTitle,
  cleanShowName,
  parseVideoMediaInfo,
  upgradeTrackVideoGrouping,
  guessFromRemotePath,
  AUDIO_EXTENSIONS,
  VIDEO_EXTENSIONS,
  generateTrackId,
  generateArtId,
  toSafeFileUrl,
  findFolderCover,
  trackFromMetadata,
  fallbackTrack,
};
