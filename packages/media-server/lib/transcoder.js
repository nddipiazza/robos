'use strict';

/**
 * RobOS Media Server — HTTP 206 Byte-Range Streamer, FFmpeg Live Remux/Transcoder,
 * Poster/Cover Generator & WebVTT Subtitle Extractor
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { extractEmbeddedAudioArt } = require('./media-parser');
const { extractEpubCover } = require('./epub-reader');

const probeCache = new Map();

function hasBinary(bin) {
  const dirs = (process.env.PATH || '/usr/local/bin:/usr/bin:/bin').split(path.delimiter);
  for (const d of dirs) {
    try {
      const full = path.join(d, bin);
      if (fs.existsSync(full) && fs.statSync(full).isFile()) return true;
    } catch {}
  }
  return false;
}

const HAS_FFMPEG = hasBinary('ffmpeg');
const HAS_FFPROBE = hasBinary('ffprobe');

function probeMediaFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return Promise.resolve(null);
  const cached = probeCache.get(filePath);
  if (cached) return Promise.resolve(cached);
  if (!HAS_FFPROBE) return Promise.resolve(null);

  return new Promise((resolve) => {
    execFile('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ], { timeout: 8000, maxBuffer: 2 * 1024 * 1024 }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      try {
        const raw = JSON.parse(stdout);
        const streams = Array.isArray(raw.streams) ? raw.streams : [];
        const vStream = streams.find(s => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
        const aStreams = streams.filter(s => s.codec_type === 'audio');
        const sStreams = streams.filter(s => s.codec_type === 'subtitle');
        const info = {
          durationSec: Number(raw.format?.duration) || 0,
          bitRate: Number(raw.format?.bit_rate) || 0,
          formatName: raw.format?.format_name || '',
          video: vStream ? {
            codec: vStream.codec_name,
            profile: vStream.profile || '',
            width: vStream.width || 0,
            height: vStream.height || 0,
            pixFmt: vStream.pix_fmt || '',
          } : null,
          audio: aStreams.map((a, idx) => ({
            index: idx,
            streamIndex: a.index,
            codec: a.codec_name,
            channels: a.channels || 2,
            language: a.tags?.language || 'und',
            title: a.tags?.title || '',
          })),
          subtitles: sStreams.map((s, idx) => ({
            index: idx,
            streamIndex: s.index,
            codec: s.codec_name,
            language: s.tags?.language || 'und',
            title: s.tags?.title || '',
          })),
        };
        if (probeCache.size > 2000) probeCache.clear();
        probeCache.set(filePath, info);
        resolve(info);
      } catch {
        resolve(null);
      }
    });
  });
}

/**
 * RFC 7233 HTTP 206 Partial Content byte-range streaming for instant video/audio seeking.
 */
function streamFileWithRanges(req, res, filePath, mimeType, { downloadName = null } = {}) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Media file not found on disk' }));
    return;
  }

  const total = stat.size;
  const baseHeaders = {
    'Content-Type': mimeType || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=3600',
  };
  if (downloadName) {
    const safeName = String(downloadName).replace(/["\r\n]/g, '_');
    baseHeaders['Content-Disposition'] = `attachment; filename="${safeName}"`;
  }

  if (req.method === 'HEAD') {
    res.writeHead(200, { ...baseHeaders, 'Content-Length': total });
    res.end();
    return;
  }

  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!m) {
      res.writeHead(416, { ...baseHeaders, 'Content-Range': `bytes */${total}` });
      res.end();
      return;
    }
    let start = m[1] ? parseInt(m[1], 10) : 0;
    let end = m[2] ? parseInt(m[2], 10) : total - 1;
    if (!m[1] && m[2]) {
      start = Math.max(0, total - parseInt(m[2], 10));
      end = total - 1;
    }
    if (start >= total || end >= total || start > end) {
      res.writeHead(416, { ...baseHeaders, 'Content-Range': `bytes */${total}` });
      res.end();
      return;
    }
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      ...baseHeaders,
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': chunkSize,
    });
    const stream = fs.createReadStream(filePath, { start, end });
    req.on('close', () => stream.destroy());
    stream.on('error', () => res.destroy());
    stream.pipe(res);
    return;
  }

  res.writeHead(200, { ...baseHeaders, 'Content-Length': total });
  const stream = fs.createReadStream(filePath);
  req.on('close', () => stream.destroy());
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

