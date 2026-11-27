'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline');

const TOOL_HELP = {
  'yt-dlp': 'https://github.com/yt-dlp/yt-dlp/wiki/Installation',
  ffmpeg: 'https://ffmpeg.org/download.html',
  ffprobe: 'https://ffmpeg.org/download.html',
};

function mediaUrl(value) {
  if (typeof value !== 'string' || value.length > 8192) throw new Error('Paste a media link.');
  let url;
  try { url = new URL(value.trim()); } catch {}
  if (!url || !['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Enter an HTTP or HTTPS media link without login credentials.');
  }
  return url.href;
}

function recordingName(title) {
  const cleaned = String(title || '').replace(/[\x00-\x1f<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim();
  const name = Array.from(cleaned).slice(0, 58).join('').replace(/[ .]+$/, '') || 'Recording';
  return /^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i.test(name) ? `_${name}` : name;
}

function stopProcess(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.on('error', () => child.kill());
    killer.on('exit', (code) => { if (code !== 0) child.kill(); });
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
  }
}

function runTool(command, args, { cwd, signal, onLine } = {}) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd, windowsHide: true, detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stop = () => stopProcess(child);
    let stdout = '';
    let stderr = '';
    signal?.addEventListener('abort', stop, { once: true });
    readline.createInterface({ input: child.stdout, crlfDelay: Infinity }).on('line', (line) => {
      if (onLine) onLine(line);
      else stdout = (stdout + line + '\n').slice(-1024 * 1024);
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4096); });
    child.once('error', (err) => {
      if (err.code === 'ENOENT') {
        err.message = `${command} is required. Install it, then reopen the player and try again.`;
        err.tool = command;
      }
      reject(err);
    });
    child.once('close', (code) => {
      signal?.removeEventListener('abort', stop);
      if (signal?.aborted) return reject(signal.reason);
      if (code === 0) return resolve(stdout);
      const lines = stderr.trim().split(/\r?\n/).filter(Boolean);
      const detail = lines.findLast(line => line.startsWith('ERROR:')) || lines.at(-1);
      reject(new Error(detail ? detail.slice(0, 500) : `${command} exited with code ${code}.`));
    });
  });
}

async function getVideoFile(input, directory, includeAudio, signal, { title, requireAudio } = {}) {
  const raw = await runTool('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', input], { signal });
  const { streams } = JSON.parse(raw);
  const video = streams.find(stream => stream.codec_type === 'video' && !stream.disposition?.attached_pic);
  if (!video) throw new Error('The recording did not contain a video stream.');
  const audio = includeAudio && streams.find(stream => stream.codec_type === 'audio');
  if (requireAudio && !audio) throw new Error('The recording did not contain system audio.');
  const output = path.join(directory, 'recording.mp4');
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', input, '-map', `0:${video.index}`];
  if (video.codec_name === 'h264' && ['yuv420p', 'yuvj420p'].includes(video.pix_fmt)) args.push('-c:v', 'copy');
  else args.push('-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2');
  if (audio) args.push('-map', `0:${audio.index}`, '-c:a', audio.codec_name === 'aac' ? 'copy' : 'aac');
  args.push('-map_metadata', '0');
  if (title) args.push('-metadata', `title=${title}`);
  args.push('-movflags', '+faststart', output);
  await runTool('ffmpeg', args, { signal });
  return output;
}

async function downloadMedia(kind, url, includeAudio, temporary, signal, onProgress) {
  const args = [
    '--ignore-config', '--no-plugin-dirs', '--no-playlist', '--playlist-items', '1',
    '--no-simulate', '--no-colors', '--newline', '--progress',
    '--progress-template', 'download:ROBOS_PROGRESS:%(progress._percent_str)s',
    '--print', 'after_move:ROBOS_ITEM:%(.{filepath,title})j',
    '--socket-timeout', '30', '--embed-metadata', '--no-embed-info-json',
    '--output', 'media.%(ext)s',
  ];
  if (kind === 'audio') {
    args.push('-f', 'ba/b', '--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0', '--embed-thumbnail');
  } else {
    // A progressive source can contain both streams. The final mux only maps audio when requested.
    args.push('-f', includeAudio ? 'bv+ba/b/bv' : 'bv/b', '-S', 'vcodec:h264,acodec:aac');
  }

  let item;
  let lastPercent;
  let lastProgress = 0;
  await runTool('yt-dlp', [...args, '--', url], {
    cwd: temporary,
    signal,
    onLine: (line) => {
      if (line.startsWith('ROBOS_ITEM:')) {
        try { item = JSON.parse(line.slice('ROBOS_ITEM:'.length)); } catch {}
      }
      if (!line.startsWith('ROBOS_PROGRESS:')) return;
      const raw = line.slice('ROBOS_PROGRESS:'.length).trim();
      const percent = /^\d+(?:\.\d+)?%$/.test(raw) ? Math.min(100, Math.round(parseFloat(raw))) : null;
      const now = Date.now();
      if (lastPercent === undefined || (percent !== lastPercent && now - lastProgress >= 200)) {
        lastPercent = percent;
        lastProgress = now;
        onProgress({ message: 'Downloading media…', percent });
      }
    },
  });
  if (typeof item?.filepath !== 'string') throw new Error('No media was found at this link.');
  const input = path.resolve(temporary, item.filepath);
  if (path.dirname(input) !== temporary || !/^media\.[a-z0-9]+$/i.test(path.basename(input))) {
    throw new Error('The recording returned an unexpected file.');
  }
  const stats = await fs.lstat(input);
  if (!stats.isFile() || !stats.size) throw new Error('The recording returned an empty file.');
  if (kind === 'audio' && path.extname(input) !== '.mp3') throw new Error('This link did not return an audio track.');
  onProgress({ message: 'Preparing recording…' });
  const output = kind === 'video' ? await getVideoFile(input, temporary, includeAudio, signal) : input;
  return { output, title: item.title };
}

