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
  return MIXDOWN_FORMATS.find(f => f.id === clean || f.ext === clean) || MIXDOWN_FORMATS[0];
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
} = {}) {
  if (!Buffer.isBuffer(wavBuffer) || wavBuffer.length < 44) {
    throw new Error('Invalid or empty WAV staging buffer for mixdown export.');
  }
  const spec = getMixdownFormatSpec(format);
  const finalOutPath = ensureFormatExtension(outPath, spec.ext);
  fs.mkdirSync(path.dirname(finalOutPath), { recursive: true });

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