/**
 * Live FFmpeg fragmented MP4 streaming (/transcode/:id.mp4?start=0&quality=1080p).
 * - If video is already H.264 8-bit, remuxes `-c:v copy` (near-zero CPU!) and transcodes audio to stereo AAC.
 * - Otherwise transcodes video with `libx264 -preset veryfast -crf 22` + stereo AAC.
 */
async function streamTranscodedVideo(req, res, item, { startSec = 0, quality = '' } = {}) {
  if (!HAS_FFMPEG) {
    return streamFileWithRanges(req, res, item.filePath, item.mimeType);
  }
  const probe = await probeMediaFile(item.filePath);
  const vCodec = probe?.video?.codec || '';
  const pixFmt = probe?.video?.pixFmt || '';
  const canCopyVideo = vCodec === 'h264' && !pixFmt.includes('10') && !quality;

  const args = ['-hide_banner', '-loglevel', 'error'];
  if (startSec > 0) {
    args.push('-ss', String(Math.max(0, Number(startSec) || 0)));
  }
  args.push('-i', item.filePath);
  args.push('-map', '0:v:0');
  args.push('-map', '0:a:0?');

  if (canCopyVideo) {
    args.push('-c:v', 'copy');
  } else {
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p');
    if (quality === '720p') args.push('-vf', 'scale=-2:720');
    else if (quality === '480p') args.push('-vf', 'scale=-2:480');
  }

  const firstAudio = probe?.audio?.[0];
  if (firstAudio && firstAudio.codec === 'aac' && (firstAudio.channels || 2) <= 2) {
    args.push('-c:a', 'copy');
  } else {
    args.push('-c:a', 'aac', '-ac', '2', '-b:a', '192k');
  }

  args.push(
    '-sn',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof+faststart',
    '-f', 'mp4',
    'pipe:1'
  );

  res.writeHead(200, {
    'Content-Type': 'video/mp4',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'X-Media-Duration, X-RobOS-Transcode-Mode',
    'Cache-Control': 'no-store',
    'X-RobOS-Transcode-Mode': canCopyVideo ? 'remux-h264-aac' : 'transcode-x264-aac',
    ...(probe?.durationSec > 0 ? { 'X-Media-Duration': String(probe.durationSec) } : {}),
  });

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'ignore'] });
  const killProc = () => { try { proc.kill('SIGKILL'); } catch {} };
  req.on('close', killProc);
  res.on('close', killProc);
  proc.on('error', () => { if (!res.headersSent) res.writeHead(500); res.end(); });
  proc.stdout.pipe(res);
}

function streamTranscodedAudio(req, res, item) {
  if (!HAS_FFMPEG) {
    return streamFileWithRanges(req, res, item.filePath, item.mimeType);
  }
  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  if (req.method === 'HEAD') { res.end(); return; }
  const proc = spawn('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-i', item.filePath,
    '-vn', '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '256k',
    '-f', 'mp3', 'pipe:1',
  ], { stdio: ['ignore', 'pipe', 'ignore'] });
  const killProc = () => { try { proc.kill('SIGKILL'); } catch {} };
  req.on('close', killProc);
  res.on('close', killProc);
  proc.stdout.pipe(res);
}

