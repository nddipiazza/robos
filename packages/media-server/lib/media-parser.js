'use strict';

/**
 * RobOS Media Server — Multi-Media Filename, Tag & Scene-Release Parser
 *
 * Classifies and extracts rich structured metadata across:
 *   - Movies (.mp4, .mkv, .webm, .m4v, .mov, .avi, .ts, .m2ts, .mpg, .mpeg, .ogv)
 *   - TV Shows (automatic S01E01 / Season / multi-episode / folder hierarchy detection)
 *   - Music & Audio (.mp3, .flac, .m4a, .aac, .ogg, .opus, .wav, .wma + lightweight header tags & embedded art)
 *   - Books, Comics & Audiobooks (.epub, .pdf, .mobi, .azw3, .djvu, .cbz, .cbr, .txt, .md, .m4b)
 *   - Education & Courses (structured video lectures + course books)
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VIDEO_EXTS = new Set([
  '.mp4', '.mkv', '.webm', '.m4v', '.mov', '.avi', '.ts', '.m2ts', '.mpg', '.mpeg', '.ogv', '.wmv', '.flv',
]);

const AUDIO_EXTS = new Set([
  '.mp3', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.wma', '.alac', '.aiff',
]);

const BOOK_EXTS = new Set([
  '.epub', '.pdf', '.mobi', '.azw3', '.djvu', '.cbz', '.cbr', '.m4b',
]);

const DOC_BOOK_EXTS = new Set([
  '.epub', '.pdf', '.mobi', '.azw3', '.djvu', '.cbz', '.cbr', '.m4b', '.txt', '.md',
]);

const SUBTITLE_EXTS = ['.srt', '.vtt', '.en.srt', '.en.vtt', '.eng.srt', '.eng.vtt'];
const ART_FILENAMES = [
  'poster.jpg', 'poster.jpeg', 'poster.png', 'poster.webp',
  'cover.jpg', 'cover.jpeg', 'cover.png', 'cover.webp',
  'folder.jpg', 'folder.jpeg', 'folder.png',
  'front.jpg', 'front.png', 'album.jpg', 'thumb.jpg', 'fanart.jpg',
];

const MIME_BY_EXT = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.ts': 'video/mp2t',
  '.m2ts': 'video/mp2t',
  '.mpg': 'video/mpeg',
  '.mpeg': 'video/mpeg',
  '.ogv': 'video/ogg',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.m4b': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.wma': 'audio/x-ms-wma',
  '.epub': 'application/epub+zip',
  '.pdf': 'application/pdf',
  '.mobi': 'application/x-mobipocket-ebook',
  '.azw3': 'application/vnd.amazon.ebook',
  '.djvu': 'image/vnd.djvu',
  '.cbz': 'application/vnd.comicbook+zip',
  '.cbr': 'application/vnd.comicbook-rar',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const SAMPLE_VIDEO_RE = /(?:^|[\\/._ -])(sample|rarbg\.com|etrg|trailer-sample)(?:[\\/._ -]|$)/i;

const RELEASE_NOISE_RE = /\b(2160p|4k|uhd|1080p|720p|480p|bluray|blu-ray|bdrip|brrip|web-?dl|webrip|web|hdrip|dvdrip|hdtv|remux|proper|repack|extended|unrated|directors\.?cut|x264|h\.?264|avc|x265|h\.?265|hevc|av1|xvid|divx|10bit|8bit|hdr10\+?|hdr|dv|dolby\.?vision|ddp5\.?1|dd5\.?1|ac3|eac3|aac2?\.?0?|dts(?:-?hd)?|truehd|atmos|5\.1|7\.1|2ch|6ch|rarbg|yts(?:\.[a-z]+)?|yify|galaxyrg|galaxytv|tgx|eztv(?:\.[a-z]+)?|ettv|ntb|psa|evo|sparks|fgt|amzn|nf|dsnp|atvp|hmax|pmtp|hulu)\b/ig;

function itemIdForPath(filePath) {
  return 'itm_' + crypto.createHash('sha1').update(String(filePath)).digest('hex').slice(0, 16);
}

function mimeForPath(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

function isSampleFile(filePath, sizeBytes = 0) {
  const base = path.basename(filePath);
  if (/^RARBG/i.test(base) || /^WWW\.YTS/i.test(base) || /^Torrent-Downloaded/i.test(base)) return true;
  if (SAMPLE_VIDEO_RE.test(base) && sizeBytes > 0 && sizeBytes < 80 * 1024 * 1024) return true;
  return false;
}

function cleanSceneTitle(raw, { allowEmpty = false } = {}) {
  let s = String(raw || '')
    .replace(/^www\.[a-z0-9.-]+\s*-\s*/i, '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*(?:1080p|720p|2160p|WEBRip|WEB-DL|BluRay|x264|x265|HEVC|YTS|RARBG|Garshasp)[^)]*\)/gi, ' ');
  s = s.replace(/[._]+/g, ' ');
  // If string starts directly with a quality/source token (e.g. after S01E01), strip everything from there
  if (/^\s*(?:2160p|4k|1080p|720p|480p|bluray|blu-ray|bdrip|brrip|web-?dl|webrip|hdrip|dvdrip|hdtv|x264|x265|h\.?264|h\.?265|hevc|proper|repack)\b/i.test(s)) {
    return allowEmpty ? '' : String(raw || '').trim();
  }
  // Cut at quality / release token if there is a title before it
  const cutMatch = s.match(/^(.+?)\s+(?:2160p|4k|1080p|720p|480p|bluray|blu-ray|bdrip|brrip|web-?dl|webrip|hdrip|dvdrip|hdtv)\b/i);
  if (cutMatch && cutMatch[1].trim().length >= 2) {
    s = cutMatch[1];
  }
  s = s.replace(RELEASE_NOISE_RE, ' ');
  s = s.replace(/(?:^|\s)-[A-Za-z0-9]+$/, ' ');
  s = s.replace(/^[-–\s]+|[-–\s]+$/g, '').replace(/\s+/g, ' ').trim();
  if (allowEmpty) return s;
  return s || String(raw || '').trim();
}

