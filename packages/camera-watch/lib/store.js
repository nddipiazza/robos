'use strict';

// Saved cameras, settings and the motion event log for Camera Watch.
// Files live in <configDir>/camera-watch/. Camera passwords are kept under the
// key "password", which Config Sync strips by name, so they never leave the machine.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const MAX_EVENTS = 1000;

function defaultSettings(homeDir) {
  return {
    recordingsDir: path.join(homeDir, 'Videos', 'Camera Watch'),
    retentionDays: 14,
    ffmpegPath: 'ffmpeg',
    liveFps: 8,
    liveWidth: 960,
    motionFps: 4,
    postMotionSeconds: 10,
    maxClipMinutes: 15,
  };
}

function defaultMotion() {
  return {
    enabled: true,
    sensitivity: 60,
    minAreaPercent: 1.5,
    cooldownSeconds: 5,
    record: true,
    useCameraEvents: false,
    zones: [],
  };
}

function defaultDeviceFormat(platform = process.platform) {
  if (platform === 'win32') return 'dshow';
  if (platform === 'darwin') return 'avfoundation';
  return 'v4l2';
}

function newId() {
  return `cam-${crypto.randomBytes(4).toString('hex')}`;
}

function cleanText(v, max = 200) {
  return String(v ?? '').trim().slice(0, max);
}

