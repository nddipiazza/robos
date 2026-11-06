'use strict';

// One running camera. A single ffmpeg process reads the camera stream and writes
// two outputs: JPEG frames for the live view (pipe 1) and tiny grayscale frames
// for motion detection (pipe 3). Recording is a second ffmpeg that copies the
// original stream to an MP4 without re-encoding, so recording stays cheap.
// If the stream stops (camera rebooted, Wi-Fi dropped), the runner restarts it
// with a growing delay.

const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { JpegSplitter } = require('./jpeg-splitter');
const { createMotionDetector } = require('./motion-detector');
const { redactUrl } = require('./onvif-bridge');
const { inputArgs } = require('./local-devices');

const MOTION_W = 96;
const MOTION_H = 54;
const STALL_MS = 20000;

function pad(n) { return String(n).padStart(2, '0'); }

function safeFolderName(name) {
  return String(name || 'camera').replace(/[^\w .-]+/g, '_').trim().slice(0, 60) || 'camera';
}

function clipPaths(recordingsDir, cameraName, reason, when = new Date()) {
  const day = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
  const time = `${pad(when.getHours())}-${pad(when.getMinutes())}-${pad(when.getSeconds())}`;
  const dir = path.join(recordingsDir, safeFolderName(cameraName), day);
  const base = `${time}-${reason}`;
  return { dir, video: path.join(dir, `${base}.mp4`), thumb: path.join(dir, `${base}.jpg`) };
}

/** Turn ffmpeg's last error line into a plain sentence (passwords hidden). */
function explainFfmpeg(line) {
  const l = redactUrl(String(line));
  if (/401|Unauthorized/i.test(l)) return 'The camera refused the user name or password (401 Unauthorized).';
  if (/Connection refused/i.test(l)) return 'The camera refused the connection. Check the address and port.';
  if (/timed out|Operation timed out|No route to host/i.test(l)) return 'The camera did not answer. Is it on and on this network?';
  if (/404|Not Found/i.test(l)) return 'The camera has no stream at that path (404).';
  if (/Could not find video device|No such file or directory.*video/i.test(l)) return 'That webcam is not plugged in (or has another name now).';
  if (/Could not run graph|Device or resource busy|already in use/i.test(l)) return 'Another program is using the webcam. Close it (video call, camera app) and Camera Watch will retry.';
  if (/Could not set video options|Invalid argument.*video_size/i.test(l)) return 'The webcam does not support that picture size. Clear the size to let it choose.';
  return l;
}

function liveArgs(input, settings) {
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-fflags', 'nobuffer', ...inputArgs(input)];
  const fps = Number(settings.liveFps) || 8;
  const width = Number(settings.liveWidth) || 960;
  args.push(
    '-map', '0:v:0', '-an', '-vf', `fps=${fps},scale='min(${width},iw)':-2`, '-q:v', '6', '-f', 'mjpeg', 'pipe:1',
    '-map', '0:v:0', '-an', '-vf', `fps=${Number(settings.motionFps) || 4},scale=${MOTION_W}:${MOTION_H},format=gray`,
    '-f', 'rawvideo', 'pipe:3',
  );
  return args;
}

function recordArgs(input, file, maxSeconds) {
  const args = ['-hide_banner', '-loglevel', 'error'];
  const tail = ['-movflags', '+frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', '-y', file];
  if (input.kind === 'device') {
    // A webcam can usually be opened by one program at a time, and the live
    // view already has it. Record by encoding the live JPEG frames, which
    // arrive on stdin, timed by when they arrive.
    return [
      ...args, '-use_wallclock_as_timestamps', '1', '-f', 'mjpeg', '-i', 'pipe:0',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p', '-fps_mode', 'vfr',
      '-t', String(Math.max(5, Math.round(maxSeconds))), ...tail,
    ];
  }
  const rtsp = /^rtsps?:/i.test(input.url);
  args.push(...inputArgs(input), '-map', '0:v:0', '-map', '0:a?');
  // RTSP cameras send H.264/H.265: copy it. MJPEG-over-HTTP cameras need encoding for MP4.
  if (rtsp) args.push('-c:v', 'copy');
  else args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p');
  args.push('-c:a', 'aac', '-b:a', '64k', '-t', String(Math.max(5, Math.round(maxSeconds))));
  // Fragmented MP4 stays playable even if ffmpeg is killed mid-clip.
  args.push(...tail);
  return args;
}