function extractYear(raw) {
  const str = String(raw || '');
  const paren = str.match(/[([]\s*((?:19[2-9]\d|20[0-3]\d))\s*[)\]]/);
  if (paren) return Number(paren[1]);
  const matches = [...str.matchAll(/(?:^|[.\s_-])((?:19[2-9]\d|20[0-3]\d))(?:$|[.\s_-])/g)];
  for (let i = matches.length - 1; i >= 0; i--) {
    const y = Number(matches[i][1]);
    if (y !== 1080 && y !== 2160) return y;
  }
  return null;
}

function extractQualityInfo(raw) {
  const s = String(raw || '');
  let resolution = '';
  if (/\b(2160p|4k|uhd)\b/i.test(s)) resolution = '4K UHD';
  else if (/\b1080p\b/i.test(s)) resolution = '1080p';
  else if (/\b720p\b/i.test(s)) resolution = '720p';
  else if (/\b480p\b/i.test(s)) resolution = '480p';

  let videoCodec = '';
  if (/\b(x265|h\.?265|hevc)\b/i.test(s)) videoCodec = 'HEVC';
  else if (/\bav1\b/i.test(s)) videoCodec = 'AV1';
  else if (/\b(x264|h\.?264|avc)\b/i.test(s)) videoCodec = 'H.264';
  else if (/\b(xvid|divx)\b/i.test(s)) videoCodec = 'MPEG-4';

  let audioCodec = '';
  if (/\batmos\b/i.test(s)) audioCodec = 'Atmos';
  else if (/\btruehd\b/i.test(s)) audioCodec = 'TrueHD';
  else if (/\bdts(?:-?hd)?\b/i.test(s)) audioCodec = 'DTS';
  else if (/\b(ddp|eac3)\b/i.test(s)) audioCodec = 'EAC3';
  else if (/\b(ac3|dd5\.?1)\b/i.test(s)) audioCodec = 'AC3';
  else if (/\bflac\b/i.test(s)) audioCodec = 'FLAC';
  else if (/\baac\b/i.test(s)) audioCodec = 'AAC';

  let source = '';
  if (/\b(bluray|blu-ray|bdrip|brrip|remux)\b/i.test(s)) source = 'BluRay';
  else if (/\bweb-?dl\b/i.test(s)) source = 'WEB-DL';
  else if (/\bwebrip\b/i.test(s)) source = 'WEBRip';
  else if (/\bhdtv\b/i.test(s)) source = 'HDTV';

  const hdr = /\b(dolby\.?vision|dv)\b/i.test(s) ? 'Dolby Vision' : (/\bhdr10\+?\b/i.test(s) ? 'HDR10' : '');
  const badge = [resolution, hdr, source || videoCodec].filter(Boolean).join(' · ') || 'HD';
  return { resolution, videoCodec, audioCodec, source, hdr, badge };
}