function srtToVtt(srtText) {
  const normalized = String(srtText || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return 'WEBVTT\n\n' + normalized.trim() + '\n';
}

function vttToSrt(vttText) {
  const raw = String(vttText || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const blocks = raw.replace(/^WEBVTT[^\n]*\n+/i, '').trim().split(/\n{2,}/);
  const out = [];
  let seq = 1;
  for (const blk of blocks) {
    const lines = blk.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const timeIdx = lines.findIndex(l => l.includes('-->'));
    if (timeIdx < 0) continue;
    const timeLine = lines[timeIdx]
      .replace(/(^|\s)(\d{2}:\d{2}\.\d{3})/g, '$100:$2')
      .replace(/(\d{2}:\d{2}:\d{2})\.(\d{3})/g, '$1,$2')
      .replace(/\s+(align|position|line|size):.*$/i, '');
    const textLines = lines.slice(timeIdx + 1)
      .map(l => l.replace(/<[^>]+>/g, '').replace(/\{\\[^}]+\}/g, '').trim())
      .filter(Boolean);
    if (!textLines.length) continue;
    out.push(`${seq}\n${timeLine}\n${textLines.join('\n')}`);
    seq += 1;
  }
  return out.join('\n\n') + (out.length ? '\n' : '');
}

function parseVttTimestampSec(ts) {
  const clean = String(ts || '').trim().split(/\s+/)[0].replace(',', '.');
  const parts = clean.split(':');
  if (parts.length === 3) {
    return (Number(parts[0]) || 0) * 3600 + (Number(parts[1]) || 0) * 60 + (Number(parts[2]) || 0);
  }
  if (parts.length === 2) {
    return (Number(parts[0]) || 0) * 60 + (Number(parts[1]) || 0);
  }
  return Number(clean) || 0;
}

function parseWebVttCues(vttText, maxCues = 3500) {
  const raw = String(vttText || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const blocks = raw.replace(/^WEBVTT[^\n]*\n+/i, '').trim().split(/\n{2,}/);
  const cues = [];
  for (const blk of blocks) {
    if (cues.length >= maxCues) break;
    const lines = blk.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const timeIdx = lines.findIndex(l => l.includes('-->'));
    if (timeIdx < 0) continue;
    const [startStr, endStr] = lines[timeIdx].split('-->');
    const s = Math.round(parseVttTimestampSec(startStr) * 100) / 100;
    const e = Math.round(parseVttTimestampSec(endStr) * 100) / 100;
    if (!(e > s)) continue;
    const text = lines.slice(timeIdx + 1)
      .map(l => l
        .replace(/<[^>]+>/g, '')
        .replace(/\{\\[^}]+\}/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/[—–]/g, '-')
        .replace(/[^\x20-\x7E]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      )
      .filter(Boolean)
      .join('\n');
    if (!text) continue;
    cues.push({ s, e, t: text });
  }
  return cues;
}

const TEXT_SUBTITLE_CODECS = new Set(['subrip', 'srt', 'ass', 'ssa', 'mov_text', 'webvtt', 'text']);
const inFlightSubtitleExtracts = new Map();

async function listSubtitleTracks(item) {
  const tracks = [];
  const seenFiles = new Set();

  const addSidecarFile = (fp, hintLabel = '') => {
    if (!fp || seenFiles.has(fp) || !fs.existsSync(fp)) return;
    const ext = path.extname(fp).toLowerCase();
    if (ext !== '.srt' && ext !== '.vtt') return;
    seenFiles.add(fp);
    const stem = path.basename(fp, ext);
    const baseStem = item.filePath ? path.basename(item.filePath, path.extname(item.filePath)) : '';
    let suffix = baseStem && stem.toLowerCase().startsWith(baseStem.toLowerCase())
      ? stem.slice(baseStem.length).replace(/^[._-\s]+/, '')
      : '';
    const lang = suffix ? suffix.slice(0, 12) : 'eng';
    tracks.push({
      trackIndex: tracks.length,
      source: 'sidecar',
      filePath: fp,
      streamIndex: null,
      codec: ext.slice(1),
      language: lang,
      extractable: true,
      label: hintLabel || (suffix ? `External (${suffix} · ${ext.toUpperCase().slice(1)})` : `External (${ext.toUpperCase().slice(1)})`),
    });
  };

  if (item.sidecarSubtitle) {
    addSidecarFile(item.sidecarSubtitle);
  }
  if (item.filePath) {
    try {
      const dir = path.dirname(item.filePath);
      const baseLower = path.basename(item.filePath, path.extname(item.filePath)).toLowerCase();
      if (fs.existsSync(dir)) {
        for (const fn of fs.readdirSync(dir)) {
          const ext = path.extname(fn).toLowerCase();
          if (ext !== '.srt' && ext !== '.vtt') continue;
          const fnStem = path.basename(fn, ext).toLowerCase();
          if (fnStem === baseLower || fnStem.startsWith(`${baseLower}.`) || fnStem.startsWith(`${baseLower}_`) || fnStem.startsWith(`${baseLower}-`)) {
            addSidecarFile(path.join(dir, fn));
          }
        }
      }
    } catch {}
  }

  const probe = (item.mediaType === 'movie' || item.mediaType === 'tv' || item.mediaType === 'education')
    ? await probeMediaFile(item.filePath)
    : null;
  const allEmbedded = Array.isArray(probe?.subtitles) ? probe.subtitles : [];
  for (const s of allEmbedded) {
    const codecLower = String(s.codec || '').toLowerCase();
    if (!TEXT_SUBTITLE_CODECS.has(codecLower)) continue;
    const lang = String(s.language || 'und').trim() || 'und';
    const cleanTitle = String(s.title || '').replace(/[^\x20-\x7E]+/g, '').trim();
    const label = cleanTitle
      ? `${cleanTitle} (${lang.toUpperCase()})`
      : `${lang.toUpperCase()} (${codecLower.toUpperCase()})`;
    tracks.push({
      trackIndex: tracks.length,
      source: 'embedded',
      filePath: item.filePath,
      streamIndex: s.streamIndex,
      codec: codecLower,
      language: lang,
      extractable: true,
      label,
    });
  }

  return { tracks, allEmbedded, probe };
}

async function extractSubtitleTrackVtt(item, trackIndex = 0, subCacheDir = '', { waitMs = 15000 } = {}) {
  const { tracks } = await listSubtitleTracks(item);
  if (!tracks.length) return { found: false, extracting: false, vtt: '', track: null, tracks };
  const idx = Math.max(0, Math.min(tracks.length - 1, Number(trackIndex) || 0));
  const track = tracks[idx];

  if (track.source === 'sidecar' && track.filePath && fs.existsSync(track.filePath)) {
    try {
      const raw = fs.readFileSync(track.filePath, 'utf8');
      const ext = path.extname(track.filePath).toLowerCase();
      const vtt = ext === '.vtt' ? raw : srtToVtt(raw);
      return { found: true, extracting: false, vtt, track, tracks };
    } catch {}
  }

  if (track.source === 'embedded' && HAS_FFMPEG && track.streamIndex !== null) {
    const cacheFile = subCacheDir
      ? path.join(subCacheDir, `${item.id}_s${track.streamIndex}.vtt`)
      : '';
    if (cacheFile && fs.existsSync(cacheFile)) {
      try {
        const cached = fs.readFileSync(cacheFile, 'utf8');
        if (cached.includes('WEBVTT')) {
          return { found: true, extracting: false, vtt: cached, track, tracks };
        }
      } catch {}
    }

    const jobKey = `${item.id}:s${track.streamIndex}`;
    let job = inFlightSubtitleExtracts.get(jobKey);
    if (!job) {
      job = new Promise((resolve) => {
        execFile('ffmpeg', [
          '-hide_banner', '-loglevel', 'error',
          '-i', item.filePath,
          '-map', `0:${track.streamIndex}`,
          '-f', 'webvtt', 'pipe:1',
        ], { timeout: 45000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
          inFlightSubtitleExtracts.delete(jobKey);
          if (!err && stdout && stdout.includes('WEBVTT')) {
            if (cacheFile) {
              try {
                fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
                fs.writeFileSync(cacheFile, stdout, 'utf8');
              } catch {}
            }
            resolve(stdout);
          } else {
            resolve('');
          }
        });
      });
      inFlightSubtitleExtracts.set(jobKey, job);
    }

    const timed = await Promise.race([
      job.then(vtt => ({ done: true, vtt })),
      new Promise(r => setTimeout(() => r({ done: false, vtt: '' }), Math.max(250, Number(waitMs) || 15000))),
    ]);
    if (!timed.done) {
      return { found: false, extracting: true, vtt: '', track, tracks };
    }
    if (timed.vtt) {
      return { found: true, extracting: false, vtt: timed.vtt, track, tracks };
    }
  }

  return { found: false, extracting: false, vtt: '', track, tracks };
}

async function serveSubtitlesVtt(res, item, { trackIndex = 0, format = 'vtt', subCacheDir = '' } = {}) {
  if (item.sidecarSubtitle && path.extname(item.sidecarSubtitle).toLowerCase() === '.lrc' && fs.existsSync(item.sidecarSubtitle)) {
    try {
      const raw = fs.readFileSync(item.sidecarSubtitle, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      });
      res.end(raw);
      return;
    } catch {}
  }

  const extracted = await extractSubtitleTrackVtt(item, trackIndex, subCacheDir, { waitMs: 30000 });
  if (extracted.found && extracted.vtt) {
    if (format === 'srt') {
      const srtBody = vttToSrt(extracted.vtt);
      res.writeHead(200, {
        'Content-Type': 'application/x-subrip; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      });
      res.end(srtBody);
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/vtt; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(extracted.vtt);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ found: false, extracting: extracted.extracting }));
}

function generatePosterSvg(item) {
  const title = String(item.showName || item.title || 'Media').slice(0, 38);
  const sub = String(item.episodeCode || item.author || item.artist || item.bookFormat || item.qualityBadge || '').slice(0, 34);
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const badge = (item.mediaType || 'media').toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue}, 45%, 26%)"/>
      <stop offset="100%" stop-color="hsl(${(hue + 48) % 360}, 52%, 11%)"/>
    </linearGradient>
  </defs>
  <rect width="400" height="600" fill="url(#g)"/>
  <rect x="24" y="24" width="352" height="552" rx="16" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="2"/>
  <rect x="40" y="44" width="96" height="28" rx="14" fill="rgba(0,188,212,0.22)" stroke="rgba(0,188,212,0.55)"/>
  <text x="88" y="63" text-anchor="middle" fill="#67e8f9" font-family="system-ui,sans-serif" font-size="12" font-weight="700">${esc(badge)}</text>
  <text x="40" y="460" fill="#f8fafc" font-family="system-ui,sans-serif" font-size="26" font-weight="700">${esc(title)}</text>
  <text x="40" y="496" fill="#94a3b8" font-family="system-ui,sans-serif" font-size="16">${esc(sub)}</text>
  ${item.year ? `<text x="40" y="532" fill="#00bcd4" font-family="system-ui,sans-serif" font-size="15" font-weight="600">${esc(item.year)}</text>` : ''}
</svg>`;
}

async function serveItemArtwork(res, item, artCacheDir) {
  const sendBuf = (buf, mime) => {
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': buf.length,
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(buf);
  };

  // 1. Cached thumbnail on disk
  const cachedJpg = path.join(artCacheDir, `${item.id}.jpg`);
  if (fs.existsSync(cachedJpg)) {
    try { return sendBuf(fs.readFileSync(cachedJpg), 'image/jpeg'); } catch {}
  }

  // 2. Sidecar poster / cover image
  if (item.sidecarArt && fs.existsSync(item.sidecarArt)) {
    try {
      const ext = path.extname(item.sidecarArt).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      return sendBuf(fs.readFileSync(item.sidecarArt), mime);
    } catch {}
  }

  // 3. Embedded audio or EPUB/CBZ cover
  if (item.mediaType === 'music') {
    const emb = extractEmbeddedAudioArt(item.filePath);
    if (emb && emb.buffer) {
      try { if (emb.mime === 'image/jpeg') fs.writeFileSync(cachedJpg, emb.buffer); } catch {}
      return sendBuf(emb.buffer, emb.mime);
    }
  } else if (item.mediaType === 'book' && (item.ext === '.epub' || item.ext === '.cbz')) {
    const emb = extractEpubCover(item.filePath);
    if (emb && emb.buffer) {
      try { if (emb.mime === 'image/jpeg') fs.writeFileSync(cachedJpg, emb.buffer); } catch {}
      return sendBuf(emb.buffer, emb.mime);
    }
  }

  // 4. Extract video thumbnail frame with FFmpeg at ~35s (falling back to 2s for short clips)
  if (HAS_FFMPEG && (item.mediaType === 'movie' || item.mediaType === 'tv' || item.mediaType === 'education') && fs.existsSync(item.filePath)) {
    const extractAt = (seekSec) => new Promise((resolve) => {
      execFile('ffmpeg', [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-ss', String(seekSec),
        '-i', item.filePath,
        '-frames:v', '1',
        '-vf', 'scale=480:-2',
        '-q:v', '5',
        cachedJpg,
      ], { timeout: 6000 }, (err) => {
        if (!err && fs.existsSync(cachedJpg) && fs.statSync(cachedJpg).size > 500) resolve(true);
        else resolve(false);
      });
    });
    const generated = (await extractAt(35)) || (await extractAt(2));
    if (generated) {
      try { return sendBuf(fs.readFileSync(cachedJpg), 'image/jpeg'); } catch {}
    }
  }

  // 5. Crisp SVG poster fallback
  return sendBuf(Buffer.from(generatePosterSvg(item), 'utf8'), 'image/svg+xml');
}

const DIRECT_VIDEO_CONTAINERS = new Set(['.mp4', '.m4v', '.webm', '.mkv', '.ogv']);
const DIRECT_VIDEO_CODECS = new Set(['h264', 'vp8', 'vp9', 'av1', 'theora']);
const DIRECT_AUDIO_CODECS = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm_s16le', 'pcm_s24le', 'pcm_f32le']);

async function analyzePlaybackSupport(filePath, fallbackNeedsTranscode = false) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  const probe = await probeMediaFile(filePath);
  if (!probe) {
    const canDirect = DIRECT_VIDEO_CONTAINERS.has(ext) && !fallbackNeedsTranscode;
    return {
      durationSec: 0,
      canDirectPlay: canDirect,
      needsTranscode: !canDirect,
      hasSubtitles: false,
      video: null,
      audio: [],
      subtitles: [],
    };
  }
  const v = probe.video;
  const a0 = probe.audio?.[0] || null;
  const videoOk = !v || (
    DIRECT_VIDEO_CODECS.has(String(v.codec || '').toLowerCase())
    && !(String(v.codec || '').toLowerCase() === 'h264' && String(v.pixFmt || '').includes('10'))
  );
  const audioOk = !a0 || DIRECT_AUDIO_CODECS.has(String(a0.codec || '').toLowerCase());
  const canDirectPlay = DIRECT_VIDEO_CONTAINERS.has(ext) && videoOk && audioOk;

  return {
    durationSec: Number(probe.durationSec) || 0,
    canDirectPlay,
    needsTranscode: !canDirectPlay,
    hasSubtitles: Array.isArray(probe.subtitles) && probe.subtitles.length > 0,
    video: v,
    audio: probe.audio || [],
    subtitles: probe.subtitles || [],
  };
}

const HLS_SEG_DURATION = 6;

async function serveHlsPlaylist(res, item, baseUrl = '', { audioIdx = 0 } = {}) {
  const probe = await probeMediaFile(item.filePath);
  const dur = Math.max(HLS_SEG_DURATION, Number(probe?.durationSec) || Number(item.duration) || 1800);
  const segCount = Math.max(1, Math.ceil(dur / HLS_SEG_DURATION));
  const cleanBase = String(baseUrl || '').replace(/\/+$/, '');
  const audioQuery = Number(audioIdx) > 0 ? `?audio=${Number(audioIdx)}` : '';
  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-PLAYLIST-TYPE:VOD',
    `#EXT-X-TARGETDURATION:${HLS_SEG_DURATION}`,
    '#EXT-X-MEDIA-SEQUENCE:0',
  ];
  for (let i = 0; i < segCount; i++) {
    const segDur = (i === segCount - 1)
      ? Math.max(0.5, dur - i * HLS_SEG_DURATION)
      : HLS_SEG_DURATION;
    lines.push(`#EXTINF:${segDur.toFixed(3)},`);
    lines.push(`${cleanBase}/hls/${encodeURIComponent(item.id)}/seg_${i}.ts${audioQuery}`);
  }
  lines.push('#EXT-X-ENDLIST');
  res.writeHead(200, {
    'Content-Type': 'application/vnd.apple.mpegurl',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache',
  });
  res.end(lines.join('\n') + '\n');
}

