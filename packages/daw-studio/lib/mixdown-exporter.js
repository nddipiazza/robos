'use strict';

/**
 * RobOS DAW Studio — Multi-Format Stereo Mixdown Exporter
 *
 * Transcodes rendered stereo WAV mixdown audio into popular consumer & studio
 * audio formats (MP3, WAV 16/24/32f, FLAC, M4A/AAC, OGG Vorbis, Opus, AIFF)
 * using FFmpeg (`libmp3lame`, `flac`, `aac`, `libvorbis`, `libopus`, `pcm_*`).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const MIXDOWN_FORMATS = [
  {
    id: 'mp4',
    label: 'MP4 Video (.mp4) — Camera Video + Stereo Audio Mixdown',
    ext: 'mp4',
    dialogName: 'MP4 Video + Audio',
    defaultQuality: 'stream_copy',
    qualities: [
      { id: 'stream_copy', label: 'Instant Lossless Video Copy + 320 kbps AAC' },
      { id: '1080p_hq', label: '1080p H.264 High Quality (CRF 18) + 320 kbps AAC' },
      { id: '720p_hd', label: '720p H.264 HD (CRF 20) + 256 kbps AAC' },
    ],
  },
  {
    id: 'mp3',
    label: 'MP3 (.mp3) — MPEG-1 Layer III',
    ext: 'mp3',
    dialogName: 'MP3 Audio',
    defaultQuality: '320k',
    qualities: [
      { id: '320k', label: '320 kbps CBR (Studio Max)' },
      { id: '256k', label: '256 kbps CBR (High)' },
      { id: '192k', label: '192 kbps CBR (Standard)' },
      { id: 'v0', label: 'V0 VBR (~245 kbps Variable)' },
    ],
  },
  {
    id: 'wav',
    label: 'WAV (.wav) — Uncompressed Lossless PCM',
    ext: 'wav',
    dialogName: 'WAV Audio',
    defaultQuality: 'pcm_s24le',
    qualities: [
      { id: 'pcm_s24le', label: '24-bit PCM (Studio Master)' },
      { id: 'pcm_s16le', label: '16-bit PCM (CD Standard)' },
      { id: 'pcm_f32le', label: '32-bit IEEE Float' },
    ],
  },
  {
    id: 'flac',
    label: 'FLAC (.flac) — Lossless Compressed',
    ext: 'flac',
    dialogName: 'FLAC Lossless Audio',
    defaultQuality: '24bit',
    qualities: [
      { id: '24bit', label: '24-bit Lossless (Level 8)' },
      { id: '16bit', label: '16-bit Lossless (CD Compatible)' },
    ],
  },
  {
    id: 'm4a',
    label: 'M4A / AAC (.m4a) — Apple & Streaming',
    ext: 'm4a',
    dialogName: 'M4A / AAC Audio',
    defaultQuality: '256k',
    qualities: [
      { id: '320k', label: '320 kbps AAC (Max)' },
      { id: '256k', label: '256 kbps AAC (iTunes Plus)' },
      { id: '192k', label: '192 kbps AAC (Streaming)' },
    ],
  },
  {
    id: 'ogg',
    label: 'OGG Vorbis (.ogg) — Open Web & Game Audio',
    ext: 'ogg',
    dialogName: 'OGG Vorbis Audio',
    defaultQuality: 'q8',
    qualities: [
      { id: 'q8', label: 'Quality 8 (~256 kbps)' },
      { id: 'q6', label: 'Quality 6 (~192 kbps)' },
      { id: 'q4', label: 'Quality 4 (~128 kbps)' },
    ],
  },
  {
    id: 'opus',
    label: 'Opus (.opus) — Modern High-Efficiency Audio',
    ext: 'opus',
    dialogName: 'Opus Audio',
    defaultQuality: '192k',
    qualities: [
      { id: '256k', label: '256 kbps Opus (Transparent Master)' },
      { id: '192k', label: '192 kbps Opus (High)' },
      { id: '128k', label: '128 kbps Opus (Compact)' },
    ],
  },
  {
    id: 'aiff',
    label: 'AIFF (.aiff) — Apple Uncompressed Studio PCM',
    ext: 'aiff',
    dialogName: 'AIFF Audio',
    defaultQuality: 'pcm_s24be',
    qualities: [
      { id: 'pcm_s24be', label: '24-bit PCM Big-Endian' },
      { id: 'pcm_s16be', label: '16-bit PCM Big-Endian' },
    ],
  },
];

function getMixdownFormatSpec(formatId = 'mp3') {
  const clean = String(formatId || 'mp3').toLowerCase().replace(/^\./, '');
  return MIXDOWN_FORMATS.find(f => f.id === clean || f.ext === clean)
    || MIXDOWN_FORMATS.find(f => f.id === 'mp3')
    || MIXDOWN_FORMATS[0];
}

function ensureFormatExtension(filePath, ext) {
  const cleanExt = String(ext || 'mp3').replace(/^\./, '').toLowerCase();
  const curExt = path.extname(filePath || '').replace(/^\./, '').toLowerCase();
  if (curExt === cleanExt) return filePath;
  // Strip any other known mixdown extension before appending `.cleanExt`
  const knownExts = new Set(MIXDOWN_FORMATS.map(f => f.ext));
  const stem = knownExts.has(curExt)
    ? filePath.slice(0, -(curExt.length + 1))
    : filePath;
  return `${stem}.${cleanExt}`;
}

function buildFfmpegCodecArgs(formatSpec, qualityId, sampleRate = 48000) {
  const sr = [44100, 48000, 88200, 96000].includes(Number(sampleRate)) ? Number(sampleRate) : 48000;
  const q = qualityId || formatSpec.defaultQuality;

  switch (formatSpec.id) {
    case 'mp3':
      if (q === 'v0') return ['-ar', String(sr), '-c:a', 'libmp3lame', '-q:a', '0'];
      return ['-ar', String(sr), '-c:a', 'libmp3lame', '-b:a', ['320k', '256k', '192k', '128k'].includes(q) ? q : '320k'];

    case 'wav': {
      const codec = ['pcm_s24le', 'pcm_s16le', 'pcm_f32le'].includes(q) ? q : 'pcm_s24le';
      return ['-ar', String(sr), '-c:a', codec];
    }

    case 'flac':
      if (q === '16bit') {
        return ['-ar', String(sr), '-c:a', 'flac', '-compression_level', '8', '-sample_fmt', 's16'];
      }
      return ['-ar', String(sr), '-c:a', 'flac', '-compression_level', '8'];

    case 'm4a': {
      const br = ['320k', '256k', '192k'].includes(q) ? q : '256k';
      return ['-ar', String(sr), '-c:a', 'aac', '-b:a', br, '-movflags', '+faststart'];
    }

    case 'ogg': {
      const qNum = q === 'q4' ? '4' : (q === 'q6' ? '6' : '8');
      return ['-ar', String(sr), '-c:a', 'libvorbis', '-q:a', qNum];
    }

    case 'opus': {
      // Opus mandates 48000 Hz internal clock (24k/16k/12k/8k also valid; 48k is highest fidelity)
      const br = ['256k', '192k', '128k'].includes(q) ? q : '192k';
      return ['-ar', '48000', '-c:a', 'libopus', '-b:a', br];
    }

    case 'aiff': {
      const codec = q === 'pcm_s16be' ? 'pcm_s16be' : 'pcm_s24be';
      return ['-ar', String(sr), '-c:a', codec];
    }

    default:
      return ['-ar', String(sr), '-c:a', 'libmp3lame', '-b:a', '320k'];
  }
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { maxBuffer: 16 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) {
        reject(new Error(`FFmpeg mixdown encode failed: ${(stderr || err.message || '').trim()}`));
        return;
      }
      resolve();
    });
  });
}

/**
 * Transcode a rendered stereo WAV staging buffer into `outPath` in any supported format.
 */