/**
 * Detects whether a video likely needs FFmpeg remux/transcode for HTML5 <video> playback.
 * Chromium plays MP4/WebM/M4V with H.264 + AAC/MP3/Opus natively; MKV with AC3/EAC3/DTS/HEVC or AVI/TS/MPG benefit from live remux/transcode.
 */
function inferNeedsWebTranscode(filePath, qualityInfo = {}) {
  const ext = path.extname(filePath).toLowerCase();
  if (['.avi', '.ts', '.m2ts', '.mpg', '.mpeg', '.wmv', '.flv'].includes(ext)) return true;
  if (qualityInfo.videoCodec === 'HEVC' || qualityInfo.videoCodec === 'MPEG-4') return true;
  if (['AC3', 'EAC3', 'DTS', 'TrueHD', 'Atmos'].includes(qualityInfo.audioCodec)) return true;
  return false;
}

/**
 * Parses TV Show, Season, Episode from filename and parent directories.
 */
function parseTvEpisode(filePath, rootDir) {
  const rel = rootDir ? path.relative(rootDir, filePath) : filePath;
  const parts = rel.split(path.sep).filter(Boolean);
  const baseName = path.basename(filePath, path.extname(filePath));

  // Match S01E02, s1e2, 1x02, Season 1 Episode 2
  const seMatch = baseName.match(/(?:^|[.\s_-])S(\d{1,2})\s*E(\d{1,3})(?:[-E](\d{1,3}))?(?:$|[.\s_-])/i)
    || baseName.match(/(?:^|[.\s_-])(\d{1,2})x(\d{2,3})(?:$|[.\s_-])/i)
    || baseName.match(/Season\s*(\d{1,2})\s*Episode\s*(\d{1,3})/i);

  if (!seMatch) return null;

  const seasonNumber = Number(seMatch[1]);
  const episodeNumber = Number(seMatch[2]);
  if (!Number.isFinite(seasonNumber) || !Number.isFinite(episodeNumber)) return null;

  const idx = seMatch.index || 0;
  let beforeSe = baseName.slice(0, idx).replace(/[-._\s]+$/, '').trim();
  let afterSe = baseName.slice(idx + seMatch[0].length).replace(/^[-._\s]+/, '').trim();

  // Derive show name from filename prefix or parent folder
  let showName = cleanSceneTitle(beforeSe);
  if (!showName || /^episode\s*\d*$/i.test(showName) || showName.length < 2) {
    // Look up parent folders (skipping "Season X" folders)
    for (let i = parts.length - 2; i >= 0; i--) {
      const folder = parts[i];
      if (/^(?:season|series|specials|s\d{1,2}|subs?|subtitles)\b/i.test(folder.trim())) continue;
      const cleanedFolder = cleanSceneTitle(
        folder
          .replace(/\bS\d{1,2}(?:\s*-\s*S?\d{1,2})?\b.*/i, '')
          .replace(/\bSeason\s*\d+(?:\s*-\s*\d+)?\b.*/i, '')
      );
      if (cleanedFolder && cleanedFolder.length >= 2) {
        showName = cleanedFolder;
        break;
      }
    }
  }
  // Remove trailing year from showName if present (keep year separately)
  const year = extractYear(beforeSe) || extractYear(parts[0] || '');
  if (year) {
    const stripped = showName.replace(new RegExp(`\\s*[([]?${year}[)\\]]?\\s*$`), '').trim();
    if (stripped.length >= 2) showName = stripped;
  }

  // Extract episode title if present before quality tags
  let episodeTitle = '';
  if (afterSe) {
    const cleanedAfter = cleanSceneTitle(afterSe, { allowEmpty: true });
    if (cleanedAfter && !/^\d{3,4}p$/i.test(cleanedAfter) && cleanedAfter.toLowerCase() !== showName.toLowerCase()) {
      episodeTitle = cleanedAfter;
    }
  }

  const episodeCode = `S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`;
  return {
    showName: showName || 'Unknown Series',
    seasonNumber,
    episodeNumber,
    episodeCode,
    episodeTitle,
    year,
  };
}