class CameraRunner extends EventEmitter {
  /**
   * @param {object} o
   * @param {object} o.camera saved camera (with password)
   * @param {() => object} o.getSettings
   * @param {(camera, attempt) => Promise<{url, transport}>} o.resolveInput
   */
  constructor({ camera, getSettings, resolveInput, spawnFn = spawn }) {
    super();
    this.camera = camera;
    this.getSettings = getSettings;
    this.resolveInput = resolveInput;
    this.spawnFn = spawnFn;
    this.proc = null;
    this.recorder = null;
    this.recording = null;
    this.latestFrame = null;
    this.latestFrameAt = 0;
    this.clients = new Set();
    this.state = 'stopped';
    this.error = '';
    this.attempt = 0;
    this.retryTimer = null;
    this.stallTimer = null;
    this.stopTimer = null;
    this.wanted = false;
    this.fpsCounter = { count: 0, since: Date.now(), fps: 0 };
    this.motionScore = 0;
    this.detector = createMotionDetector({ width: MOTION_W, height: MOTION_H, ...this._motionOptions() });
  }

  _motionOptions() {
    const m = this.camera.motion || {};
    return {
      sensitivity: m.sensitivity,
      minAreaPercent: m.minAreaPercent,
      cooldownMs: (Number(m.cooldownSeconds) || 5) * 1000,
      zones: m.zones,
    };
  }

  updateCamera(camera) {
    const restart = camera.streamUrl !== this.camera.streamUrl
      || camera.username !== this.camera.username
      || camera.password !== this.camera.password
      || camera.rtspTransport !== this.camera.rtspTransport
      || JSON.stringify(camera.onvif) !== JSON.stringify(this.camera.onvif)
      || JSON.stringify(camera.device) !== JSON.stringify(this.camera.device);
    this.camera = camera;
    this.detector.configure(this._motionOptions());
    if (restart && this.wanted) this.restart();
    this._emitStatus();
  }

  status() {
    return {
      cameraId: this.camera.id,
      state: this.state,
      error: this.error,
      fps: this.fpsCounter.fps,
      motion: this.detector.active,
      motionScore: this.motionScore,
      recording: this.recording ? { reason: this.recording.reason, startedAt: this.recording.startedAt, file: this.recording.video } : null,
      lastFrameAt: this.latestFrameAt || null,
    };
  }

  _emitStatus() { this.emit('status', this.status()); }

  _setState(state, error = '') {
    this.state = state;
    this.error = error;
    this._emitStatus();
  }

  start() {
    this.wanted = true;
    if (this.proc || this.retryTimer) return;
    this._launch();
  }

  stop() {
    this.wanted = false;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    clearInterval(this.stallTimer);
    this.stallTimer = null;
    this.stopRecording('stopped');
    if (this.proc) {
      const p = this.proc;
      this.proc = null;
      try { p.kill('SIGKILL'); } catch {}
    }
    for (const res of this.clients) { try { res.end(); } catch {} }
    this.clients.clear();
    this.detector.reset();
    this._setState('stopped');
  }

  restart() {
    if (this.proc) { try { this.proc.kill('SIGKILL'); } catch {} }
    this.proc = null;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.attempt = 0;
    if (this.wanted) this._launch();
  }

