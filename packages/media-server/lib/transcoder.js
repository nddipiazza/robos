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
    'Cache-Control': 'no-store',
    'X-RobOS-Transcode-Mode': canCopyVideo ? 'remux-h264-aac' : 'transcode-x264-aac',
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

async function serveSubtitlesVtt(res, item) {
  const headers = {
    'Content-Type': 'text/vtt; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=3600',
  };
  if (item.sidecarSubtitle && fs.existsSync(item.sidecarSubtitle)) {
    try {
      const raw = fs.readFileSync(item.sidecarSubtitle, 'utf8');
      const ext = path.extname(item.sidecarSubtitle).toLowerCase();
      if (ext === '.vtt') {
        res.writeHead(200, headers);
        res.end(raw);
        return;
      }
      if (ext === '.srt') {
        res.writeHead(200, headers);
        res.end(srtToVtt(raw));
        return;
      }
      if (ext === '.lrc') {
        res.writeHead(200, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(raw);
        return;
      }
    } catch {}
  }

  // Try embedded text subtitles via FFmpeg if video
  if (HAS_FFMPEG && (item.mediaType === 'movie' || item.mediaType === 'tv')) {
    const probe = await probeMediaFile(item.filePath);
    const textSub = probe?.subtitles?.find(s => ['subrip', 'srt', 'ass', 'ssa', 'mov_text', 'webvtt'].includes(s.codec));
    if (textSub) {
      await new Promise((resolve) => {
        execFile('ffmpeg', [
          '-hide_banner', '-loglevel', 'error',
          '-i', item.filePath,
          '-map', `0:${textSub.streamIndex}`,
          '-f', 'webvtt', 'pipe:1',
        ], { timeout: 12000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
          if (!err && stdout && stdout.includes('WEBVTT')) {
            res.writeHead(200, headers);
            res.end(stdout);
          } else {
            res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ found: false }));
          }
          resolve();
        });
      });
      return;
    }
  }

  res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ found: false }));
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

  // 4. Extract video thumbnail frame with FFmpeg at ~10% / 45s into the video
  if (HAS_FFMPEG && (item.mediaType === 'movie' || item.mediaType === 'tv' || item.mediaType === 'education') && fs.existsSync(item.filePath)) {
    const generated = await new Promise((resolve) => {
      execFile('ffmpeg', [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-ss', '35',
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
    if (generated) {
      try { return sendBuf(fs.readFileSync(cachedJpg), 'image/jpeg'); } catch {}
    }
  }

  // 5. Crisp SVG poster fallback
  return sendBuf(Buffer.from(generatePosterSvg(item), 'utf8'), 'image/svg+xml');
}

module.exports = {
  HAS_FFMPEG,
  HAS_FFPROBE,
  probeMediaFile,
  streamFileWithRanges,
  streamTranscodedVideo,
  streamTranscodedAudio,
  serveSubtitlesVtt,
  serveItemArtwork,
  srtToVtt,
};