async function prepareTools(kind, signal) {
  await runTool('ffmpeg', ['-version'], { signal });
  if (kind === 'video') await runTool('ffprobe', ['-version'], { signal });
}

function captureTitle(kind) {
  const now = new Date();
  const day = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(n => String(n).padStart(2, '0')).join('-');
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()].map(n => String(n).padStart(2, '0')).join('.');
  return `${kind === 'video' ? 'Desktop' : 'PC audio'} recording ${day} ${time}`;
}

function createMediaRecorder({ kind, directory, index }) {
  let active = null;

  function startJob(produce, onProgress) {
    const job = { controller: new AbortController(), saving: false };
    active = job;
    job.done = record(job, produce, onProgress).finally(() => { active = null; });
    return job;
  }

  async function record(job, produce, onProgress) {
    const { signal } = job.controller;
    let temporary;
    let destination;
    let indexed = false;
    try {
      await prepareTools(kind, signal);
      await fs.mkdir(directory, { recursive: true });
      temporary = await fs.mkdtemp(path.join(path.dirname(directory), '.recording-'));
      const { output, title, source = 'link' } = await produce(job, temporary, signal);
      signal.throwIfAborted();

      // Separate folders keep duplicate titles without changing the filenames used by metadata lookup.
      destination = await fs.mkdtemp(path.join(directory, 'recording-'));
      signal.throwIfAborted();
      job.saving = true;
      onProgress({ message: 'Indexing in your library…', saving: true });
      const file = path.join(destination, recordingName(title) + path.extname(output));
      await fs.rename(output, file);
      const track = await index(file, { source });
      indexed = true;
      return { ok: true, track };
    } catch (err) {
      if (signal.aborted) return { canceled: true };
      return { ok: false, error: err.message, tool: err.tool };
    } finally {
      if (temporary) await fs.rm(temporary, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
      if (destination && !indexed) await fs.rm(destination, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
    }
  }

  function busyResult() {
    return { ok: false, error: 'A recording is already in progress.' };
  }

  return {
    start(options, onProgress = () => {}) {
      if (active) return Promise.resolve(busyResult());
      let url;
      try { url = mediaUrl(options?.url); } catch (err) { return Promise.resolve({ ok: false, error: err.message }); }
      onProgress({ message: 'Finding media…' });
      return startJob((_job, temporary, signal) =>
        downloadMedia(kind, url, options?.includeAudio !== false, temporary, signal, onProgress), onProgress).done;
    },

    async startCapture(options, onProgress = () => {}) {
      if (active) return busyResult();
      const includeAudio = kind === 'audio' || options?.includeAudio !== false;
      const title = captureTitle(kind);
      let opened;
      const ready = new Promise(resolve => { opened = resolve; });
      const job = startJob(async (job, temporary, signal) => {
        signal.throwIfAborted();
        const input = path.join(temporary, 'capture.webm');
        const file = await fs.open(input, 'wx');
        let settle;
        let fail;
        let bytes = 0;
        let write;
        const finished = new Promise((resolve, reject) => { settle = resolve; fail = reject; });
        const abort = () => fail(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
        job.capture = {
          async append(chunk) {
            if (!(chunk instanceof Uint8Array) || chunk.byteLength === 0 || chunk.byteLength > 2 * 1024 * 1024 || write) {
              throw new Error('Could not write a recording chunk.');
            }
            write = file.writeFile(chunk);
            try {
              await write;
              bytes += chunk.byteLength;
            } catch (error) {
              fail(error);
              throw error;
            } finally {
              write = null;
            }
          },
          finish: settle,
        };
        if (signal.aborted) abort();
        opened({ ok: true });
        try {
          await finished;
        } finally {
          job.capture = null;
          signal.removeEventListener('abort', abort);
          if (write) await write.catch(() => {});
          await file.close();
        }
        signal.throwIfAborted();
        if (!bytes) throw new Error('No media was captured. Record for a little longer and try again.');
        onProgress({ message: 'Preparing recording…', saving: true });
        if (kind === 'video') {
          const output = await getVideoFile(input, temporary, includeAudio, signal, { title, requireAudio: includeAudio });
          return { output, title, source: 'desktop' };
        }
        const output = path.join(temporary, 'capture.mp3');
        await runTool('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', input, '-map', '0:a:0',
          '-codec:a', 'libmp3lame', '-q:a', '2', '-metadata', `title=${title}`, output], { signal });
        return { output, title, source: 'desktop' };
      }, onProgress);
      return Promise.race([ready, job.done]);
    },

    async appendCapture(chunk) {
      if (!active?.capture) throw new Error('The recording has ended.');
      await active.capture.append(chunk);
    },

    finishCapture() {
      if (!active?.capture) return { ok: false, error: 'The recording has ended.' };
      active.capture.finish();
      return active.done;
    },

    cancel() {
      if (active && !active.saving) {
        active.controller.abort();
        return true;
      }
      return false;
    },

    get pending() { return active?.done; },
  };
}

function registerMediaRecorder({ app, ipcMain, clipboard, shell, desktopCapturer, screen, session, getWindow, ...options }) {
  const recorder = createMediaRecorder(options);
  const fromPlayer = (event) => getWindow()?.webContents === event.sender && event.senderFrame === event.sender.mainFrame
    && event.senderFrame?.url.startsWith('file:');
  const progressFor = (sender) => (progress) => {
    if (!sender.isDestroyed()) sender.send('media-record:progress', progress);
  };
  let displayRequest = null;

  app.whenReady().then(() => {
    session.defaultSession.setDisplayMediaRequestHandler(async (request, respond) => {
      const grant = displayRequest;
      if (!grant || grant.frame !== request.frame || !request.userGesture || !request.videoRequested ||
          request.audioRequested !== grant.includeAudio) {
        respond({});
        return;
      }
      displayRequest = null;
      try {
        const window = getWindow();
        if (!window || window.isDestroyed()) { respond({}); return; }
        const display = screen.getDisplayMatching(window.getBounds());
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
        const video = sources.find(source => source.display_id === String(display.id)) || sources[0];
        if (!video || recorder.pending !== grant.pending || getWindow() !== window) { respond({}); return; }
        respond(grant.includeAudio ? { video, audio: 'loopback' } : { video });
      } catch {
        respond({});
      }
    });
  });

  ipcMain.handle('media-record:capture-start', async (event, input) => {
    if (!fromPlayer(event)) return { ok: false, error: 'Open Record to Library in the player window.' };
    if (recorder.pending) return { ok: false, error: 'A recording is already in progress.' };
    const includeAudio = options.kind === 'audio' || input?.includeAudio !== false;
    if (includeAudio && process.platform !== 'win32') return { ok: false, error: 'System audio capture is available on Windows.' };
    const { sender, senderFrame } = event;
    const cancel = () => recorder.cancel();
    sender.once('destroyed', cancel);
    const start = recorder.startCapture({ includeAudio }, progressFor(sender));
    const pending = recorder.pending;
    pending.then(() => {
      if (displayRequest?.frame === senderFrame) displayRequest = null;
      sender.removeListener('destroyed', cancel);
    });
    const result = await start;
    if (result.ok && !sender.isDestroyed()) displayRequest = { frame: senderFrame, includeAudio, pending };
    return result;
  });
  ipcMain.handle('media-record:capture-append', (event, chunk) => {
    if (!fromPlayer(event)) throw new Error('The recording window is closed.');
    return recorder.appendCapture(chunk);
  });
  ipcMain.handle('media-record:capture-finish', (event) => fromPlayer(event) && recorder.finishCapture());
  ipcMain.handle('media-record:capture-discard', async (event) => {
    if (!fromPlayer(event)) return;
    displayRequest = null;
    const pending = recorder.pending;
    recorder.cancel();
    await pending;
  });
  ipcMain.handle('media-record:start', (event, input) => {
    if (!fromPlayer(event)) return { ok: false, error: 'Open Record to Library in the player window.' };
    const sender = event.sender;
    const cancel = () => recorder.cancel();
    sender.once('destroyed', cancel);
    return recorder.start(input, progressFor(sender)).finally(() => sender.removeListener('destroyed', cancel));
  });
  ipcMain.handle('media-record:paste', (event) => fromPlayer(event) ? clipboard.readText().trim().slice(0, 8192) : '');
  ipcMain.handle('media-record:cancel', (event) => fromPlayer(event) && recorder.cancel());
  ipcMain.handle('media-record:setup', (event, tool) => {
    if (fromPlayer(event) && Object.hasOwn(TOOL_HELP, tool)) return shell.openExternal(TOOL_HELP[tool]);
  });

  app.on('before-quit', (event) => {
    const pending = recorder.pending;
    if (!pending) return;
    event.preventDefault();
    recorder.cancel();
    pending.finally(() => app.quit());
  });
}

module.exports = { createMediaRecorder, registerMediaRecorder };