function inferVideoGenres(title, folderHint = '') {
  const hay = `${title} ${folderHint}`.toLowerCase();
  const genres = [];
  if (/\b(kids|bluey|disney|pixar|animated|animation|avatar)\b/.test(hay)) genres.push('Family & Animation');
  if (/\b(avengers|marvel|iron man|batman|spider|star wars|dune|matrix|alien)\b/.test(hay)) genres.push('Sci-Fi & Action');
  if (/\b(annabelle|conjuring|horror|halloween|scream|saw|youre next|insidious)\b/.test(hay)) genres.push('Horror & Thriller');
  if (/\b(office|parks|american dad|archer|comedy|anyone but you)\b/.test(hay)) genres.push('Comedy');
  if (/\b(house|atypical|breaking bad|drama|crown)\b/.test(hay)) genres.push('Drama');
  if (/\b(javascript|python|java|node|coding|course|tutorial|masterclass|developer)\b/.test(hay)) genres.push('Education');
  return genres.length ? genres : ['Movies & Cinema'];
}

// ── Lightweight Audio Header Tag & Cover Reader (ID3v2, FLAC, OGG) ──────────

function decodeSynchsafeInt(buf, offset) {
  return ((buf[offset] & 0x7f) << 21)
    | ((buf[offset + 1] & 0x7f) << 14)
    | ((buf[offset + 2] & 0x7f) << 7)
    | (buf[offset + 3] & 0x7f);
}

function decodeId3Text(buf) {
  if (!buf || buf.length < 2) return '';
  const enc = buf[0];
  const payload = buf.subarray(1);
  let str = '';
  if (enc === 0) str = payload.toString('latin1');
  else if (enc === 1) {
    if (payload[0] === 0xff && payload[1] === 0xfe) str = payload.subarray(2).toString('utf16le');
    else if (payload[0] === 0xfe && payload[1] === 0xff) {
      const swapped = Buffer.allocUnsafe(payload.length - 2);
      for (let i = 2; i + 1 < payload.length; i += 2) {
        swapped[i - 2] = payload[i + 1];
        swapped[i - 1] = payload[i];
      }
      str = swapped.toString('utf16le');
    } else str = payload.toString('utf16le');
  } else if (enc === 2) {
    str = payload.toString('utf16le');
  } else {
    str = payload.toString('utf8');
  }
  return str.replace(/\0+/g, ' ').trim();
}

function readAudioHeaderTags(filePath) {
  const tags = {};
  let fd = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const head = Buffer.alloc(16);
    const n = fs.readSync(fd, head, 0, 16, 0);
    if (n < 10) return tags;

    // ID3v2 (.mp3)
    if (head.toString('latin1', 0, 3) === 'ID3') {
      const version = head[3];
      const tagSize = decodeSynchsafeInt(head, 6);
      const readLen = Math.min(tagSize + 10, 512 * 1024);
      const buf = Buffer.alloc(readLen);
      fs.readSync(fd, buf, 0, readLen, 0);
      let pos = 10;
      while (pos + 10 <= buf.length) {
        const frameId = buf.toString('latin1', pos, pos + 4);
        if (!/^[A-Z0-9]{4}$/.test(frameId)) break;
        const frameSize = version === 4 ? decodeSynchsafeInt(buf, pos + 4) : buf.readUInt32BE(pos + 4);
        if (frameSize <= 0 || pos + 10 + frameSize > buf.length) break;
        const body = buf.subarray(pos + 10, pos + 10 + frameSize);
        if (frameId === 'TIT2') tags.title = decodeId3Text(body);
        else if (frameId === 'TPE1') tags.artist = decodeId3Text(body);
        else if (frameId === 'TPE2') tags.albumArtist = decodeId3Text(body);
        else if (frameId === 'TALB') tags.album = decodeId3Text(body);
        else if (frameId === 'TCON') tags.genre = decodeId3Text(body);
        else if (frameId === 'TYER' || frameId === 'TDRC') {
          const y = parseInt(decodeId3Text(body), 10);
          if (y >= 1900 && y <= 2100) tags.year = y;
        } else if (frameId === 'TRCK') {
          const trk = parseInt(decodeId3Text(body), 10);
          if (trk > 0) tags.trackNumber = trk;
        } else if (frameId === 'APIC') {
          tags.hasEmbeddedArt = true;
        }
        pos += 10 + frameSize;
      }
    } else if (head.toString('latin1', 0, 4) === 'fLaC') {
      // FLAC Vorbis comments & PICTURE metadata blocks
      const readLen = 256 * 1024;
      const buf = Buffer.alloc(readLen);
      const bytesRead = fs.readSync(fd, buf, 0, readLen, 0);
      let pos = 4;
      while (pos + 4 <= bytesRead) {
        const isLast = (buf[pos] & 0x80) !== 0;
        const blockType = buf[pos] & 0x7f;
        const blockLen = (buf[pos + 1] << 16) | (buf[pos + 2] << 8) | buf[pos + 3];
        pos += 4;
        if (blockType === 6) {
          tags.hasEmbeddedArt = true;
        } else if (blockType === 4 && pos + blockLen <= bytesRead) {
          let cPos = pos;
          const vendorLen = buf.readUInt32LE(cPos);
          cPos += 4 + vendorLen;
          if (cPos + 4 <= pos + blockLen) {
            const count = buf.readUInt32LE(cPos);
            cPos += 4;
            for (let i = 0; i < count && cPos + 4 <= pos + blockLen; i++) {
              const len = buf.readUInt32LE(cPos);
              cPos += 4;
              if (cPos + len > pos + blockLen) break;
              const entry = buf.toString('utf8', cPos, cPos + len);
              cPos += len;
              const eq = entry.indexOf('=');
              if (eq > 0) {
                const k = entry.slice(0, eq).toUpperCase();
                const v = entry.slice(eq + 1).trim();
                if (k === 'TITLE') tags.title = v;
                else if (k === 'ARTIST') tags.artist = v;
                else if (k === 'ALBUMARTIST') tags.albumArtist = v;
                else if (k === 'ALBUM') tags.album = v;
                else if (k === 'GENRE') tags.genre = v;
                else if (k === 'DATE' || k === 'YEAR') {
                  const y = parseInt(v, 10);
                  if (y >= 1900 && y <= 2100) tags.year = y;
                } else if (k === 'TRACKNUMBER') {
                  const t = parseInt(v, 10);
                  if (t > 0) tags.trackNumber = t;
                }
              }
            }
          }
        }
        pos += blockLen;
        if (isLast) break;
      }
    }
  } catch {} finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch {} }
  }
  return tags;
}

