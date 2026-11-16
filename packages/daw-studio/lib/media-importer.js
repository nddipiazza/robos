'use strict';

/**
 * RobOS DAW Studio — Universal Audio & Video Media Importer
 *
 * Supports dragging/dropping or importing virtually any audio or video format
 * (MP3, MP4, WAV, FLAC, M4A, AAC, OGG, Opus, AIFF, WMA, ALAC, MKV, WebM, MOV,
 * AVI, FLV, WMV, MPEG/MPG, TS, 3GP, OGV, WavPack, APE, AC3, CAF, etc.) by probing
 * streams with `ffprobe` and transcoding/extracting the audio track to 24-bit
 * studio PCM `.wav` inside the session's `takes/` directory.
 */

const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');
const { execFile } = require('child_process');

const AUDIO_EXTENSIONS = [
  'wav', 'wave', 'mp3', 'flac', 'm4a', 'aac', 'ogg', 'oga', 'opus',
  'wma', 'aiff', 'aif', 'aifc', 'alac', 'amr', 'ape', 'ac3', 'eac3',
  'dts', 'mp2', 'mpa', 'mpga', 'caf', 'wv', 'au', 'snd', 'voc', 'gsm',
  'spx', 'thd', 'mka',
];

const VIDEO_EXTENSIONS = [
  'mp4', 'm4v', 'mkv', 'webm', 'mov', 'avi', 'flv', 'wmv', 'mpg', 'mpeg',
  'ts', 'mts', 'm2ts', '3gp', '3g2', 'ogv', 'vob', 'asf', 'f4v', 'divx',
  'rm', 'rmvb', 'dv', 'mxf',
];

const ALL_MEDIA_EXTENSIONS = Array.from(new Set([...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS]));

const AUDIO_EXT_SET = new Set(AUDIO_EXTENSIONS);
const VIDEO_EXT_SET = new Set(VIDEO_EXTENSIONS);

const MEDIA_DIALOG_FILTERS = [
  {
    name: 'All Audio & Video Media (MP3, MP4, WAV, FLAC, M4A, MKV, MOV, OGG, WebM...)',
    extensions: ALL_MEDIA_EXTENSIONS,
  },
  {
    name: 'Audio Files (MP3, WAV, FLAC, M4A, AAC, OGG, Opus, AIFF, WMA...)',
    extensions: AUDIO_EXTENSIONS,
  },
  {
    name: 'Video Files — Extract Audio (MP4, MKV, WebM, MOV, AVI, WMV, MPEG...)',
    extensions: VIDEO_EXTENSIONS,
  },
  {
    name: 'All Files',
    extensions: ['*'],
  },
];

function classifyMediaExtension(filePath) {
  const ext = String(path.extname(filePath || '')).replace(/^\./, '').toLowerCase();
  if (!ext) return 'unknown';
  if (VIDEO_EXT_SET.has(ext)) return 'video';
  if (AUDIO_EXT_SET.has(ext)) return 'audio';
  return 'unknown';
}

/**
 * Parse a standard `text/uri-list` payload from Linux/desktop file-manager drag-and-drop
 * into local filesystem paths.
 */
function parseDroppedUriList(uriListText) {
  if (!uriListText || typeof uriListText !== 'string') return [];
  const paths = [];
  for (const rawLine of uriListText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('file://')) {
      try {
        paths.push(fileURLToPath(line));
      } catch {
        try {
          paths.push(decodeURIComponent(line.replace(/^file:\/\/(localhost)?/, '')));
        } catch {}
      }
    } else if (path.isAbsolute(line)) {
      paths.push(line);
    }
  }
  return paths;
}

/**
 * Check whether a file on disk is already a standard uncompressed RIFF WAVE PCM
 * (audioFormat 1 integer 16/24/32-bit or audioFormat 3 32-bit float) so small local
 * WAV stems can copy instantaneously without spawning ffmpeg.
 */
function inspectStandardPcmWavHeader(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size < 44) return { isStandardWav: false };
    const fd = fs.openSync(filePath, 'r');
    const hdr = Buffer.alloc(Math.min(4096, stat.size));
    try {
      fs.readSync(fd, hdr, 0, hdr.length, 0);
    } finally {
      fs.closeSync(fd);
    }
    if (hdr.toString('ascii', 0, 4) !== 'RIFF' || hdr.toString('ascii', 8, 12) !== 'WAVE') {
      return { isStandardWav: false };
    }
    let offset = 12;
    let fmtFound = false;
    let audioFormat = 0;
    let channels = 1;
    let sampleRate = 48000;
    let bitsPerSample = 16;
    while (offset + 8 <= hdr.length) {
      const id = hdr.toString('ascii', offset, offset + 4);
      const sz = hdr.readUInt32LE(offset + 4);
      if (id === 'fmt ' && offset + 24 <= hdr.length) {
        audioFormat = hdr.readUInt16LE(offset + 8);
        channels = hdr.readUInt16LE(offset + 10);
        sampleRate = hdr.readUInt32LE(offset + 12);
        bitsPerSample = hdr.readUInt16LE(offset + 22);
        fmtFound = true;
        break;
      }
      offset += 8 + sz + (sz % 2);
    }
    if (!fmtFound) return { isStandardWav: false };
    const extensiblePcm = audioFormat === 0xfffe && sz >= 40 && offset + 34 <= hdr.length && hdr.readUInt16LE(offset + 32) === 1;
    const validPcm = ((audioFormat === 1 || extensiblePcm) && (bitsPerSample === 16 || bitsPerSample === 24 || bitsPerSample === 32))
      || (audioFormat === 3 && bitsPerSample === 32);
    const validRate = sampleRate >= 8000 && sampleRate <= 192000 && channels >= 1 && channels <= 2;
    return {
      isStandardWav: validPcm && validRate,
      channels,
      sampleRate,
      bitsPerSample,
    };
  } catch {
    return { isStandardWav: false };
  }
}

