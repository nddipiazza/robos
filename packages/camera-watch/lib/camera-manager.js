'use strict';

// Runs all saved cameras: live view, motion detection, motion-triggered and
// manual recording, snapshots, ONVIF discovery and PTZ, the motion event log
// and the recordings folder (with a retention clean-up).

const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { createStore, publicCamera, defaultDeviceFormat } = require('./store');
const { CameraRunner, clipPaths, explainFfmpeg } = require('./camera-runner');
const { inputArgs, listLocalDevices } = require('./local-devices');
const { createStreamServer, isInside } = require('./stream-server');
const onvif = require('./onvif-bridge');

const DAY_MS = 24 * 60 * 60 * 1000;

function createCameraManager({ configDir, homeDir, spawnFn = spawn }) {
  const store = createStore({ configDir, homeDir });
  const emitter = new EventEmitter();
  const runners = new Map();
  const sessions = new Map(); // cameraId -> { session, eventsOn }
  const motionState = new Map(); // cameraId -> { sources:Set, eventId }
  let retentionTimer = null;
  let generation = 0;

  const server = createStreamServer({
    getRunner: (id) => runners.get(id) || null,
    getMediaRoot: () => store.getSettings().recordingsDir,
  });

  // ── ONVIF sessions ─────────────────────────────────────────────────────────
  async function getSession(cam) {
    const existing = sessions.get(cam.id);
    if (existing) return existing.session;
    const session = await onvif.openSession({
      hostname: cam.onvif.hostname,
      port: cam.onvif.port,
      path: cam.onvif.path,
      username: cam.username,
      password: cam.password,
    });
    sessions.set(cam.id, { session, eventsOn: false });
    return session;
  }

  async function closeSession(id) {
    const s = sessions.get(id);
    sessions.delete(id);
    if (!s) return;
    try { s.session.close(); } catch {}
  }

  async function resolveInput(cam, attempt) {
    if (cam.kind === 'device') {
      return { kind: 'device', format: cam.device.format, name: cam.device.name, videoSize: cam.device.videoSize };
    }
    if (cam.kind === 'url') {
      return { url: onvif.withCredentials(cam.streamUrl, cam.username, cam.password), transport: cam.rtspTransport };
    }
    // ONVIF: use the saved stream URI; ask the camera again after repeated failures
    // (some cameras hand out URIs with session tokens that expire).
    if (!cam.streamUrl || attempt >= 3) {
      await closeSession(cam.id);
      const session = await getSession(cam);
      const info = await onvif.inspect(session, { profileToken: cam.onvif.profileToken });
      const saved = store.saveCamera({
        ...cam,
        streamUrl: info.streamUri,
        snapshotUrl: info.snapshotUri,
        onvif: { ...cam.onvif, profileToken: info.profileToken, ptz: info.ptz, manufacturer: info.manufacturer, model: info.model },
      });
      cam = saved;
      const r = runners.get(cam.id);
      if (r) r.camera = saved;
    }
    return { url: onvif.withCredentials(cam.streamUrl, cam.username, cam.password), transport: cam.rtspTransport };
  }

  // ── Motion ─────────────────────────────────────────────────────────────────
  function onMotion(cam, evt) {
    const runner = runners.get(cam.id);
    const camera = runner?.camera || cam;
    let st = motionState.get(cam.id);
    if (!st) { st = { sources: new Set(), eventId: null }; motionState.set(cam.id, st); }
    const settings = store.getSettings();

    if (evt.type === 'start') {
      const wasActive = st.sources.size > 0;
      st.sources.add(evt.source);
      if (wasActive) return;
      const day = clipPaths(settings.recordingsDir, camera.name, 'motion');
      let thumb = '';
      if (runner?.latestFrame) {
        try {
          fs.mkdirSync(day.dir, { recursive: true });
          thumb = day.thumb;
          fs.writeFileSync(thumb, runner.latestFrame);
        } catch { thumb = ''; }
      }
      const saved = store.addEvent({
        cameraId: camera.id,
        cameraName: camera.name,
        type: 'motion',
        source: evt.source,
        startedAt: evt.at,
        score: evt.score ?? null,
        thumb,
        video: '',
      });
      st.eventId = saved.id;
      emitter.emit('event', saved);
      if (camera.motion?.record && runner && runner.state === 'live') {
        try {
          const rec = runner.startRecording('motion');
          rec.eventId = saved.id;
        } catch (err) {
          emitter.emit('log', `${camera.name}: could not start recording: ${err.message}`);
        }
      } else if (runner?.recording?.reason === 'motion') {
        runner.startRecording('motion'); // cancels a pending stop
      }
      return;
    }

    // end
    if (!st.sources.delete(evt.source) || st.sources.size > 0) return;
    if (st.eventId) {
      const updated = store.updateEvent(st.eventId, { endedAt: evt.at, peakScore: evt.peakScore ?? null });
      if (updated) emitter.emit('event', updated);
    }
    if (runner?.recording?.reason === 'motion') {
      runner.stopRecording('motion-ended', Number(settings.postMotionSeconds) || 0);
    }
  }

  async function startCameraEvents(cam) {
    if (cam.kind !== 'onvif' || !cam.motion?.useCameraEvents) return;
    try {
      const session = await getSession(cam);
      const s = sessions.get(cam.id);
      if (!s || s.eventsOn) return;
      s.eventsOn = true;
      session.onEvent((msg) => {
        const parsed = onvif.parseMotionEvent(msg);
        if (!parsed) return;
        onMotion(cam, { type: parsed.motion ? 'start' : 'end', at: new Date().toISOString(), source: 'camera' });
      });
    } catch (err) {
      emitter.emit('log', `${cam.name}: could not subscribe to camera events: ${err.message}`);
    }
  }

  // ── Runners ────────────────────────────────────────────────────────────────
  function startRunner(cam) {
    if (runners.has(cam.id)) return runners.get(cam.id);
    const runner = new CameraRunner({
      camera: cam,
      getSettings: () => store.getSettings(),
      resolveInput,
      spawnFn,
    });
    runner.on('status', (s) => emitter.emit('status', s));
    runner.on('score', (s) => emitter.emit('score', s));
    runner.on('log', (line) => emitter.emit('log', line));
    runner.on('motion', (evt) => onMotion(runner.camera, evt));
    runner.on('recorded', (rec) => {
      const evId = rec.reason === 'motion' ? motionState.get(cam.id)?.eventId : null;
      if (evId && rec.video) {
        const updated = store.updateEvent(evId, { video: rec.video });
        if (updated) emitter.emit('event', updated);
      } else if (rec.reason === 'manual') {
        const saved = store.addEvent({
          cameraId: cam.id,
          cameraName: runner.camera.name,
          type: 'recording',
          source: 'manual',
          startedAt: rec.startedAt,
          endedAt: rec.endedAt,
          thumb: rec.thumb,
          video: rec.video,
          error: rec.error,
        });
        emitter.emit('event', saved);
      }
      if (rec.error) emitter.emit('log', `${runner.camera.name}: ${rec.error}`);
      emitter.emit('recordings-changed');
    });
    runner.generation = ++generation;
    runners.set(cam.id, runner);
    runner.start();
    startCameraEvents(cam);
    return runner;
  }

  async function stopRunner(id) {
    const r = runners.get(id);
    runners.delete(id);
    motionState.delete(id);
    if (r) { r.stop(); r.removeAllListeners(); }
    await closeSession(id);
  }

  function cameraView(cam) {
    const runner = runners.get(cam.id);
    return {
      ...publicCamera(cam),
      status: runner ? runner.status() : { cameraId: cam.id, state: cam.enabled ? 'connecting' : 'disabled', error: '' },
      // g changes when the camera is restarted, which closes open live streams.
      liveUrl: `${server.baseUrl}/live/${cam.id}?t=${server.token}&g=${runner?.generation || 0}`,
      frameUrl: `${server.baseUrl}/frame/${cam.id}.jpg?t=${server.token}`,
    };
  }

  // ── Recordings ─────────────────────────────────────────────────────────────
  function mediaUrl(file) {
    return file ? `${server.baseUrl}/media?path=${encodeURIComponent(file)}&t=${server.token}` : '';
  }

  function listRecordings({ limit = 500 } = {}) {
    const root = store.getSettings().recordingsDir;
    const out = [];
    let camDirs = [];
    try { camDirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { return []; }
    for (const camDir of camDirs) {
      let days = [];
      try { days = fs.readdirSync(path.join(root, camDir.name), { withFileTypes: true }).filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name)); } catch {}
      for (const day of days) {
        const dir = path.join(root, camDir.name, day.name);
        let files = [];
        try { files = fs.readdirSync(dir); } catch {}
        for (const f of files) {
          const m = /^(\d{2})-(\d{2})-(\d{2})-(\w+)\.(mp4|jpg)$/.exec(f);
          if (!m) continue;
          const file = path.join(dir, f);
          let size = 0;
          try { size = fs.statSync(file).size; } catch {}
          const isVideo = m[5] === 'mp4';
          if (!isVideo && files.includes(f.replace(/\.jpg$/, '.mp4'))) continue; // thumbnail of a clip
          const thumbFile = isVideo ? file.replace(/\.mp4$/, '.jpg') : file;
          out.push({
            file,
            kind: isVideo ? 'video' : 'snapshot',
            camera: camDir.name,
            day: day.name,
            time: `${m[1]}:${m[2]}:${m[3]}`,
            reason: m[4],
            size,
            url: mediaUrl(file),
            thumbUrl: fs.existsSync(thumbFile) ? mediaUrl(thumbFile) : '',
          });
        }
      }
    }
    out.sort((a, b) => `${b.day} ${b.time}`.localeCompare(`${a.day} ${a.time}`));
    return out.slice(0, limit);
  }

  function deleteRecording(file) {
    const root = store.getSettings().recordingsDir;
    if (!isInside(file, root) || !/\.(mp4|jpg)$/i.test(file)) throw new Error('That file is not a Camera Watch recording.');
    for (const f of [file, file.replace(/\.mp4$/i, '.jpg')]) {
      try { fs.unlinkSync(f); } catch {}
    }
    emitter.emit('recordings-changed');
    return true;
  }

  /** Delete clips and snapshots older than retentionDays (0 keeps everything). */
  function sweepRetention(now = Date.now()) {
    const { recordingsDir, retentionDays } = store.getSettings();
    const days = Number(retentionDays) || 0;
    if (days <= 0) return 0;
    const cutoff = now - days * DAY_MS;
    let removed = 0;
    let camDirs = [];
    try { camDirs = fs.readdirSync(recordingsDir, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { return 0; }
    for (const camDir of camDirs) {
      const camPath = path.join(recordingsDir, camDir.name);
      let dayDirs = [];
      try { dayDirs = fs.readdirSync(camPath).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)); } catch {}
      for (const d of dayDirs) {
        const dayEnd = new Date(`${d}T23:59:59`).getTime();
        if (!(dayEnd < cutoff)) continue;
        const dir = path.join(camPath, d);
        for (const f of fs.readdirSync(dir)) {
          if (/^\d{2}-\d{2}-\d{2}-\w+\.(mp4|jpg)$/.test(f)) {
            try { fs.unlinkSync(path.join(dir, f)); removed++; } catch {}
          }
        }
        try { fs.rmdirSync(dir); } catch {} // only if now empty
      }
    }
    if (removed) emitter.emit('recordings-changed');
    return removed;
  }

  // ── Test a camera before saving ────────────────────────────────────────────
  function grabFrame(input) {
    return new Promise((resolve, reject) => {
      const settings = store.getSettings();
      const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', ...inputArgs(input)];
      args.push('-frames:v', '1', '-vf', "scale='min(640,iw)':-2", '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1');
      let proc;
      try {
        proc = spawnFn(settings.ffmpegPath || 'ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      } catch (err) { reject(err); return; }
      const chunks = [];
      let stderr = '';
      const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 15000);
      proc.stdout.on('data', (c) => chunks.push(c));
      proc.stderr.on('data', (d) => { stderr = (stderr + d).slice(-1500); });
      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(err.code === 'ENOENT' ? 'ffmpeg was not found. Install it (Ubuntu: sudo apt install ffmpeg) or set its path in Settings.' : err.message));
      });
      proc.on('close', () => {
        clearTimeout(timer);
        const buf = Buffer.concat(chunks);
        if (buf.length > 100) resolve(buf);
        else reject(new Error(explainFfmpeg(stderr.trim().split('\n').pop() || 'The camera sent no picture within 15 seconds.')));
      });
    });
  }

  async function testCamera(input) {
    const existing = input.id ? store.getCamera(input.id) : null;
    const password = input.password || existing?.password || '';
    const result = { ok: false };
    if (input.kind === 'device') {
      if (!input.device?.name) throw new Error('Pick the webcam to use.');
      // The webcam may already be open for this camera's live view; use its picture.
      const runner = existing ? runners.get(existing.id) : null;
      const sameDevice = runner && JSON.stringify(runner.camera.device?.name) === JSON.stringify(input.device.name);
      const jpeg = sameDevice && runner.latestFrame
        ? runner.latestFrame
        : await grabFrame({ kind: 'device', format: input.device.format || defaultDeviceFormat(), name: input.device.name, videoSize: input.device.videoSize });
      return { ok: true, preview: `data:image/jpeg;base64,${jpeg.toString('base64')}`, streamUri: input.device.name };
    }
    let url = input.streamUrl;
    if (input.kind === 'onvif') {
      const session = await onvif.openSession({
        hostname: input.onvif?.hostname,
        port: input.onvif?.port,
        path: input.onvif?.path,
        username: input.username,
        password,
      });
      try {
        const info = await onvif.inspect(session, { profileToken: input.onvif?.profileToken });
        Object.assign(result, info);
        url = info.streamUri;
      } finally {
        try { await session.close?.(); } catch {}
      }
    }
    if (!url) throw new Error('No stream URL to test.');
    const jpeg = await grabFrame({ url: onvif.withCredentials(url, input.username, password), transport: input.rtspTransport });
    result.ok = true;
    result.preview = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
    result.streamUri = onvif.redactUrl(url);
    return result;
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    on: (...a) => emitter.on(...a),
    store,
    server,

    async init() {
      await server.start();
      for (const cam of store.listCameras()) if (cam.enabled) startRunner(cam);
      sweepRetention();
      retentionTimer = setInterval(() => sweepRetention(), 60 * 60 * 1000);
      retentionTimer.unref?.();
    },

    async shutdown() {
      clearInterval(retentionTimer);
      for (const id of [...runners.keys()]) await stopRunner(id);
      await server.stop();
    },

    listCameras: () => store.listCameras().map(cameraView),

    async saveCamera(input) {
      const existing = input.id ? store.getCamera(input.id) : null;
      let draft = { ...input };
      if (input.kind === 'onvif') {
        // Ask the camera for its stream address now, so a bad password shows up here.
        const session = await onvif.openSession({
          hostname: input.onvif?.hostname,
          port: input.onvif?.port,
          path: input.onvif?.path,
          username: input.username,
          password: input.password || existing?.password || '',
        });
        try {
          const info = await onvif.inspect(session, { profileToken: input.onvif?.profileToken });
          draft = {
            ...draft,
            streamUrl: info.streamUri,
            snapshotUrl: info.snapshotUri,
            onvif: { ...input.onvif, profileToken: info.profileToken, ptz: info.ptz, manufacturer: info.manufacturer, model: info.model },
          };
        } finally {
          try { await session.close?.(); } catch {}
        }
      }
      const cam = store.saveCamera(draft);
      if (existing) await stopRunner(cam.id);
      if (cam.enabled) startRunner(cam);
      return cameraView(cam);
    },

    async removeCamera(id) {
      await stopRunner(id);
      return store.removeCamera(id);
    },

    async setEnabled(id, enabled) {
      const cam = store.getCamera(id);
      if (!cam) throw new Error('No such camera.');
      const saved = store.saveCamera({ ...cam, enabled });
      if (enabled) startRunner(saved); else await stopRunner(id);
      return cameraView(saved);
    },

    async setMotion(id, patch) {
      const cam = store.getCamera(id);
      if (!cam) throw new Error('No such camera.');
      const saved = store.saveCamera({ ...cam, motion: { ...cam.motion, ...patch } });
      const runner = runners.get(id);
      if (runner) runner.updateCamera(saved);
      if (patch.useCameraEvents !== undefined) {
        await closeSession(id);
        if (saved.enabled) startCameraEvents(saved);
      }
      return cameraView(saved);
    },

    testCamera,

    discover: (opts) => onvif.discover(opts),

    /** Webcams attached to this computer, marking the ones already added. */
    async listLocalDevices() {
      const devices = await listLocalDevices({ ffmpegPath: store.getSettings().ffmpegPath || 'ffmpeg', spawnFn });
      const used = new Map(store.listCameras().filter((c) => c.kind === 'device').map((c) => [c.device.name, c.name]));
      return devices.map((d) => ({ ...d, usedBy: used.get(d.name) || '' }));
    },

    async ptzMove(id, { pan = 0, tilt = 0, zoom = 0 } = {}) {
      const cam = store.getCamera(id);
      if (cam?.kind !== 'onvif') throw new Error('PTZ needs an ONVIF camera.');
      const session = await getSession(cam);
      // The camera stops by itself after 2 s if the stop request is lost.
      await session.continuousMove({ x: pan, y: tilt, zoom, profile: cam.onvif.profileToken, timeoutMs: 2000 });
      return true;
    },

    async ptzStop(id) {
      const cam = store.getCamera(id);
      if (cam?.kind !== 'onvif') return false;
      const session = await getSession(cam);
      await session.stop(cam.onvif.profileToken);
      return true;
    },

    async ptzPresets(id) {
      const cam = store.getCamera(id);
      if (cam?.kind !== 'onvif') return [];
      const session = await getSession(cam);
      return session.getPresets(cam.onvif.profileToken);
    },

    async ptzGoto(id, presetToken) {
      const cam = store.getCamera(id);
      if (cam?.kind !== 'onvif') throw new Error('PTZ needs an ONVIF camera.');
      const session = await getSession(cam);
      await session.gotoPreset(presetToken, cam.onvif.profileToken);
      return true;
    },

    startRecording(id) {
      const runner = runners.get(id);
      if (!runner) throw new Error('Turn the camera on first.');
      runner.startRecording('manual');
      return runner.status();
    },

    stopRecording(id) {
      const runner = runners.get(id);
      runner?.stopRecording('manual');
      return runner?.status() || null;
    },

    takeSnapshot(id) {
      const runner = runners.get(id);
      if (!runner?.latestFrame) throw new Error('No picture from this camera yet.');
      const p = clipPaths(store.getSettings().recordingsDir, runner.camera.name, 'snapshot');
      fs.mkdirSync(p.dir, { recursive: true });
      fs.writeFileSync(p.thumb, runner.latestFrame);
      emitter.emit('recordings-changed');
      return { file: p.thumb, url: mediaUrl(p.thumb) };
    },

    listEvents(opts) {
      return store.listEvents(opts).map((e) => ({ ...e, thumbUrl: mediaUrl(e.thumb), videoUrl: mediaUrl(e.video) }));
    },
    clearEvents: (cameraId) => store.clearEvents(cameraId),

    listRecordings,
    deleteRecording,
    sweepRetention,
    mediaUrl,

    getSettings: () => store.getSettings(),
    saveSettings(patch) {
      const before = store.getSettings();
      const after = store.saveSettings(patch);
      const restart = ['ffmpegPath', 'liveFps', 'liveWidth', 'motionFps'].some((k) => before[k] !== after[k]);
      if (restart) for (const r of runners.values()) r.restart();
      return after;
    },

    checkFfmpeg() {
      return new Promise((resolve) => {
        let out = '';
        let proc;
        try {
          proc = spawnFn(store.getSettings().ffmpegPath || 'ffmpeg', ['-hide_banner', '-version'], { windowsHide: true });
        } catch (err) { resolve({ ok: false, error: err.message }); return; }
        proc.stdout?.on('data', (d) => { out += d; });
        proc.on('error', (err) => resolve({ ok: false, error: err.code === 'ENOENT' ? 'ffmpeg was not found.' : err.message }));
        proc.on('close', (code) => resolve(code === 0 ? { ok: true, version: out.split('\n')[0].trim() } : { ok: false, error: `ffmpeg exited with code ${code}` }));
      });
    },
  };
}

module.exports = { createCameraManager };