/**
 * Extracts embedded APIC / FLAC picture bytes from an audio file when requested.
 */
function extractEmbeddedAudioArt(filePath) {
  let fd = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const head = Buffer.alloc(10);
    if (fs.readSync(fd, head, 0, 10, 0) < 10) return null;
    if (head.toString('latin1', 0, 3) === 'ID3') {
      const version = head[3];
      const tagSize = decodeSynchsafeInt(head, 6);
      const readLen = Math.min(tagSize + 10, 4 * 1024 * 1024);
      const buf = Buffer.alloc(readLen);
      fs.readSync(fd, buf, 0, readLen, 0);
      let pos = 10;
      while (pos + 10 <= buf.length) {
        const frameId = buf.toString('latin1', pos, pos + 4);
        if (!/^[A-Z0-9]{4}$/.test(frameId)) break;
        const frameSize = version === 4 ? decodeSynchsafeInt(buf, pos + 4) : buf.readUInt32BE(pos + 4);
        if (frameSize <= 0 || pos + 10 + frameSize > buf.length) break;
        if (frameId === 'APIC') {
          const body = buf.subarray(pos + 10, pos + 10 + frameSize);
          // Find JPEG (FF D8 FF) or PNG (89 50 4E 47) magic inside APIC frame
          for (let i = 1; i < Math.min(body.length - 4, 128); i++) {
            if (body[i] === 0xff && body[i + 1] === 0xd8 && body[i + 2] === 0xff) {
              return { buffer: body.subarray(i), mime: 'image/jpeg' };
            }
            if (body[i] === 0x89 && body[i + 1] === 0x50 && body[i + 2] === 0x4e && body[i + 3] === 0x47) {
              return { buffer: body.subarray(i), mime: 'image/png' };
            }
          }
        }
        pos += 10 + frameSize;
      }
    } else if (head.toString('latin1', 0, 4) === 'fLaC') {
      const stat = fs.fstatSync(fd);
      const readLen = Math.min(stat.size, 4 * 1024 * 1024);
      const buf = Buffer.alloc(readLen);
      const bytesRead = fs.readSync(fd, buf, 0, readLen, 0);
      let pos = 4;
      while (pos + 4 <= bytesRead) {
        const isLast = (buf[pos] & 0x80) !== 0;
        const blockType = buf[pos] & 0x7f;
        const blockLen = (buf[pos + 1] << 16) | (buf[pos + 2] << 8) | buf[pos + 3];
        pos += 4;
        if (blockType === 6 && pos + blockLen <= bytesRead) {
          let p = pos + 4; // picture type
          const mimeLen = buf.readUInt32BE(p); p += 4;
          const mime = buf.toString('latin1', p, p + mimeLen) || 'image/jpeg'; p += mimeLen;
          const descLen = buf.readUInt32BE(p); p += 4 + descLen + 16;
          const dataLen = buf.readUInt32BE(p); p += 4;
          if (dataLen > 0 && p + dataLen <= pos + blockLen) {
            return { buffer: buf.subarray(p, p + dataLen), mime };
          }
        }
        pos += blockLen;
        if (isLast) break;
      }
    }
  } catch {} finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch {} }
  }
  return null;
}