  async _launch() {
    this.retryTimer = null;
    this._setState('connecting');
    let input;
    try {
      input = await this.resolveInput(this.camera, this.attempt);
      this.input = input;
    } catch (err) {
      this._fail(err.message || String(err));
      return;
    }
    if (!this.wanted) return;
    const settings = this.getSettings();
    let proc;
    try {
      proc = this.spawnFn(settings.ffmpegPath || 'ffmpeg', liveArgs(input, settings), {
        stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (err) {
      this._fail(this._ffmpegError(err));
      return;
    }
    this.proc = proc;
    let stderr = '';
    const splitter = new JpegSplitter((frame) => this._onFrame(frame));
    const motionSize = MOTION_W * MOTION_H;
    let motionBuf = Buffer.alloc(0);

    proc.stdout.on('data', (chunk) => splitter.push(chunk));
    proc.stdio[3]?.on('data', (chunk) => {
      motionBuf = motionBuf.length ? Buffer.concat([motionBuf, chunk]) : chunk;
      while (motionBuf.length >= motionSize) {
        this._onMotionFrame(motionBuf.subarray(0, motionSize));
        motionBuf = motionBuf.subarray(motionSize);
      }
    });
    proc.stderr.on('data', (d) => { stderr = (stderr + d.toString()).slice(-2000); });
    proc.on('error', (err) => {
      if (this.proc !== proc) return;
      this.proc = null;
      this._fail(this._ffmpegError(err));
    });
    proc.on('close', (code) => {
      if (this.proc !== proc) return;
      this.proc = null;
      clearInterval(this.stallTimer);
      const last = stderr.trim().split('\n').pop() || `ffmpeg exited with code ${code}`;
      this._fail(this._explain(last));
    });

    clearInterval(this.stallTimer);
    const startedAt = Date.now();
    this.stallTimer = setInterval(() => {
      const since = this.latestFrameAt > startedAt ? this.latestFrameAt : startedAt;
      if (Date.now() - since > STALL_MS && this.proc === proc) {
        stderr += '\nNo video from the camera for 20 seconds.';
        try { proc.kill('SIGKILL'); } catch {}
      }
    }, 5000);
  }

  _ffmpegError(err) {
    if (err && err.code === 'ENOENT') {
      return 'ffmpeg was not found. Install it (Ubuntu: sudo apt install ffmpeg) or set its path in Settings.';
    }
    return err?.message || String(err);
  }

  _explain(line) {
    return explainFfmpeg(line);
  }

  _fail(message) {
    if (this.latestFrameAt && Date.now() - this.latestFrameAt < 60000) this.attempt = 0;
    this.attempt += 1;
    this._setState(this.wanted ? 'error' : 'stopped', message);
    if (!this.wanted) return;
    const delay = Math.min(60000, 2000 * 2 ** Math.min(this.attempt - 1, 5));
    this.retryTimer = setTimeout(() => this._launch(), delay);
    this.emit('log', `${this.camera.name}: ${message} (retrying in ${Math.round(delay / 1000)} s)`);
  }

  _onFrame(frame) {
    const now = Date.now();
    const first = !this.latestFrameAt || this.state !== 'live';
    this.latestFrame = frame;
    this.latestFrameAt = now;
    this.attempt = 0;
    const c = this.fpsCounter;
    c.count++;
    if (now - c.since >= 2000) {
      c.fps = Math.round((c.count * 10000) / (now - c.since)) / 10;
      c.count = 0;
      c.since = now;
      this._emitStatus();
    }
    if (first) this._setState('live');
    const rec = this.recording;
    if (rec?.feed && rec.proc.stdin?.writable && !rec.proc.stdin.writableNeedDrain) {
      try { rec.proc.stdin.write(frame); } catch {}
    }
    for (const res of this.clients) {
      if (res.writableNeedDrain) continue; // slow viewer: skip frames instead of buffering
      try {
        res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
        res.write(frame);
        res.write('\r\n');
      } catch {}
    }
    this.emit('frame', frame);
  }

  _onMotionFrame(gray) {
    if (!this.camera.motion?.enabled) return;
    const r = this.detector.feed(gray);
    const prevScore = this.motionScore;
    this.motionScore = r.score;
    if (r.started) {
      this.emit('motion', { type: 'start', score: r.score, at: new Date().toISOString(), source: 'app' });
      this._emitStatus();
    } else if (r.ended) {
      this.emit('motion', { type: 'end', peakScore: r.peakScore, at: new Date().toISOString(), source: 'app' });
      this._emitStatus();
    } else if (Math.abs(prevScore - r.score) > 0.5) {
      this.emit('score', { cameraId: this.camera.id, score: r.score, motion: r.motion });
    }
  }

  addClient(res) {
    res.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
      'Cache-Control': 'no-cache, no-store',
      Connection: 'close',
      Pragma: 'no-cache',
    });
    this.clients.add(res);
    if (this.latestFrame) {
      res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${this.latestFrame.length}\r\n\r\n`);
      res.write(this.latestFrame);
      res.write('\r\n');
    }
    res.on('close', () => this.clients.delete(res));
  }

  /** Start (or extend) a recording. reason: 'motion' | 'manual'. */
  startRecording(reason = 'manual') {
    clearTimeout(this.stopTimer);
    this.stopTimer = null;
    if (this.recording) return this.recording;
    if (!this.input) throw new Error('The camera is not connected yet.');
    const settings = this.getSettings();
    const when = new Date();
    const paths = clipPaths(settings.recordingsDir, this.camera.name, reason, when);
    fs.mkdirSync(paths.dir, { recursive: true });
    if (this.latestFrame) {
      try { fs.writeFileSync(paths.thumb, this.latestFrame); } catch {}
    }
    const maxSeconds = (Number(settings.maxClipMinutes) || 15) * 60;
    const proc = this.spawnFn(settings.ffmpegPath || 'ffmpeg', recordArgs(this.input, paths.video, maxSeconds), {
      stdio: ['pipe', 'ignore', 'pipe'],
      windowsHide: true,
    });
    const rec = {
      reason,
      startedAt: when.toISOString(),
      video: paths.video,
      thumb: this.latestFrame ? paths.thumb : '',
      proc,
      // Webcams: the recorder is fed the live frames (see recordArgs).
      feed: this.input.kind === 'device',
    };
    proc.stdin?.on('error', () => {}); // the recorder may exit before we stop writing
    let stderr = '';
    proc.stderr?.on('data', (d) => { stderr = (stderr + d.toString()).slice(-1000); });
    proc.on('error', (err) => { stderr += this._ffmpegError(err); });
    proc.on('close', () => {
      if (this.recording === rec) this.recording = null;
      const ok = fs.existsSync(rec.video) && fs.statSync(rec.video).size > 0;
      this.emit('recorded', {
        reason: rec.reason,
        startedAt: rec.startedAt,
        endedAt: new Date().toISOString(),
        video: ok ? rec.video : '',
        thumb: rec.thumb,
        error: ok ? '' : this._explain(stderr.trim().split('\n').pop() || 'Recording failed.'),
      });
      this._emitStatus();
    });
    this.recording = rec;
    this._emitStatus();
    return rec;
  }

  /** Stop now, or after delaySeconds (used after motion ends). */
  stopRecording(why = 'manual', delaySeconds = 0) {
    if (!this.recording) return;
    clearTimeout(this.stopTimer);
    const rec = this.recording;
    const finish = () => {
      this.stopTimer = null;
      // Frame-fed recorders finish when their input ends; the others quit on "q".
      if (rec.feed) { rec.feed = false; try { rec.proc.stdin.end(); } catch {} } else {
        try { rec.proc.stdin.write('q'); } catch {}
      }
      setTimeout(() => { try { rec.proc.kill('SIGKILL'); } catch {} }, 4000).unref?.();
    };
    if (delaySeconds > 0) this.stopTimer = setTimeout(finish, delaySeconds * 1000);
    else finish();
    return why;
  }
}

module.exports = { CameraRunner, liveArgs, recordArgs, clipPaths, safeFolderName, explainFfmpeg, MOTION_W, MOTION_H };
