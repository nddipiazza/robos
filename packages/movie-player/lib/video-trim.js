'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');

const exec = promisify(execFile);
const MINIMUM_CLIP_SECONDS = 0.25;
const TEXT_SUBTITLES = new Set(['mov_text', 'subrip', 'ass', 'ssa', 'webvtt', 'text']);

async function probeVideo(file, signal) {
  const { stdout } = await exec('ffprobe', [
    '-v', 'error', '-protocol_whitelist', 'file,pipe',
    '-show_entries', 'format=duration:format_tags=title:stream=index,codec_type,codec_name:stream_disposition=attached_pic',
    '-of', 'json', file,
  ], { signal, timeout: 25000, windowsHide: true, maxBuffer: 1024 * 1024 });
  const info = JSON.parse(stdout);
  const duration = Number(info.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0 || !info.streams?.some(stream => stream.codec_type === 'video' && !stream.disposition?.attached_pic)) {
    throw new Error('Could not read the video and its duration.');
  }
  return { ...info, duration };
}

function trimRange(duration, point, edge) {
  if (!['start', 'end'].includes(edge) || !Number.isFinite(point)) throw new Error('Choose where to trim the video.');
  const cut = Math.round(point * 1000) / 1000;
  if (cut < MINIMUM_CLIP_SECONDS || duration - cut < MINIMUM_CLIP_SECONDS) {
    throw new Error('Choose a point at least a quarter-second from either end.');
  }
  return edge === 'start' ? { start: cut, end: duration } : { start: 0, end: cut };
}

function exportTags(track, info) {
  const clean = value => value?.trim().replace(/(?:\s+\(Trimmed\))+$/i, '');
  const title = clean(track.title) || clean(info.format.tags?.title) || path.parse(track.filePath).name;
  const tags = { title: `${title} (Trimmed)` };
  if (track.year) tags.date = track.year;
  if (track.mediaType === 'tv' && track.showName) {
    tags.title = track.episodeTitle ? `${clean(track.episodeTitle)} (Trimmed)` : 'Trimmed copy';
    tags.show = track.showName;
    tags.album = track.showName;
    tags.media_type = 10;
    if (track.episodeNumber > 0) {
      tags.season_number = track.seasonNumber;
      tags.episode_sort = track.episodeNumber;
    }
  } else if (track.mediaType === 'movie') {
    tags.media_type = 9;
    tags.album = track.year ? `${tags.title} (${track.year})` : tags.title;
  }
  return Object.entries(tags).flatMap(([key, value]) => ['-metadata', `${key}=${value ?? ''}`]);
}

function encode(args, duration, { signal, onProgress }) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { signal, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let lastPercent = -1;
    readline.createInterface({ input: child.stdout, crlfDelay: Infinity }).on('line', line => {
      const match = /^out_time_us=(\d+)$/.exec(line);
      if (!match) return;
      const percent = Math.min(99, Math.floor(Number(match[1]) / 1_000_000 / duration * 100));
      if (percent > lastPercent) {
        lastPercent = percent;
        onProgress({ percent });
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4096); });
    child.once('error', error => {
      // Wait for the child to close before removing its output on Windows.
      if (error.code !== 'ABORT_ERR') reject(error);
    });
    child.once('close', code => {
      if (signal.aborted) reject(signal.reason);
      else if (code === 0) resolve();
      else reject(new Error('Could not export the trimmed video.', { cause: stderr.trim() }));
    });
  });
}

async function trimToLibrary({ track, point, edge, directory, signal, index, onProgress = () => {} }) {
  let jobDirectory;
  let saved = false;
  try {
    const file = track.filePath;
    const stats = await fs.stat(file).catch(() => null);
    if (!stats?.isFile()) throw new Error('Open or download a local copy of the video first.');
    const info = await probeVideo(file, signal);
    const range = trimRange(info.duration, point, edge);
    const duration = range.end - range.start;
    await fs.mkdir(directory, { recursive: true });
    jobDirectory = await fs.mkdtemp(path.join(directory, 'edit-'));
    const partial = path.join(jobDirectory, 'export.part');
    const name = Array.from(path.parse(file).name.replace(/(?:\s+\(Trimmed\))+$/i, '')).slice(0, 54).join('').trimEnd() || 'Video';
    const output = path.join(jobDirectory, `${name} (Trimmed).mp4`);
    const subtitles = info.streams.filter(s => s.codec_type === 'subtitle' && TEXT_SUBTITLES.has(s.codec_name));
    await encode([
      '-hide_banner', '-loglevel', 'error', '-nostdin', '-nostats', '-progress', 'pipe:1',
      '-protocol_whitelist', 'file,pipe', '-ss', String(range.start), '-i', file,
      '-t', String(duration), '-map', '0:V:0', '-map', '0:a?',
      ...subtitles.flatMap(stream => ['-map', `0:${stream.index}`]),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:a', 'aac', '-b:a', '192k',
      ...(subtitles.length ? ['-c:s', 'mov_text'] : []),
      '-map_metadata', '0', '-map_chapters', '0', ...exportTags(track, info),
      '-movflags', '+faststart', '-f', 'mp4', partial,
    ], duration, { signal, onProgress });
    await probeVideo(partial, signal);
    signal.throwIfAborted();
    onProgress({ saving: true, percent: 100 });
    await fs.rename(partial, output);
    const edited = await index(output, track, range);
    saved = true;
    return { ok: true, track: edited };
  } catch (err) {
    if (signal.aborted) return { canceled: true };
    if (err.code === 'ENOENT') return { ok: false, error: 'Install FFmpeg and ffprobe to trim video.' };
    return { ok: false, error: err.message };
  } finally {
    if (jobDirectory && !saved) await fs.rm(jobDirectory, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  }
}

function registerVideoTrim({ app, ipcMain, getWindow, findTrack, isLocalVideo, directory, index }) {
  let active;
  const fromPlayer = (event) => getWindow()?.webContents === event.sender && event.senderFrame === event.sender.mainFrame
    && event.senderFrame?.url.startsWith('file:');

  ipcMain.handle('movie:trim-video', (event, input) => {
    if (!fromPlayer(event)) return { ok: false, error: 'Open Edit video in Movie Player.' };
    if (active) return { ok: false, error: 'A video edit is already in progress.' };
    let track;
    try { track = findTrack(input?.trackId); }
    catch (err) { return { ok: false, error: err.message }; }
    if (!isLocalVideo(track)) return { ok: false, error: 'Open or download a local copy of the video first.' };

    const sender = event.sender;
    const job = { controller: new AbortController(), saving: false };
    const cancel = () => { if (!job.saving) job.controller.abort(); };
    sender.once('destroyed', cancel);
    active = job;
    job.done = trimToLibrary({
      track, directory, index, point: input.point, edge: input.edge, signal: job.controller.signal,
      onProgress(progress) {
        job.saving ||= !!progress.saving;
        if (!sender.isDestroyed()) sender.send('movie:trim-progress', progress);
      },
    }).finally(() => {
      sender.removeListener('destroyed', cancel);
      active = null;
    });
    return job.done;
  });

  ipcMain.handle('movie:trim-cancel', (event) => {
    if (!fromPlayer(event) || !active || active.saving) return false;
    active.controller.abort();
    return true;
  });

  app.on('before-quit', (event) => {
    if (!active) return;
    event.preventDefault();
    if (!active.saving) active.controller.abort();
    active.done.finally(() => app.quit());
  });
}

module.exports = { trimToLibrary, registerVideoTrim };