function findSidecarArt(filePath) {
  const dir = path.dirname(filePath);
  const stem = path.basename(filePath, path.extname(filePath));
  for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
    const sameStem = path.join(dir, stem + ext);
    if (fs.existsSync(sameStem)) return sameStem;
    const posterStem = path.join(dir, stem + '-poster' + ext);
    if (fs.existsSync(posterStem)) return posterStem;
  }
  for (const name of ART_FILENAMES) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  try {
    const entries = fs.readdirSync(dir);
    const img = entries.find(e => /\.(jpg|jpeg|png|webp)$/i.test(e) && !/sample/i.test(e));
    if (img) return path.join(dir, img);
  } catch {}
  return null;
}

function findSidecarSubtitle(filePath) {
  const dir = path.dirname(filePath);
  const stem = path.basename(filePath, path.extname(filePath));
  for (const ext of SUBTITLE_EXTS) {
    const p = path.join(dir, stem + ext);
    if (fs.existsSync(p)) return p;
  }
  for (const subDirName of ['Subs', 'subs', 'Subtitles', 'subtitles']) {
    const subDir = path.join(dir, subDirName);
    try {
      if (fs.existsSync(subDir) && fs.statSync(subDir).isDirectory()) {
        const files = fs.readdirSync(subDir);
        const eng = files.find(f => /eng|english/i.test(f) && /\.(srt|vtt)$/i.test(f))
          || files.find(f => /\.(srt|vtt)$/i.test(f));
        if (eng) return path.join(subDir, eng);
      }
    } catch {}
  }
  return null;
}

function parseMusicItem(filePath, rootDir, stat) {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath, ext);
  const rel = rootDir ? path.relative(rootDir, filePath) : filePath;
  const parts = rel.split(path.sep).filter(Boolean);

  const tags = readAudioHeaderTags(filePath);

  // Fallback folder hierarchy: Artist / [Year -] Album / [Disc /] [Track -] Title
  let folderArtist = '';
  let folderAlbum = '';
  let folderYear = null;
  if (parts.length >= 3) {
    folderArtist = parts[0].replace(/\s*-\s*(?:complete\s*)?discography.*/i, '').trim();
    const albumRaw = parts[parts.length - 2];
    const ym = albumRaw.match(/^[([]?(\d{4})[)\]]?\s*[-–]\s*(.+)$/) || albumRaw.match(/^(.+?)\s*[([](\d{4})[)\]]$/);
    if (ym) {
      if (/^\d{4}$/.test(ym[1])) { folderYear = Number(ym[1]); folderAlbum = ym[2].trim(); }
      else { folderAlbum = ym[1].trim(); folderYear = Number(ym[2]); }
    } else {
      folderAlbum = albumRaw;
    }
  } else if (parts.length === 2) {
    const dirName = parts[0];
    const ym = dirName.match(/^(\d{4})\s*[-–]\s*(.+)$/);
    if (ym) {
      folderYear = Number(ym[1]);
      folderAlbum = ym[2].trim();
    } else {
      const splitDash = dirName.match(/^(.+?)\s+-\s+(.+)$/);
      if (splitDash) {
        folderArtist = splitDash[1].trim();
        folderAlbum = splitDash[2].trim();
      } else {
        folderArtist = dirName;
        folderAlbum = dirName;
      }
    }
  }

  let trackNumber = tags.trackNumber || null;
  let discNumber = null;
  let cleanBase = base;
  const discTrk = cleanBase.match(/^(\d{1,2})-(\d{1,3})\s+(.+)$/);
  if (discTrk) {
    discNumber = Number(discTrk[1]);
    if (!trackNumber) trackNumber = Number(discTrk[2]);
    cleanBase = discTrk[3];
  } else {
    const trkMatch = cleanBase.match(/^(\d{1,3})(?:\s*[-._]\s*|\s+)(.+)$/);
    if (trkMatch) {
      if (!trackNumber) trackNumber = Number(trkMatch[1]);
      cleanBase = trkMatch[2];
    }
  }

  // Check "Artist - Title" in single-file tracks
  let fileArtist = '';
  if (!tags.artist && !folderArtist && cleanBase.includes(' - ')) {
    const [a, ...rest] = cleanBase.split(' - ');
    if (a.trim() && rest.join(' - ').trim()) {
      fileArtist = a.trim();
      cleanBase = rest.join(' - ').trim();
    }
  }

  const lossless = ext === '.flac' || ext === '.wav' || ext === '.alac' || ext === '.aiff';
  const sidecarArt = findSidecarArt(filePath);
  const lrcPath = fs.existsSync(filePath.replace(/\.[^.]+$/, '.lrc')) ? filePath.replace(/\.[^.]+$/, '.lrc') : null;

  return {
    mediaType: 'music',
    title: tags.title || cleanBase.replace(/_/g, ' ').trim(),
    artist: tags.artist || folderArtist || fileArtist || path.basename(rootDir || 'Unknown Artist'),
    albumArtist: tags.albumArtist || folderArtist || tags.artist || '',
    album: tags.album || folderAlbum || 'Singles',
    genre: tags.genre || (rootDir && /video game/i.test(rootDir) ? 'Soundtrack' : 'Music'),
    year: tags.year || folderYear || null,
    trackNumber,
    discNumber,
    lossless,
    codec: ext.slice(1).toUpperCase(),
    sizeBytes: stat.size,
    sidecarArt,
    hasEmbeddedArt: Boolean(tags.hasEmbeddedArt),
    sidecarSubtitle: lrcPath,
  };
}

