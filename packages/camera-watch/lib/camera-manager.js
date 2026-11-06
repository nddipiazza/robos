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
const { createShareServer } = require('./share-server');
const { encodeInvite, decodeInvite, SHARE_APP_ID } = require('./camera-invite');
const onvif = require('./onvif-bridge');
const http = require('node:http');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {object} o
 * @param {() => object} [o.loadMesh] returns robos-lib/app-mesh-engine; needed only
 *   for sharing cameras with, or watching cameras from, other RobOS machines
 */
function createCameraManager({ configDir, homeDir, spawnFn = spawn, loadMesh = null }) {
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

  // ── Sharing over the RobOS private network (App Mesh) ─────────────────────
  let mesh = null;
  const tunnels = new Map(); // peerNodeId -> tunnel record
  const shareServer = createShareServer({
    getCamera: (id) => store.getCamera(id),
    getRunner: (id) => runners.get(id) || null,
    onAccess: (a) => { if (!a.ok) emitter.emit('log', `Refused a request for shared camera ${a.cameraId}: wrong or old secret.`); },
  });

  function getMesh() {
    if (mesh) return mesh;
    if (!loadMesh) throw new Error('Sharing needs RobOS Private Networks (robos-lib/app-mesh-engine), which is not installed.');
    mesh = loadMesh().createAppMeshEngine({ configDir });
    return mesh;
  }

  function sharedCameras() {
    return store.listCameras().filter((c) => c.kind !== 'remote' && c.share?.enabled);
  }

  /** Run what other machines need to reach shared cameras: the share server and the mesh gateway. */
  async function startSharingServices({ relay = store.getSettings().shareRelay } = {}) {
    await shareServer.start();
    const m = getMesh();
    await m.startGateway();
    let relayUrl = null;
    if (relay) {
      try {
        relayUrl = (await m.startWanRelay()).relayUrl || null;
      } catch (err) {
        throw new Error(`Could not open the relay for other networks (${err.message}). Cameras can still be shared on this network.`);
      }
    }
    return { relayUrl };
  }

  async function stopSharingServicesIfIdle() {
    if (sharedCameras().length) return;
    await shareServer.stop();
    // Watching remote cameras needs only outbound tunnels, so with nothing shared
    // and nothing watched, this process's mesh gateway can close.
    if (mesh && !store.listCameras().some((c) => c.kind === 'remote')) {
      try { await mesh.stopGateway(); } catch {}
    }
  }

  /** A local port that reaches peerNodeId's camera share through the mesh. */
  async function ensureTunnel(peerNodeId, force = false) {
    const m = getMesh();
    const existing = tunnels.get(peerNodeId);
    if (existing && !force && m.listActiveTunnels().some((t) => t.id === existing.id)) return existing;
    if (existing) { try { m.stopLocalBridgeTunnel(existing.id); } catch {} }
    const t = await m.startLocalBridgeTunnel({ peerId: peerNodeId, remoteAppId: SHARE_APP_ID });
    tunnels.set(peerNodeId, t);
    return t;
  }

  function getJson(url, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const req = http.get(url, (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          let data = null;
          try { data = JSON.parse(body); } catch {}
          resolve({ status: res.statusCode, data });
        });
      });
      req.setTimeout(timeoutMs, () => req.destroy(new Error('timed out')));
      req.on('error', reject);
    });
  }

  async function resolveRemoteInput(cam, attempt) {
    const r = cam.remote;
    const t = await ensureTunnel(r.peerNodeId, attempt >= 2);
    const base = `http://127.0.0.1:${t.localPort}/cameras/${encodeURIComponent(r.cameraId)}`;
    const q = `s=${encodeURIComponent(r.secret)}`;
    // Ask first, so "not shared any more" and "camera is off" get plain messages.
    let info;
    try {
      info = await getJson(`${base}?${q}`);
    } catch {
      const why = getMesh().listActiveTunnels().find((x) => x.id === t.id)?.stats?.lastError || '';
      if (/UNTRUSTED|ACL_PORT_DENIED/.test(why)) {
        throw new Error(`${r.peerName || 'The other machine'} took back your invite, so its cameras are no longer shared with you.`);
      }
      throw new Error(`Could not reach ${r.peerName || 'the machine that shares this camera'}. Is it on, with Camera Watch running?`);
    }
    if (info.status === 403) throw new Error(`${r.peerName || 'The other machine'} no longer shares this camera with you.`);
    if (info.status !== 200) throw new Error(`Could not reach ${r.peerName || 'the machine that shares this camera'} (${info.data?.error || `HTTP ${info.status}`}).`);
    if (!info.data?.live) throw new Error(`The camera is ${info.data?.state === 'stopped' ? 'turned off' : 'not live'} on ${r.peerName || 'the other machine'}.`);
    return { kind: 'remote', url: `${base}/live?${q}` };
  }

  async function resolveInput(cam, attempt) {
    if (cam.kind === 'remote') return resolveRemoteInput(cam, attempt);
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
      shareViewers: cam.share?.enabled ? shareServer.viewerCount(cam.id) : 0,
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
      if (sharedCameras().length) {
        startSharingServices().catch((err) => emitter.emit('log', `Sharing: ${err.message}`));
      }
    },

    async shutdown() {
      clearInterval(retentionTimer);
      for (const id of [...runners.keys()]) await stopRunner(id);
      await server.stop();
      await shareServer.stop();
      if (mesh) { try { await mesh.stopGateway(); } catch {} }
    },

    // ── Sharing (this machine's cameras) ─────────────────────────────────────
    /**
     * Share cameras and make an invite for one person (or household). The invite
     * lets its holder reach only Camera Watch's share service on this machine,
     * and only the cameras listed in it.
     */
    async createShareInvite({ cameraIds = [], label = '', relay = false } = {}) {
      const cams = cameraIds.map((id) => store.getCamera(id)).filter((c) => c && c.kind !== 'remote');
      if (!cams.length) throw new Error('Pick at least one of your cameras to share.');
      const shared = cams.map((c) => store.saveCamera({ ...c, share: { ...c.share, enabled: true } }));
      if (relay) store.saveSettings({ shareRelay: true });
      const { relayUrl } = await startSharingServices({ relay });
      const m = getMesh();
      const { token, invite } = m.createScopedInvite({
        allowedAppIds: [SHARE_APP_ID],
        label: label || `Cameras: ${shared.map((c) => c.name).join(', ')}`,
      });
      emitter.emit('sharing-changed');
      return {
        invite: encodeInvite({ from: m.identity.nodeName, net: token, cameras: shared.map((c) => ({ id: c.id, name: c.name, secret: c.share.secret })) }),
        inviteId: invite.id,
        relayUrl,
        sameNetworkOnly: !relayUrl,
      };
    },

    /** Who can watch: shared cameras, live viewers, and the invites with the machines that joined. */
    sharingStatus() {
      const cams = sharedCameras().map((c) => ({ id: c.id, name: c.name, viewers: shareServer.viewerCount(c.id) }));
      if (!mesh && !cams.length) return { sharing: false, cameras: [], invites: [] };
      let invites = [];
      let relayUrl = null;
      try {
        const m = getMesh();
        invites = m.listInvites().filter((i) => i.allowedAppIds.includes(SHARE_APP_ID));
      } catch {}
      try { relayUrl = mesh?.generateEnrollmentToken().payload.relayUrl || null; } catch {}
      return { sharing: shareServer.running, relayUrl, relayWanted: Boolean(store.getSettings().shareRelay), cameras: cams, invites };
    },

    /** Revoke an invite: the machines that joined with it are removed from the private network. */
    async revokeShareInvite(inviteId) {
      const res = getMesh().revokeInvite(inviteId);
      if (!res.ok) throw new Error(res.error || 'Could not revoke that invite.');
      emitter.emit('sharing-changed');
      return res;
    },

    /** Stop sharing a camera. Its secret changes, so every invite that had it stops working for it. */
    async stopSharingCamera(id) {
      const cam = store.getCamera(id);
      if (!cam || cam.kind === 'remote') throw new Error('No such camera.');
      store.saveCamera({ ...cam, share: { enabled: false, secret: '' } });
      await stopSharingServicesIfIdle();
      emitter.emit('sharing-changed');
      return true;
    },

    // ── Watching cameras another machine shares ──────────────────────────────
    /** What an invite contains, without connecting. */
    previewInvite(text) {
      const inv = decodeInvite(text);
      const existing = new Set(store.listCameras().filter((c) => c.kind === 'remote').map((c) => `${c.remote.peerNodeId}/${c.remote.cameraId}`));
      let nodeId = '';
      try { nodeId = getMesh().parseEnrollmentToken(inv.net).nodeId; } catch {}
      return {
        from: inv.from,
        cameras: inv.cameras.map((c) => ({ id: c.id, name: c.name, added: existing.has(`${nodeId}/${c.id}`) })),
      };
    },

    /**
     * Join the sharer's private network with the invite and add its cameras.
     * Both machines pin each other with access limited to the camera share, so
     * neither can reach the other's other apps through this invite.
     */
    async addSharedCameras(text, { cameraIds } = {}) {
      const inv = decodeInvite(text);
      const m = getMesh();
      const parsed = m.parseEnrollmentToken(inv.net);
      const known = m.listPeers().find((p) => p.nodeId === parsed.nodeId);
      const fullPeer = known && known.allowAllApps !== false && !(known.allowedAppIds || []).length;
      const joined = await m.joinPrivateNetwork(inv.net, {
        reverseMux: false,
        // Never narrow a machine the user already trusts fully on the private network.
        ...(fullPeer ? {} : { peerAccess: { allowAllApps: false, allowedAppIds: [SHARE_APP_ID] } }),
      });
      const peer = joined.peer;
      const wanted = inv.cameras.filter((c) => !cameraIds || cameraIds.includes(c.id));
      const added = [];
      for (const c of wanted) {
        const existing = store.listCameras().find((x) => x.kind === 'remote' && x.remote.peerNodeId === peer.nodeId && x.remote.cameraId === c.id);
        const saved = store.saveCamera({
          ...(existing || {}),
          id: existing?.id,
          kind: 'remote',
          name: existing?.name || c.name,
          remote: { peerNodeId: peer.nodeId, peerName: inv.from || peer.name, cameraId: c.id, secret: c.secret },
          // Motion detection runs here too; recording it is up to the viewer.
          motion: existing?.motion || { record: false },
        });
        if (existing) await stopRunner(saved.id);
        if (saved.enabled) startRunner(saved);
        added.push(cameraView(saved));
      }
      return added;
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
      const removed = store.removeCamera(id);
      await stopSharingServicesIfIdle();
      return removed;
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
