'use strict';

// The eyes: one camera from RobOS Camera Watch. The camera list is the one the
// user set up in Camera Watch (~/.config/robos/camera-watch/cameras.json), and
// the video comes through Camera Watch's own camera runner (ffmpeg), so every
// camera kind it supports works here too: ONVIF, RTSP/MJPEG URLs and local
// webcams. Cameras another machine shares need Camera Watch's App Mesh tunnel,
// so they are listed but not opened here.

const { EventEmitter } = require('node:events');

const EYE_SETTINGS = { liveFps: 4, liveWidth: 640, motionFps: 1 };

/**
 * @param {object} o
 * @param {string} o.configDir
 * @param {(rel: string) => any} o.requireShared loads camera-watch/lib/* from the checkout or the install
 */
function createEyes({ configDir, requireShared, spawnFn }) {
  const emitter = new EventEmitter();
  const storeMod = requireShared('camera-watch/lib/store');
  const runnerMod = requireShared('camera-watch/lib/camera-runner');
  const onvif = requireShared('camera-watch/lib/onvif-bridge');
  const available = Boolean(storeMod && runnerMod && onvif);

  let runner = null;
  let cameraId = '';
  let latest = null;
  let latestAt = 0;
  let status = { state: 'off', message: 'Eyes are closed.' };
  let injected = null; // tests can hand the eyes a picture

  function store() {
    // Read fresh each time so cameras added in Camera Watch show up.
    return storeMod.createStore({ configDir });
  }

  function listCameras() {
    if (!available) return [];
    try {
      return store().listCameras().map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        enabled: c.enabled !== false,
        canOpen: c.kind !== 'remote',
      }));
    } catch {
      return [];
    }
  }

  function setStatus(state, message) {
    status = { state, message, cameraId };
    emitter.emit('status', status);
  }

  async function resolveInput(cam) {
    if (cam.kind === 'device') {
      return { kind: 'device', format: cam.device.format, name: cam.device.name, videoSize: cam.device.videoSize };
    }
    if (!cam.streamUrl) throw new Error('This camera has no stream address yet. Open it once in Camera Watch first.');
    return { url: onvif.withCredentials(cam.streamUrl, cam.username, cam.password), transport: cam.rtspTransport };
  }

  function close() {
    if (runner) {
      try { runner.stop(); } catch {}
      runner.removeAllListeners();
    }
    runner = null;
    cameraId = '';
    latest = null;
    latestAt = 0;
    setStatus('off', 'Eyes are closed.');
  }

  function open(id) {
    if (id === cameraId && runner) return status;
    close();
    if (!id) return status;
    if (!available) {
      setStatus('error', 'RobOS Camera Watch is not installed, so there are no cameras to see with.');
      return status;
    }
    const s = store();
    const cam = s.listCameras().find((c) => c.id === id);
    if (!cam) {
      setStatus('error', 'That camera is no longer in Camera Watch.');
      return status;
    }
    cameraId = id;
    if (cam.kind === 'remote') {
      setStatus('error', `${cam.name} is shared from another machine. Watch it in Camera Watch; Personality opens only cameras on this machine.`);
      return status;
    }
    runner = new runnerMod.CameraRunner({
      camera: cam,
      getSettings: () => ({ ...s.getSettings(), ...EYE_SETTINGS }),
      resolveInput,
      ...(spawnFn ? { spawnFn } : {}),
    });
    runner.on('frame', (frame) => {
      latest = frame;
      latestAt = Date.now();
      emitter.emit('frame', { cameraId, at: latestAt });
    });
    runner.on('status', (st) => {
      if (st.state === 'live') setStatus('live', `Seeing through ${cam.name}.`);
      else if (st.error) setStatus('error', `${cam.name}: ${st.error}`);
      else setStatus(st.state || 'starting', `Opening ${cam.name}…`);
    });
    setStatus('starting', `Opening ${cam.name}…`);
    runner.start();
    return status;
  }

  return {
    available,
    on: (...a) => emitter.on(...a),
    listCameras,
    open,
    close,
    status: () => ({ ...status }),
    cameraName() {
      if (injected) return injected.cameraName;
      return listCameras().find((c) => c.id === cameraId)?.name || '';
    },
    /** The newest JPEG frame, or null when nothing has been seen in 10 s. */
    frame() {
      if (injected) return injected.jpg;
      return latest && Date.now() - latestAt < 10000 ? latest : null;
    },
    frameAt: () => (injected ? injected.at : latestAt),
    inject(jpg, cameraName = 'Test camera') {
      injected = jpg ? { jpg, cameraName, at: Date.now() } : null;
      if (injected) {
        setStatus('live', `Seeing through ${cameraName}.`);
        emitter.emit('frame', { cameraId: 'test', at: injected.at });
      }
    },
  };
}

module.exports = { createEyes, EYE_SETTINGS };