function parseBookItem(filePath, rootDir, stat, epubMeta = null) {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath, ext);
  const rel = rootDir ? path.relative(rootDir, filePath) : filePath;
  const parts = rel.split(path.sep).filter(Boolean);
  const folderName = parts.length > 1 ? parts[0] : base;

  // Match "Title by Author EPUB" or "Author - Title"
  let title = (epubMeta && epubMeta.title) || '';
  let author = (epubMeta && epubMeta.author) || '';
  const rawCandidate = folderName.replace(/\s+(?:EPUB|PDF|MOBI|AZW3|RETAIL|eBook)\s*$/i, '').trim();
  const byMatch = rawCandidate.match(/^(.+?)\s+by\s+([A-Z][A-Za-z0-9 .,'&-]+)$/);
  if (byMatch) {
    if (!title) title = byMatch[1].trim();
    if (!author) author = byMatch[2].trim();
  } else {
    const cleanedBase = base.replace(/\s+(?:EPUB|PDF|MOBI|AZW3)\s*$/i, '').replace(/[._]+/g, ' ').trim();
    const baseBy = cleanedBase.match(/^(.+?)\s+by\s+([A-Z][A-Za-z0-9 .,'&-]+)$/);
    if (baseBy) {
      if (!title) title = baseBy[1].trim();
      if (!author) author = baseBy[2].trim();
    } else if (!title) {
      title = cleanedBase || rawCandidate;
    }
  }

  const sidecarArt = findSidecarArt(filePath);
  const format = ext.slice(1).toUpperCase();
  return {
    mediaType: 'book',
    title: title || base,
    author: author || 'Unknown Author',
    artist: author || 'Unknown Author',
    album: parts.length > 1 ? rawCandidate : 'RobOS Library Books',
    bookFormat: format,
    chapterCount: epubMeta?.chapterCount || null,
    overview: epubMeta?.description || `${format} eBook served by RobOS Media Server.`,
    genre: epubMeta?.subject || (rootDir && /education/i.test(rootDir) ? 'Education & Tech' : 'Books'),
    year: extractYear(rawCandidate) || epubMeta?.year || null,
    sizeBytes: stat.size,
    sidecarArt,
    hasEmbeddedArt: Boolean(epubMeta?.hasCover),
    readableInBrowser: ext === '.epub' || ext === '.pdf' || ext === '.txt' || ext === '.md' || ext === '.cbz',
  };
}

function parseVideoItem(filePath, rootDir, stat, serviceKind = 'movies') {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath, ext);
  const rel = rootDir ? path.relative(rootDir, filePath) : filePath;
  const parts = rel.split(path.sep).filter(Boolean);
  const quality = extractQualityInfo(rel);
  const tv = parseTvEpisode(filePath, rootDir);
  const sidecarArt = findSidecarArt(filePath);
  const sidecarSubtitle = findSidecarSubtitle(filePath);
  const needsTranscode = inferNeedsWebTranscode(filePath, quality);

  if (serviceKind === 'education' && !tv) {
    const courseName = parts.length > 1 ? parts[0].replace(/[._]+/g, ' ').trim() : 'Courses';
    const moduleName = parts.length > 2 ? parts.slice(1, -1).join(' / ') : 'Lectures';
    return {
      mediaType: 'education',
      title: base.replace(/[._]+/g, ' ').trim(),
      courseName,
      moduleName,
      artist: courseName,
      album: `${courseName}${moduleName !== 'Lectures' ? ' — ' + moduleName : ''}`,
      genre: 'Education',
      genres: ['Education'],
      year: extractYear(courseName) || null,
      qualityBadge: quality.badge,
      resolution: quality.resolution,
      videoCodec: quality.videoCodec,
      audioCodec: quality.audioCodec,
      needsTranscode,
      sizeBytes: stat.size,
      sidecarArt,
      sidecarSubtitle,
      overview: `Course lecture from ${courseName}.`,
    };
  }

  if (tv || serviceKind === 'shows') {
    const showName = tv?.showName || cleanSceneTitle(parts[0] || base);
    const seasonNumber = tv?.seasonNumber ?? 1;
    const episodeNumber = tv?.episodeNumber ?? 1;
    const episodeCode = tv?.episodeCode || `S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`;
    const episodeTitle = tv ? tv.episodeTitle : cleanSceneTitle(base);
    const genres = inferVideoGenres(showName, rootDir || '');
    return {
      mediaType: 'tv',
      title: episodeTitle && episodeTitle.toLowerCase() !== showName.toLowerCase()
        ? `${showName} - ${episodeCode} - ${episodeTitle}`
        : `${showName} - ${episodeCode}`,
      showName,
      seasonNumber,
      episodeNumber,
      episodeCode,
      episodeTitle: episodeTitle || `Episode ${episodeNumber}`,
      artist: quality.badge || 'TV Series',
      album: showName,
      genre: genres[0],
      genres,
      year: tv?.year || extractYear(rel) || null,
      qualityBadge: quality.badge,
      resolution: quality.resolution,
      videoCodec: quality.videoCodec,
      audioCodec: quality.audioCodec,
      needsTranscode,
      sizeBytes: stat.size,
      sidecarArt,
      sidecarSubtitle,
      overview: `${showName} · Season ${seasonNumber}, Episode ${episodeNumber}${episodeTitle ? ` (“${episodeTitle}”)` : ''}.`,
    };
  }

  // Movie
  const folderCandidate = parts.length > 1 ? parts[parts.length - 2] : base;
  const movieTitle = cleanSceneTitle(base.length >= 4 && !/^(movie|video|film|part\s*\d)$/i.test(base) ? base : folderCandidate);
  const year = extractYear(base) || extractYear(folderCandidate);
  const cleanTitle = year
    ? (movieTitle.replace(new RegExp(`\\s*[([]?${year}[)\\]]?\\s*$`), '').trim() || movieTitle)
    : movieTitle;
  const genres = inferVideoGenres(cleanTitle, rootDir || '');

  return {
    mediaType: 'movie',
    title: cleanTitle,
    artist: quality.badge || 'Cinema',
    album: cleanTitle,
    genre: genres[0],
    genres,
    year,
    qualityBadge: quality.badge,
    resolution: quality.resolution,
    videoCodec: quality.videoCodec,
    audioCodec: quality.audioCodec,
    needsTranscode,
    sizeBytes: stat.size,
    sidecarArt,
    sidecarSubtitle,
    overview: `${cleanTitle}${year ? ` (${year})` : ''} · ${quality.badge}.`,
  };
}

module.exports = {
  VIDEO_EXTS,
  AUDIO_EXTS,
  BOOK_EXTS,
  DOC_BOOK_EXTS,
  MIME_BY_EXT,
  itemIdForPath,
  mimeForPath,
  isSampleFile,
  cleanSceneTitle,
  extractYear,
  extractQualityInfo,
  inferNeedsWebTranscode,
  parseTvEpisode,
  parseVideoItem,
  parseMusicItem,
  parseBookItem,
  extractEmbeddedAudioArt,
  findSidecarArt,
  findSidecarSubtitle,
};