async function serveHlsSegment(req, res, item, segIndex, { audioIdx = 0 } = {}) {
  if (!HAS_FFMPEG) {
    res.writeHead(501, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'FFmpeg not available' }));
    return;
  }
  const probe = await probeMediaFile(item.filePath);
  const vCodec = probe?.video?.codec || '';
  const pixFmt = probe?.video?.pixFmt || '';
  const canCopyVideo = vCodec === 'h264' && !String(pixFmt).includes('10');
  const startSec = Math.max(0, Number(segIndex) || 0) * HLS_SEG_DURATION;
  const aCount = Array.isArray(probe?.audio) ? probe.audio.length : 1;
  const safeAudioIdx = aCount > 0 ? Math.max(0, Math.min(aCount - 1, Number(audioIdx) || 0)) : 0;

  const args = [
    '-hide_banner', '-loglevel', 'error',
    '-ss', String(startSec),
    '-i', item.filePath,
    '-t', String(HLS_SEG_DURATION),
    '-map', '0:v:0',
    '-map', `0:a:${safeAudioIdx}?`,
  ];
  if (canCopyVideo) {
    args.push('-c:v', 'copy');
  } else {
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-g', '48');
  }
  args.push(
    '-c:a', 'aac', '-ac', '2', '-b:a', '192k',
    '-sn',
    '-output_ts_offset', String(startSec),
    '-f', 'mpegts',
    'pipe:1'
  );

  res.writeHead(200, {
    'Content-Type': 'video/mp2t',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=600',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'ignore'] });
  const killProc = () => { try { proc.kill('SIGKILL'); } catch {} };
  req.on('close', killProc);
  res.on('close', killProc);
  proc.on('error', () => { if (!res.headersSent) res.writeHead(500); res.end(); });
  proc.stdout.pipe(res);
}

module.exports = {
  HAS_FFMPEG,
  HAS_FFPROBE,
  probeMediaFile,
  analyzePlaybackSupport,
  streamFileWithRanges,
  streamTranscodedVideo,
  streamTranscodedAudio,
  serveHlsPlaylist,
  serveHlsSegment,
  serveSubtitlesVtt,
  serveItemArtwork,
  srtToVtt,
  vttToSrt,
  parseWebVttCues,
  listSubtitleTracks,
  extractSubtitleTrackVtt,
};