function execFileAsync(cmd, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const detail = String(stderr || err.message || '').trim().split('\n').slice(-3).join(' ');
        reject(new Error(detail || err.message));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function probeMediaStreams(filePath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'stream=index,codec_type,codec_name,channels,sample_rate:format=format_name,duration',
    '-of', 'json',
    filePath,
  ], 25000);
  const parsed = JSON.parse(stdout || '{}');
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const audioStreams = streams.filter(s => s.codec_type === 'audio');
  const videoStreams = streams.filter(s => s.codec_type === 'video');
  const primaryAudio = audioStreams[0] || null;
  return {
    hasAudio: audioStreams.length > 0,
    hasVideo: videoStreams.length > 0,
    audioCodec: primaryAudio?.codec_name || null,
    videoCodec: videoStreams[0]?.codec_name || null,
    channels: Math.max(1, Number(primaryAudio?.channels) || 2),
    sampleRate: Number(primaryAudio?.sample_rate) || 48000,
    durationSec: Number(parsed.format?.duration) || 0,
    formatName: parsed.format?.format_name || '',
  };
}

/**
 * Import or transcode any supported audio or video file into a clean session PCM `.wav`.
 */
async function importMediaFileToWav(srcPath, destWavPath, { sampleRate = 48000 } = {}) {
  if (!srcPath || !fs.existsSync(srcPath)) {
    throw new Error(`Media file not found: ${srcPath}`);
  }

  const extKind = classifyMediaExtension(srcPath);
  const wavCheck = inspectStandardPcmWavHeader(srcPath);
  if (wavCheck.isStandardWav) {
    fs.copyFileSync(srcPath, destWavPath);
    return {
      ok: true,
      mediaKind: 'audio',
      transcoded: false,
      audioCodec: 'pcm_wav',
      channels: wavCheck.channels,
      sampleRate: wavCheck.sampleRate,
      destWavPath,
    };
  }

  let probe = null;
  try {
    probe = await probeMediaStreams(srcPath);
  } catch (err) {
    throw new Error(`Unsupported or unreadable media file "${path.basename(srcPath)}": ${err.message}`);
  }

  if (!probe.hasAudio) {
    if (probe.hasVideo) {
      throw new Error(`"${path.basename(srcPath)}" is a video file with no audio track to import.`);
    }
    throw new Error(`"${path.basename(srcPath)}" does not contain a readable audio stream.`);
  }

  const targetChannels = probe.channels >= 2 ? 2 : 1;
  const targetRate = Math.max(22050, Math.min(96000, Number(sampleRate) || 48000));

  await execFileAsync('ffmpeg', [
    '-nostdin',
    '-y',
    '-v', 'error',
    '-i', srcPath,
    '-vn',
    '-map', '0:a:0',
    '-ar', String(targetRate),
    '-ac', String(targetChannels),
    '-fflags', '+bitexact',
    '-map_metadata', '-1',
    '-c:a', 'pcm_s24le',
    destWavPath,
  ], 180000);

  if (!fs.existsSync(destWavPath) || fs.statSync(destWavPath).size < 44) {
    throw new Error(`Failed to decode audio stream from "${path.basename(srcPath)}".`);
  }

  const mediaKind = (probe.hasVideo && extKind !== 'audio') || extKind === 'video' ? 'video' : 'audio';
  return {
    ok: true,
    mediaKind,
    transcoded: true,
    audioCodec: probe.audioCodec,
    videoCodec: probe.videoCodec,
    channels: targetChannels,
    sampleRate: targetRate,
    destWavPath,
  };
}

module.exports = {
  AUDIO_EXTENSIONS,
  VIDEO_EXTENSIONS,
  ALL_MEDIA_EXTENSIONS,
  MEDIA_DIALOG_FILTERS,
  classifyMediaExtension,
  parseDroppedUriList,
  inspectStandardPcmWavHeader,
  probeMediaStreams,
  importMediaFileToWav,
};