function num(v, fallback, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

function normalizeCamera(input = {}, existing = null) {
  const base = existing || { id: newId(), createdAt: new Date().toISOString() };
  const kindIn = input.kind ?? base.kind;
  const kind = ['onvif', 'device'].includes(kindIn) ? kindIn : 'url';
  const cam = {
    ...base,
    name: cleanText(input.name ?? base.name, 80) || 'Camera',
    kind,
    enabled: input.enabled !== undefined ? Boolean(input.enabled) : base.enabled !== false,
    streamUrl: cleanText(input.streamUrl ?? base.streamUrl, 1000),
    snapshotUrl: cleanText(input.snapshotUrl ?? base.snapshotUrl, 1000),
    username: cleanText(input.username ?? base.username, 120),
    // An empty password field on edit keeps the saved one.
    password: input.password ? String(input.password) : (base.password || ''),
    rtspTransport: input.rtspTransport === 'udp' ? 'udp' : 'tcp',
    onvif: kind === 'onvif'
      ? {
          hostname: cleanText(input.onvif?.hostname ?? base.onvif?.hostname, 255),
          port: num(input.onvif?.port ?? base.onvif?.port, 80, 1, 65535),
          path: cleanText(input.onvif?.path ?? base.onvif?.path, 255) || '/onvif/device_service',
          profileToken: cleanText(input.onvif?.profileToken ?? base.onvif?.profileToken, 120),
          ptz: Boolean(input.onvif?.ptz ?? base.onvif?.ptz),
          manufacturer: cleanText(input.onvif?.manufacturer ?? base.onvif?.manufacturer, 120),
          model: cleanText(input.onvif?.model ?? base.onvif?.model, 120),
        }
      : null,
    // A webcam or capture card attached to this computer, read by ffmpeg's
    // DirectShow (Windows), V4L2 (Linux) or AVFoundation (macOS) input.
    device: kind === 'device'
      ? {
          format: ['dshow', 'v4l2', 'avfoundation'].includes(input.device?.format ?? base.device?.format)
            ? (input.device?.format ?? base.device?.format)
            : defaultDeviceFormat(),
          name: cleanText(input.device?.name ?? base.device?.name, 255),
          // Optional "1280x720"; empty lets the camera pick.
          videoSize: /^\d{2,5}x\d{2,5}$/.test(String(input.device?.videoSize ?? base.device?.videoSize ?? ''))
            ? String(input.device?.videoSize ?? base.device?.videoSize)
            : '',
        }
      : null,
    motion: (() => {
      const defaults = defaultMotion();
      // A new webcam on this computer usually points at the person using it:
      // detect motion, but do not record clips of them unless they turn it on.
      if (!existing && kind === 'device') defaults.record = false;
      const m = { ...defaults, ...(base.motion || {}), ...(input.motion || {}) };
      return {
        enabled: Boolean(m.enabled),
        sensitivity: num(m.sensitivity, 60, 1, 100),
        minAreaPercent: num(m.minAreaPercent, 1.5, 0.1, 50),
        cooldownSeconds: num(m.cooldownSeconds, 5, 1, 120),
        record: Boolean(m.record),
        // ONVIF cameras only: also listen to the camera's own motion alarms.
        useCameraEvents: Boolean(m.useCameraEvents),
        zones: Array.isArray(m.zones)
          ? m.zones.slice(0, 16).map((z) => ({
              x: num(z.x, 0, 0, 1), y: num(z.y, 0, 0, 1), w: num(z.w, 1, 0, 1), h: num(z.h, 1, 0, 1),
            })).filter((z) => z.w > 0 && z.h > 0)
          : [],
      };
    })(),
    updatedAt: new Date().toISOString(),
  };
  if (cam.kind === 'url' && !cam.streamUrl) throw new Error('Enter the camera stream URL (rtsp://, http:// MJPEG, …).');
  // A login typed into the address (rtsp://user:pass@host/…) moves to the user and
  // password fields, so the password is never stored or synced inside the URL.
  for (const key of ['streamUrl', 'snapshotUrl']) {
    try {
      const u = new URL(cam[key]);
      if (u.username || u.password) {
        if (!input.username && u.username) cam.username = decodeURIComponent(u.username);
        if (!input.password && u.password) cam.password = decodeURIComponent(u.password);
        u.username = '';
        u.password = '';
        cam[key] = u.toString();
      }
    } catch { /* not a URL */ }
  }
  if (cam.kind === 'onvif' && !cam.onvif.hostname) throw new Error('Enter the camera address.');
  if (cam.kind === 'device' && !cam.device.name) throw new Error('Pick the webcam to use.');
  if (cam.kind === 'device') {
    cam.streamUrl = '';
    cam.snapshotUrl = '';
  }
  return cam;
}

/** Camera without its password, for the renderer. */
function publicCamera(cam) {
  const { password, ...rest } = cam;
  return { ...rest, hasPassword: Boolean(password) };
}

function createStore({ configDir, homeDir = os.homedir() }) {
  const dir = path.join(configDir, 'camera-watch');
  const files = {
    cameras: path.join(dir, 'cameras.json'),
    settings: path.join(dir, 'settings.json'),
    events: path.join(dir, 'events.json'),
  };

  function readJson(file, fallback) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return fallback;
    }
  }

  function writeJson(file, value, mode) {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), mode ? { mode } : undefined);
    fs.renameSync(tmp, file);
  }

  let cameras = readJson(files.cameras, { cameras: [] }).cameras || [];
  let settings = { ...defaultSettings(homeDir), ...readJson(files.settings, {}) };
  let events = readJson(files.events, { events: [] }).events || [];

  const saveCameras = () => writeJson(files.cameras, { version: 1, cameras }, 0o600);
  const saveEvents = () => writeJson(files.events, { version: 1, events });

  return {
    dir,
    listCameras: () => cameras.slice(),
    getCamera: (id) => cameras.find((c) => c.id === id) || null,
    saveCamera(input) {
      const existing = input.id ? cameras.find((c) => c.id === input.id) : null;
      const cam = normalizeCamera(input, existing);
      cameras = existing ? cameras.map((c) => (c.id === cam.id ? cam : c)) : [...cameras, cam];
      saveCameras();
      return cam;
    },
    removeCamera(id) {
      const before = cameras.length;
      cameras = cameras.filter((c) => c.id !== id);
      if (cameras.length !== before) saveCameras();
      return before !== cameras.length;
    },
    getSettings: () => ({ ...settings }),
    saveSettings(patch = {}) {
      const d = defaultSettings(homeDir);
      settings = {
        recordingsDir: cleanText(patch.recordingsDir ?? settings.recordingsDir, 1000) || d.recordingsDir,
        retentionDays: num(patch.retentionDays ?? settings.retentionDays, d.retentionDays, 0, 3650),
        ffmpegPath: cleanText(patch.ffmpegPath ?? settings.ffmpegPath, 1000) || 'ffmpeg',
        liveFps: num(patch.liveFps ?? settings.liveFps, d.liveFps, 1, 30),
        liveWidth: num(patch.liveWidth ?? settings.liveWidth, d.liveWidth, 160, 3840),
        motionFps: num(patch.motionFps ?? settings.motionFps, d.motionFps, 1, 15),
        postMotionSeconds: num(patch.postMotionSeconds ?? settings.postMotionSeconds, d.postMotionSeconds, 0, 600),
        maxClipMinutes: num(patch.maxClipMinutes ?? settings.maxClipMinutes, d.maxClipMinutes, 1, 240),
      };
      writeJson(files.settings, settings);
      return { ...settings };
    },
    listEvents: ({ cameraId, limit = 200 } = {}) =>
      events.filter((e) => !cameraId || e.cameraId === cameraId).slice(0, limit),
    addEvent(evt) {
      const e = { id: `evt-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`, ...evt };
      events = [e, ...events].slice(0, MAX_EVENTS);
      saveEvents();
      return e;
    },
    updateEvent(id, patch) {
      let found = null;
      events = events.map((e) => (e.id === id ? (found = { ...e, ...patch }) : e));
      if (found) saveEvents();
      return found;
    },
    clearEvents(cameraId) {
      events = cameraId ? events.filter((e) => e.cameraId !== cameraId) : [];
      saveEvents();
    },
  };
}

module.exports = { createStore, normalizeCamera, publicCamera, defaultSettings, defaultMotion, defaultDeviceFormat };