async function transcodeMixdownBuffer(wavBuffer, {
  outPath,
  format = 'mp3',
  quality = '',
  sampleRate = 48000,
  title = '',
  videoMuxSpec = null,
} = {}) {
  if (!Buffer.isBuffer(wavBuffer) || wavBuffer.length < 44) {
    throw new Error('Invalid or empty WAV staging buffer for mixdown export.');
  }
  const spec = getMixdownFormatSpec(format);
  const finalOutPath = ensureFormatExtension(outPath, spec.ext);
  fs.mkdirSync(path.dirname(finalOutPath), { recursive: true });

  // MP4 Video + Stereo Audio Mixdown Muxer (combines recorded camera .mp4 + full stereo DAW mixdown)
  if (spec.id === 'mp4') {
    const vidPath = videoMuxSpec?.videoFile ? String(videoMuxSpec.videoFile) : '';
    if (!vidPath || !fs.existsSync(vidPath)) {
      throw new Error('Select a video track with a recorded or imported .mp4 clip to export MP4 video.');
    }
    const sr = [44100, 48000].includes(Number(sampleRate)) ? Number(sampleRate) : 48000;
    const q = quality || spec.defaultQuality;
    const renderStartSec = Math.max(0, Number(videoMuxSpec.renderStartSec) || 0);
    const renderEndSec = Math.max(renderStartSec + 0.05, Number(videoMuxSpec.renderEndSec) || (renderStartSec + 10));
    const clipStartSec = Math.max(0, Number(videoMuxSpec.clipStartSec) || 0);
    const clipOffsetSec = Math.max(0, Number(videoMuxSpec.clipOffsetSec) || 0);
    const sliceDurSec = Math.max(0.05, renderEndSec - renderStartSec);
    const vidSeekSec = clipOffsetSec + Math.max(0, renderStartSec - clipStartSec);
    const leadPadSec = Math.max(0, clipStartSec - renderStartSec);
    const metaArgs = title ? ['-metadata', `title=${String(title).slice(0, 180)}`] : [];

    const tmpWav = path.join(os.tmpdir(), `robos-daw-vidmux-${crypto.randomBytes(5).toString('hex')}.wav`);
    try {
      fs.writeFileSync(tmpWav, wavBuffer);
      if (q === 'stream_copy' && leadPadSec <= 0.04) {
        const fastArgs = [
          '-y',
          '-v', 'error',
          ...(vidSeekSec > 0.005 ? ['-ss', vidSeekSec.toFixed(4)] : []),
          '-i', vidPath,
          '-i', tmpWav,
          '-t', sliceDurSec.toFixed(4),
          '-map', '0:v:0',
          '-map', '1:a:0',
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '320k',
          '-ar', String(sr),
          '-movflags', '+faststart',
          ...metaArgs,
          finalOutPath,
        ];
        await runFfmpeg(fastArgs);
      } else {
        const vfParts = [];
        if (q === '720p_hd') {
          vfParts.push("scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2");
        } else {
          vfParts.push("scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2");
        }
        if (leadPadSec > 0.04) {
          vfParts.push(`tpad=start_duration=${leadPadSec.toFixed(4)}:start_mode=add:color=black`);
        }
        const crf = q === '720p_hd' ? '20' : '18';
        const aBr = q === '720p_hd' ? '256k' : '320k';
        const encArgs = [
          '-y',
          '-v', 'error',
          ...(vidSeekSec > 0.005 ? ['-ss', vidSeekSec.toFixed(4)] : []),
          '-i', vidPath,
          '-i', tmpWav,
          '-t', sliceDurSec.toFixed(4),
          '-map', '0:v:0',
          '-map', '1:a:0',
          '-vf', vfParts.join(','),
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-crf', crf,
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', aBr,
          '-ar', String(sr),
          '-movflags', '+faststart',
          ...metaArgs,
          finalOutPath,
        ];
        await runFfmpeg(encArgs);
      }
      const stat = fs.statSync(finalOutPath);
      return {
        ok: true,
        filePath: finalOutPath,
        bytes: stat.size,
        format: 'mp4',
        ext: 'mp4',
        quality: q,
      };
    } finally {
      try { fs.unlinkSync(tmpWav); } catch {}
    }
  }

  // Fast direct write only when 16-bit WAV @ 48kHz is requested and matches input verbatim
  if (spec.id === 'wav' && quality === 'pcm_s16le' && Number(sampleRate) === 48000 && wavBuffer.readUInt16LE(34) === 16) {
    fs.writeFileSync(finalOutPath, wavBuffer);
    const stat = fs.statSync(finalOutPath);
    return {
      ok: true,
      filePath: finalOutPath,
      bytes: stat.size,
      format: spec.id,
      ext: spec.ext,
      quality: quality || spec.defaultQuality,
    };
  }

  const tmpWav = path.join(os.tmpdir(), `robos-daw-mixdown-${crypto.randomBytes(5).toString('hex')}.wav`);
  try {
    fs.writeFileSync(tmpWav, wavBuffer);
    const codecArgs = buildFfmpegCodecArgs(spec, quality, sampleRate);
    const metaArgs = title ? ['-metadata', `title=${String(title).slice(0, 180)}`] : [];
    const args = [
      '-y',
      '-v', 'error',
      '-i', tmpWav,
      '-vn',
      ...codecArgs,
      ...metaArgs,
      finalOutPath,
    ];
    await runFfmpeg(args);
    const stat = fs.statSync(finalOutPath);
    return {
      ok: true,
      filePath: finalOutPath,
      bytes: stat.size,
      format: spec.id,
      ext: spec.ext,
      quality: quality || spec.defaultQuality,
    };
  } finally {
    try { fs.unlinkSync(tmpWav); } catch {}
  }
}

module.exports = {
  MIXDOWN_FORMATS,
  getMixdownFormatSpec,
  ensureFormatExtension,
  buildFfmpegCodecArgs,
  transcodeMixdownBuffer,
};
