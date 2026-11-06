'use strict';

// Stand-in for the Electron preload bridge, so the window can be opened in a
// plain browser to look at the layout (and in UI tests). It does nothing when
// the real bridge is present.

/* global window */
(function installDemoBridge() {
  if (window.robos) return;

  const scene = (label, hue) => `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},25%,30%)"/><stop offset="1" stop-color="hsl(${hue},20%,12%)"/></linearGradient></defs><rect width="960" height="540" fill="url(#g)"/><rect x="120" y="260" width="300" height="200" fill="hsl(${hue},15%,22%)"/><rect x="560" y="200" width="260" height="260" fill="hsl(${hue},15%,18%)"/><text x="24" y="516" fill="#cbd5e1" font-family="monospace" font-size="20">${label}</text></svg>`,
  )}`;

  const now = Date.now();
  const cams = [
    { id: 'cam-front', name: 'Front door', kind: 'onvif', enabled: true, onvif: { hostname: '192.168.1.64', port: 80, ptz: false, manufacturer: 'Reolink', model: 'RLC-510A' }, motion: { enabled: true, record: true, sensitivity: 60, minAreaPercent: 1.5, zones: [] }, status: { state: 'live', fps: 8, motion: true, motionScore: 3.4, recording: { reason: 'motion' } } },
    { id: 'cam-drive', name: 'Driveway', kind: 'onvif', enabled: true, onvif: { hostname: '192.168.1.65', port: 8000, ptz: true, manufacturer: 'Amcrest', model: 'IP4M-1041' }, motion: { enabled: true, record: true, sensitivity: 50, minAreaPercent: 2, zones: [{ x: 0.1, y: 0.5, w: 0.5, h: 0.45 }] }, status: { state: 'live', fps: 8, motion: false, motionScore: 0.3 } },
    { id: 'cam-garage', name: 'Garage', kind: 'url', enabled: true, streamUrl: 'rtsp://192.168.1.70:554/stream1', motion: { enabled: true, record: false, sensitivity: 70, minAreaPercent: 1, zones: [] }, status: { state: 'error', error: 'The camera did not answer. Is it on and on this network?' } },
    { id: 'cam-yard', name: 'Back yard', kind: 'url', enabled: true, streamUrl: 'http://192.168.1.71/video.mjpg', motion: { enabled: false, record: false, sensitivity: 60, minAreaPercent: 1.5, zones: [] }, status: { state: 'live', fps: 7.5, motion: false, motionScore: 0 } },
  ].map((c, i) => ({ ...c, hasPassword: true, liveUrl: scene(c.name, 200 + i * 30), frameUrl: scene(c.name, 200 + i * 30) }));

  const events = [0, 1, 2, 3, 4].map((i) => ({
    id: `evt-${i}`, cameraId: cams[i % 2].id, cameraName: cams[i % 2].name, type: 'motion', source: i === 3 ? 'camera' : 'app',
    startedAt: new Date(now - i * 47 * 60000).toISOString(), endedAt: i === 0 ? undefined : new Date(now - i * 47 * 60000 + 34000).toISOString(),
    peakScore: 4.2 + i, thumbUrl: cams[i % 2].frameUrl, videoUrl: '',
  }));

  const ok = (data) => Promise.resolve({ ok: true, data });
  const no = () => () => {};
  const settings = { recordingsDir: '~/Videos/Camera Watch', retentionDays: 14, postMotionSeconds: 10, maxClipMinutes: 15, liveFps: 8, liveWidth: 960, motionFps: 4, ffmpegPath: 'ffmpeg' };

  window.robos = {
    listCameras: () => ok(cams),
    saveCamera: (c) => ok({ ...c, id: c.id || `cam-${Date.now()}`, enabled: true, motion: { enabled: true }, liveUrl: scene(c.name, 160), frameUrl: scene(c.name, 160) }),
    removeCamera: () => ok(true),
    setEnabled: (id, enabled) => ok({ ...cams.find((c) => c.id === id), enabled }),
    setMotion: (id, patch) => { const c = cams.find((x) => x.id === id); c.motion = { ...c.motion, ...patch }; return ok(c); },
    testCamera: () => ok({ ok: true, preview: cams[0].frameUrl, manufacturer: 'Demo', model: 'Camera', streamUri: 'rtsp://192.168.1.64:554/h264', profiles: [{ token: 'main', name: 'Main stream', width: 2560, height: 1440, encoding: 'H264' }, { token: 'sub', name: 'Sub stream', width: 640, height: 360, encoding: 'H264' }], profileToken: 'main' }),
    discover: () => new Promise((r) => setTimeout(() => r({ ok: true, data: [
      { hostname: '192.168.1.64', port: 80, path: '/onvif/device_service', name: 'Front door', hardware: 'RLC-510A' },
      { hostname: '192.168.1.80', port: 8899, path: '/onvif/device_service', name: 'IPCAM', hardware: 'C6CN' },
    ] }), 600)),
    createShareInvite: () => ok({ invite: 'robos-cam://eyJ2IjoxLCJkZW1vIjp0cnVlfQ', inviteId: 'inv_demo', relayUrl: null, sameNetworkOnly: true }),
    sharingStatus: () => ok({ sharing: true, relayUrl: null, relayWanted: false, cameras: [{ id: 'cam-front', name: 'Front door', viewers: 1 }], invites: [{ id: 'inv_demo', label: 'For my neighbour', createdAt: new Date().toISOString(), allowedAppIds: ['camera-watch-share'], peers: [{ nodeId: 'n1', name: 'NEIGHBOUR-PC' }] }] }),
    revokeShareInvite: () => ok({ ok: true }), stopSharingCamera: () => ok(true),
    previewInvite: () => ok({ from: 'NEIGHBOUR-PC', cameras: [{ id: 'cam-1', name: 'Their porch', added: false }] }),
    addSharedCameras: () => ok([]), copyText: () => ok(true), onSharingChanged: no,
    listLocalDevices: () => ok([{ format: 'dshow', name: 'Integrated Webcam', label: 'Integrated Webcam', usedBy: '' }]),
    ptzMove: () => ok(true), ptzStop: () => ok(true),
    ptzPresets: () => ok([{ token: '1', name: 'Gate' }, { token: '2', name: 'Street' }]), ptzGoto: () => ok(true),
    startRecording: (id) => ok({ cameraId: id, state: 'live', recording: { reason: 'manual' } }),
    stopRecording: (id) => ok({ cameraId: id, state: 'live', recording: null }),
    snapshot: () => ok({}),
    listEvents: () => ok(events), clearEvents: () => ok(true),
    listRecordings: () => ok(events.slice(1).map((e, i) => ({ file: `/demo/${i}.mp4`, kind: i === 2 ? 'snapshot' : 'video', camera: e.cameraName, day: e.startedAt.slice(0, 10), time: new Date(e.startedAt).toTimeString().slice(0, 8), reason: i === 2 ? 'snapshot' : 'motion', size: 4.2e6 * (i + 1), url: e.thumbUrl, thumbUrl: e.thumbUrl }))),
    deleteRecording: () => ok(true), revealRecording: () => ok(true), openRecordingsFolder: () => ok(true),
    getSettings: () => ok(settings), saveSettings: (p) => ok(Object.assign(settings, p)), pickFolder: () => ok(null),
    checkFfmpeg: () => ok({ ok: true, version: 'ffmpeg version 6.1.1 (demo)' }),
    onStatus: no, onScore: no, onEvent: no, onLog: no, onRecordingsChanged: no,
  };
})();
