'use strict';

// Unit tests for RobOS Camera Watch (packages/camera-watch/lib):
// - JPEG frame splitting of ffmpeg's MJPEG output
// - motion detection (background, area threshold, cooldown, lighting changes, zones)
// - the camera store (passwords kept out of the renderer, edits keep the password)
// - the local stream server (token, live MJPEG, recordings with Range, no path escape)
// - the camera runner and manager with a pretend ffmpeg (live state, motion events,
//   motion recording, retention clean-up, missing ffmpeg)
// - the ONVIF bridge against the real `onvif` package, talking to a pretend camera
//   over HTTP and a pretend WS-Discovery responder over UDP multicast. These are
//   skipped when the package is not installed (run `npm install` in packages/camera-watch).
//
// No real cameras, no ffmpeg and no LAN traffic. HOME and ROBOS_CONFIG_DIR point at a temp dir.

const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-camera-watch-'));
process.env.HOME = tmpHome;
process.env.ROBOS_CONFIG_DIR = path.join(tmpHome, '.config', 'robos');
after(() => fs.rmSync(tmpHome, { recursive: true, force: true }));

const appDir = path.resolve(__dirname, '..', '..', '..', 'camera-watch');
const { JpegSplitter } = require(path.join(appDir, 'lib', 'jpeg-splitter'));
const { createMotionDetector, pixelThreshold } = require(path.join(appDir, 'lib', 'motion-detector'));
const { createStore, publicCamera } = require(path.join(appDir, 'lib', 'store'));
const { createStreamServer } = require(path.join(appDir, 'lib', 'stream-server'));
const { CameraRunner, liveArgs, recordArgs, MOTION_W, MOTION_H } = require(path.join(appDir, 'lib', 'camera-runner'));
const { createCameraManager } = require(path.join(appDir, 'lib', 'camera-manager'));
const bridge = require(path.join(appDir, 'lib', 'onvif-bridge'));
const { startFakeOnvifCamera } = require('./fake-onvif-camera');
const { startFakeDiscoveryResponder } = require('./fake-ws-discovery');

let onvifInstalled = true;
try { bridge.loadOnvif(); } catch { onvifInstalled = false; }

const W = 32;
const H = 18;
const flat = (v, w = W, h = H) => Buffer.alloc(w * h, v);
function withBlock(base, x0, y0, bw, bh, v, w = W) {
  const b = Buffer.from(base);
  for (let y = y0; y < y0 + bh; y++) for (let x = x0; x < x0 + bw; x++) b[y * w + x] = v;
  return b;
}
const jpeg = (n) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, n, 0x00, 0xff, 0x00, n, 0xff, 0xd9]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function getRaw(url, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get(url, { headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

// A pretend ffmpeg child process. Live processes get a pipe 3 for motion frames.
function makeFakeSpawn() {
  const procs = [];
  const fn = (cmd, args, opts) => {
    if (cmd === 'missing-ffmpeg') {
      const err = new Error('spawn missing-ffmpeg ENOENT');
      err.code = 'ENOENT';
      const p = new EventEmitter();
      p.stdout = new PassThrough(); p.stderr = new PassThrough(); p.stdio = [null, p.stdout, p.stderr];
      p.kill = () => {};
      setImmediate(() => p.emit('error', err));
      procs.push({ cmd, args, proc: p });
      return p;
    }
    const p = new EventEmitter();
    p.stdout = new PassThrough();
    p.stderr = new PassThrough();
    p.stdio = [null, p.stdout, p.stderr, opts?.stdio?.[3] === 'pipe' ? new PassThrough() : null];
    p.stdinData = '';
    p.stdin = new Writable({ write(c, _e, cb) { p.stdinData += c; cb(); } });
    p.killed = false;
    p.finish = (code = 0) => { if (!p.closed) { p.closed = true; p.emit('close', code); } };
    p.kill = () => { p.killed = true; setImmediate(() => p.finish(null)); };
    // A recorder writes its output file and stops on "q".
    const out = args[args.length - 1];
    if (args.includes('-movflags')) {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, Buffer.alloc(2048, 1));
      p.stdin = new Writable({ write(c, _e, cb) { p.stdinData += c; if (String(c).includes('q')) setImmediate(() => p.finish(0)); cb(); } });
    }
    procs.push({ cmd, args, proc: p });
    return p;
  };
  fn.procs = procs;
  return fn;
}

describe('JpegSplitter', () => {
  it('splits back-to-back JPEGs, across chunk boundaries and with junk between', () => {
    const frames = [];
    const s = new JpegSplitter((f) => frames.push(f));
    const all = Buffer.concat([Buffer.from([1, 2, 3]), jpeg(1), jpeg(2), Buffer.from([9]), jpeg(3)]);
    // feed one byte at a time to hit every split point (FF|D8 and FF|D9 across chunks)
    for (const b of all) s.push(Buffer.from([b]));
    assert.deepStrictEqual(frames, [jpeg(1), jpeg(2), jpeg(3)]);
    s.push(Buffer.concat([jpeg(4), jpeg(5)]));
    assert.strictEqual(frames.length, 5);
    assert.deepStrictEqual(frames[4], jpeg(5));
  });
});

describe('motion detector', () => {
  it('maps sensitivity to a pixel threshold (higher sensitivity, smaller threshold)', () => {
    assert.ok(pixelThreshold(100) < pixelThreshold(50));
    assert.ok(pixelThreshold(50) < pixelThreshold(1));
  });

  it('stays quiet on a still picture and on sensor noise', () => {
    const d = createMotionDetector({ width: W, height: H });
    let t = 0;
    for (let i = 0; i < 20; i++) {
      const r = d.feed(flat(100 + (i % 2) * 3), (t += 250));
      assert.strictEqual(r.motion, false);
    }
  });

  it('starts motion after two changed frames and ends after the cooldown', () => {
    const d = createMotionDetector({ width: W, height: H, minAreaPercent: 2, cooldownMs: 1000 });
    let t = 0;
    d.feed(flat(50), (t += 250));
    const first = d.feed(withBlock(flat(50), 4, 4, 6, 6, 220), (t += 250));
    assert.strictEqual(first.started, false, 'one frame is not enough');
    const second = d.feed(withBlock(flat(50), 6, 4, 6, 6, 220), (t += 250));
    assert.strictEqual(second.started, true);
    assert.ok(second.score > 2);
    let ended = null;
    for (let i = 0; i < 10 && !ended; i++) {
      const r = d.feed(flat(50), (t += 250));
      if (r.ended) ended = r;
    }
    assert.ok(ended, 'motion ended');
    assert.ok(ended.peakScore > 2);
    assert.strictEqual(d.active, false);
  });

  it('treats a whole-picture change as lighting, not motion', () => {
    const d = createMotionDetector({ width: W, height: H });
    let t = 0;
    d.feed(flat(30), (t += 250));
    const a = d.feed(flat(200), (t += 250));
    const b = d.feed(flat(200), (t += 250));
    assert.strictEqual(a.lightingChange, true);
    assert.strictEqual(b.motion, false);
  });

  it('ignores motion outside the zones', () => {
    const d = createMotionDetector({ width: W, height: H, zones: [{ x: 0.5, y: 0, w: 0.5, h: 1 }] });
    let t = 0;
    d.feed(flat(50), (t += 250));
    for (let i = 0; i < 4; i++) {
      assert.strictEqual(d.feed(withBlock(flat(50), 1 + i, 2, 8, 8, 220), (t += 250)).motion, false, 'left half is not watched');
    }
    d.reset();
    d.feed(flat(50), (t += 250));
    d.feed(withBlock(flat(50), 20, 2, 8, 8, 220), (t += 250));
    assert.strictEqual(d.feed(withBlock(flat(50), 21, 2, 8, 8, 220), (t += 250)).motion, true, 'right half is watched');
  });
});

describe('camera store', () => {
  const configDir = path.join(tmpHome, 'store-test');

  it('keeps the saved password on edit and never hands it to the renderer', () => {
    const store = createStore({ configDir, homeDir: tmpHome });
    const cam = store.saveCamera({ name: 'Gate', kind: 'url', streamUrl: 'rtsp://10.0.0.5/s1', username: 'admin', password: 'pw1' });
    assert.match(cam.id, /^cam-/);
    const edited = store.saveCamera({ id: cam.id, name: 'Gate 2', kind: 'url', streamUrl: 'rtsp://10.0.0.5/s1', password: '' });
    assert.strictEqual(edited.password, 'pw1');
    const pub = publicCamera(edited);
    assert.strictEqual(pub.password, undefined);
    assert.strictEqual(pub.hasPassword, true);
    const again = createStore({ configDir, homeDir: tmpHome });
    assert.strictEqual(again.getCamera(cam.id).name, 'Gate 2');
  });

  it('moves a login typed into the stream address into the user and password fields', () => {
    const store = createStore({ configDir: path.join(tmpHome, 'store-url-login'), homeDir: tmpHome });
    const cam = store.saveCamera({ name: 'Shed', kind: 'url', streamUrl: 'rtsp://admin:p%40ss@10.0.0.7:554/live' });
    assert.strictEqual(cam.streamUrl, 'rtsp://10.0.0.7:554/live');
    assert.strictEqual(cam.username, 'admin');
    assert.strictEqual(cam.password, 'p@ss');
    const saved = fs.readFileSync(path.join(tmpHome, 'store-url-login', 'camera-watch', 'cameras.json'), 'utf8');
    assert.ok(!saved.includes('p%40ss') && !saved.includes('admin:'), 'no login left inside the URL on disk');
  });

  it('rejects a stream camera without an address and clamps settings', () => {
    const store = createStore({ configDir, homeDir: tmpHome });
    assert.throws(() => store.saveCamera({ name: 'x', kind: 'url' }), /stream URL/);
    assert.throws(() => store.saveCamera({ name: 'x', kind: 'onvif', onvif: {} }), /address/);
    const s = store.saveSettings({ liveFps: 500, retentionDays: -3, ffmpegPath: '' });
    assert.strictEqual(s.liveFps, 30);
    assert.strictEqual(s.retentionDays, 0);
    assert.strictEqual(s.ffmpegPath, 'ffmpeg');
  });

  it('caps and filters the event log', () => {
    const store = createStore({ configDir: path.join(tmpHome, 'store-events'), homeDir: tmpHome });
    for (let i = 0; i < 5; i++) store.addEvent({ cameraId: i % 2 ? 'a' : 'b', startedAt: new Date().toISOString() });
    assert.strictEqual(store.listEvents().length, 5);
    assert.strictEqual(store.listEvents({ cameraId: 'a' }).length, 2);
    store.clearEvents('a');
    assert.strictEqual(store.listEvents().length, 3);
  });
});

describe('stream server', () => {
  it('needs the token, streams MJPEG, serves recordings with Range and refuses paths outside the folder', async () => {
    const mediaRoot = path.join(tmpHome, 'media');
    fs.mkdirSync(path.join(mediaRoot, 'Cam', '2026-01-01'), { recursive: true });
    const clip = path.join(mediaRoot, 'Cam', '2026-01-01', '10-00-00-motion.mp4');
    fs.writeFileSync(clip, Buffer.from('0123456789'));
    const secret = path.join(tmpHome, 'secret.jpg');
    fs.writeFileSync(secret, 'nope');

    const runner = new CameraRunner({ camera: { id: 'cam-1', name: 'Cam', motion: {} }, getSettings: () => ({}), resolveInput: async () => ({}) });
    const server = createStreamServer({ getRunner: (id) => (id === 'cam-1' ? runner : null), getMediaRoot: () => mediaRoot });
    await server.start();
    try {
      const t = server.token;
      assert.strictEqual((await getRaw(`${server.baseUrl}/frame/cam-1.jpg`)).status, 403);
      assert.strictEqual((await getRaw(`${server.baseUrl}/frame/cam-1.jpg?t=${t}`)).status, 404, 'no frame yet');

      // live: first frame arrives on an open multipart response
      const got = new Promise((resolve) => {
        http.get(`${server.baseUrl}/live/cam-1?t=${t}`, (res) => {
          assert.match(res.headers['content-type'], /multipart\/x-mixed-replace; boundary=frame/);
          let buf = Buffer.alloc(0);
          res.on('data', (c) => {
            buf = Buffer.concat([buf, c]);
            if (buf.includes(Buffer.from([0xff, 0xd9]))) { res.destroy(); resolve(buf); }
          });
        });
      });
      await wait(50);
      runner._onFrame(jpeg(7));
      const body = await got;
      assert.ok(body.toString('latin1').includes('Content-Type: image/jpeg'));
      assert.ok(body.includes(jpeg(7)));
      const still = await getRaw(`${server.baseUrl}/frame/cam-1.jpg?t=${t}`);
      assert.deepStrictEqual(still.body, jpeg(7));

      const ranged = await getRaw(`${server.baseUrl}/media?path=${encodeURIComponent(clip)}&t=${t}`, { Range: 'bytes=2-5' });
      assert.strictEqual(ranged.status, 206);
      assert.strictEqual(ranged.body.toString(), '2345');
      assert.strictEqual(ranged.headers['content-range'], 'bytes 2-5/10');
      assert.strictEqual((await getRaw(`${server.baseUrl}/media?path=${encodeURIComponent(secret)}&t=${t}`)).status, 404);
      const sneaky = path.join(mediaRoot, '..', 'secret.jpg');
      assert.strictEqual((await getRaw(`${server.baseUrl}/media?path=${encodeURIComponent(sneaky)}&t=${t}`)).status, 404);
    } finally {
      runner.stop();
      await server.stop();
    }
  });
});

describe('ffmpeg arguments', () => {
  it('reads RTSP over TCP into a JPEG pipe and a small grey motion pipe', () => {
    const a = liveArgs({ url: 'rtsp://u:p@cam/s', transport: 'tcp' }, { liveFps: 5, liveWidth: 640, motionFps: 3 });
    assert.deepStrictEqual(a.slice(a.indexOf('-rtsp_transport'), a.indexOf('-rtsp_transport') + 2), ['-rtsp_transport', 'tcp']);
    assert.ok(a.includes('pipe:1') && a.includes('pipe:3'));
    assert.ok(a.some((x) => x.includes(`scale=${MOTION_W}:${MOTION_H},format=gray`)));
    assert.ok(a.some((x) => x.startsWith('fps=5,')));
  });

  it('copies H.264 from RTSP but encodes MJPEG-over-HTTP when recording', () => {
    const r = recordArgs({ url: 'rtsp://cam/s' }, '/x.mp4', 60);
    assert.deepStrictEqual(r.slice(r.indexOf('-c:v'), r.indexOf('-c:v') + 2), ['-c:v', 'copy']);
    const h = recordArgs({ url: 'http://cam/video.mjpg' }, '/x.mp4', 60);
    assert.deepStrictEqual(h.slice(h.indexOf('-c:v'), h.indexOf('-c:v') + 2), ['-c:v', 'libx264']);
    assert.ok(!h.includes('-rtsp_transport'));
    assert.ok(r.includes('+frag_keyframe+empty_moov+default_base_moof'));
  });
});

describe('camera manager with a pretend ffmpeg', () => {
  it('goes live, logs motion, records a clip and links it to the event', async () => {
    const spawnFn = makeFakeSpawn();
    const configDir = path.join(tmpHome, 'mgr1');
    const recordingsDir = path.join(tmpHome, 'mgr1-rec');
    const mgr = createCameraManager({ configDir, homeDir: tmpHome, spawnFn });
    mgr.store.saveSettings({ recordingsDir, postMotionSeconds: 0, retentionDays: 0 });
    const events = [];
    mgr.on('event', (e) => events.push(e));
    await mgr.init();
    try {
      const cam = await mgr.saveCamera({ name: 'Porch', kind: 'url', streamUrl: 'rtsp://10.0.0.9/live', username: 'admin', password: 'pw', motion: { cooldownSeconds: 1 } });
      await wait(20);
      const live = spawnFn.procs.find((p) => p.args.includes('pipe:3'));
      assert.ok(live, 'live ffmpeg started');
      assert.ok(live.args.includes('rtsp://admin:pw@10.0.0.9/live'), 'credentials go into the stream URL');

      live.proc.stdout.write(jpeg(1));
      await wait(10);
      assert.strictEqual(mgr.listCameras()[0].status.state, 'live');
      assert.ok(!JSON.stringify(mgr.listCameras()).includes('"pw"'), 'no password in the camera list');

      const motionPipe = live.proc.stdio[3];
      const still = Buffer.alloc(MOTION_W * MOTION_H, 60);
      const moved = (x) => {
        const b = Buffer.from(still);
        for (let y = 10; y < 30; y++) for (let i = x; i < x + 20; i++) b[y * MOTION_W + i] = 230;
        return b;
      };
      motionPipe.write(still);
      motionPipe.write(moved(10));
      motionPipe.write(moved(14));
      await wait(20);
      const ev = events.find((e) => e.type === 'motion');
      assert.ok(ev, 'motion event logged');
      assert.strictEqual(ev.cameraName, 'Porch');
      assert.ok(ev.thumb && fs.existsSync(ev.thumb), 'thumbnail saved');
      const rec = spawnFn.procs.find((p) => p.args.includes('-movflags'));
      assert.ok(rec, 'recording started on motion');
      assert.ok(rec.args.at(-1).startsWith(path.join(recordingsDir, 'Porch')));

      // Motion stops: after the cooldown the recording is asked to finish ("q").
      await wait(1100);
      motionPipe.write(still);
      motionPipe.write(still);
      await wait(50);
      assert.ok(rec.proc.stdinData.includes('q'));
      const final = mgr.listEvents().find((e) => e.id === ev.id);
      assert.ok(final.endedAt, 'event has an end time');
      assert.strictEqual(final.video, rec.args.at(-1), 'clip linked to the event');
      assert.ok(final.videoUrl.includes('/media?path='));

      const recs = mgr.listRecordings();
      assert.strictEqual(recs.length, 1);
      assert.strictEqual(recs[0].kind, 'video');
      assert.ok(recs[0].thumbUrl, 'clip has a thumbnail');

      assert.throws(() => mgr.deleteRecording(path.join(tmpHome, 'elsewhere.mp4')), /not a Camera Watch recording/);
      mgr.deleteRecording(recs[0].file);
      assert.strictEqual(mgr.listRecordings().length, 0);
    } finally {
      await mgr.shutdown();
    }
  });

  it('explains a missing ffmpeg and keeps retrying', async () => {
    const spawnFn = makeFakeSpawn();
    const mgr = createCameraManager({ configDir: path.join(tmpHome, 'mgr2'), homeDir: tmpHome, spawnFn });
    mgr.store.saveSettings({ ffmpegPath: 'missing-ffmpeg', recordingsDir: path.join(tmpHome, 'mgr2-rec') });
    const statuses = [];
    mgr.on('status', (s) => statuses.push(s));
    await mgr.init();
    try {
      await mgr.saveCamera({ name: 'Yard', kind: 'url', streamUrl: 'http://10.0.0.8/video.mjpg' });
      await wait(50);
      const err = statuses.find((s) => s.state === 'error');
      assert.ok(err, 'error state reported');
      assert.match(err.error, /ffmpeg was not found/);
      assert.deepStrictEqual(await mgr.checkFfmpeg(), { ok: false, error: 'ffmpeg was not found.' });
    } finally {
      await mgr.shutdown();
    }
  });

  it('deletes clips older than the retention period and keeps newer ones', () => {
    const recordingsDir = path.join(tmpHome, 'mgr3-rec');
    const mgr = createCameraManager({ configDir: path.join(tmpHome, 'mgr3'), homeDir: tmpHome, spawnFn: makeFakeSpawn() });
    mgr.store.saveSettings({ recordingsDir, retentionDays: 7 });
    const old = path.join(recordingsDir, 'Cam', '2026-01-01');
    const fresh = path.join(recordingsDir, 'Cam', '2026-01-20');
    fs.mkdirSync(old, { recursive: true });
    fs.mkdirSync(fresh, { recursive: true });
    fs.writeFileSync(path.join(old, '10-00-00-motion.mp4'), 'x');
    fs.writeFileSync(path.join(old, '10-00-00-motion.jpg'), 'x');
    fs.writeFileSync(path.join(old, 'notes.txt'), 'keep me');
    fs.writeFileSync(path.join(fresh, '10-00-00-motion.mp4'), 'x');
    const removed = mgr.sweepRetention(new Date('2026-01-21T12:00:00').getTime());
    assert.strictEqual(removed, 2);
    assert.ok(fs.existsSync(path.join(old, 'notes.txt')), 'files it did not make are left alone');
    assert.ok(fs.existsSync(path.join(fresh, '10-00-00-motion.mp4')));
  });
});

describe('ONVIF bridge helpers', () => {
  it('adds and hides stream credentials', () => {
    assert.strictEqual(bridge.withCredentials('rtsp://10.0.0.2:554/s', 'ad min', 'p@ss'), 'rtsp://ad%20min:p%40ss@10.0.0.2:554/s');
    assert.strictEqual(bridge.withCredentials('rtsp://u:p@10.0.0.2/s', 'x', 'y'), 'rtsp://u:p@10.0.0.2/s');
    assert.strictEqual(bridge.redactUrl('Error opening rtsp://admin:hunter2@10.0.0.2/s'), 'Error opening rtsp://admin:***@10.0.0.2/s');
  });

  it('reads motion on/off from the common ONVIF event shapes', () => {
    const cell = { topic: { _: 'tns1:RuleEngine/CellMotionDetector/Motion' }, message: { message: { data: { simpleItem: { $: { Name: 'IsMotion', Value: true } } } } } };
    assert.deepStrictEqual(bridge.parseMotionEvent(cell), { topic: 'tns1:RuleEngine/CellMotionDetector/Motion', motion: true });
    const alarm = { topic: { _: 'tns1:VideoSource/MotionAlarm' }, message: { message: { data: { simpleItem: { $: { Name: 'State', Value: 'false' } } } } } };
    assert.strictEqual(bridge.parseMotionEvent(alarm).motion, false);
    const other = { topic: { _: 'tns1:Device/Trigger/DigitalInput' }, message: { message: { data: { simpleItem: { $: { Name: 'LogicalState', Value: 'true' } } } } } };
    assert.strictEqual(bridge.parseMotionEvent(other), null);
  });

  it('reads a WS-Discovery ProbeMatch', () => {
    const d = bridge.deviceFromProbeMatch({ probeMatches: { probeMatch: {
      endpointReference: { address: 'urn:uuid:abc' },
      scopes: 'onvif://www.onvif.org/name/Back_Yard onvif://www.onvif.org/hardware/IPC-1',
      XAddrs: 'http://169.254.1.1/onvif/device_service http://192.168.1.50:8080/onvif/device_service',
    } } }, { address: '192.168.1.50' });
    assert.deepStrictEqual(
      { hostname: d.hostname, port: d.port, path: d.path, name: d.name, hardware: d.hardware, urn: d.urn },
      { hostname: '192.168.1.50', port: 8080, path: '/onvif/device_service', name: 'Back Yard', hardware: 'IPC-1', urn: 'urn:uuid:abc' },
    );
  });
});

describe('ONVIF with the real onvif package', { skip: !onvifInstalled && 'onvif package not installed' }, () => {
  it('connects, reads profiles, stream and snapshot URIs, and drives PTZ', async () => {
    const fake = await startFakeOnvifCamera();
    try {
      const session = await bridge.openSession({ hostname: '127.0.0.1', port: fake.port, username: 'admin', password: 'secret' });
      const info = await bridge.inspect(session, {});
      assert.strictEqual(info.manufacturer, 'Acme');
      assert.strictEqual(info.model, 'Cam-9000');
      assert.deepStrictEqual(info.profiles.map((p) => [p.token, p.width, p.encoding]), [['main', 1920, 'H264'], ['sub', 640, 'H264']]);
      assert.strictEqual(info.profileToken, 'main');
      assert.strictEqual(info.streamUri, 'rtsp://127.0.0.1:554/main');
      assert.match(info.snapshotUri, /\/snapshot\.jpg$/);
      assert.strictEqual(info.ptz, true);

      const sub = await bridge.inspect(session, { profileToken: 'sub' });
      assert.strictEqual(sub.streamUri, 'rtsp://127.0.0.1:554/sub');

      await session.continuousMove({ x: 0.5, y: -0.25, zoom: 0, profile: 'main', timeoutMs: 2000 });
      const move = fake.calls.find((c) => c.action === 'ContinuousMove').body;
      assert.match(move, /<PanTilt x="0.5" y="-0.25"/);
      assert.match(move, /<Timeout>PT2S<\/Timeout>/);
      await session.stop('main');
      assert.deepStrictEqual(await session.getPresets('main'), [{ token: '1', name: 'Gate' }, { token: '2', name: 'Street' }]);
      await session.gotoPreset('2', 'main');
      assert.match(fake.calls.find((c) => c.action === 'GotoPreset').body, /<PresetToken>2<\/PresetToken>/);
      session.close();
    } finally {
      await fake.close();
    }
  });

  it('turns a wrong password into a plain message', async () => {
    const fake = await startFakeOnvifCamera();
    try {
      await assert.rejects(
        bridge.openSession({ hostname: '127.0.0.1', port: fake.port, username: 'intruder', password: 'x' }),
        /refused the user name or password/,
      );
    } finally {
      await fake.close();
    }
  });

  it('finds a camera with WS-Discovery', async (t) => {
    const responder = await startFakeDiscoveryResponder({ xaddr: 'http://192.168.77.10:8000/onvif/device_service', name: 'Front_Door' });
    if (!responder) { t.skip('cannot join the WS-Discovery multicast group here'); return; }
    try {
      const found = await bridge.discover({ timeoutMs: 1500 });
      const cam = found.find((d) => d.urn === 'urn:uuid:fake-camera-0001');
      assert.ok(cam, 'pretend camera found');
      assert.strictEqual(cam.hostname, '192.168.77.10');
      assert.strictEqual(cam.port, 8000);
      assert.strictEqual(cam.name, 'Front Door');
      assert.strictEqual(cam.hardware, 'Cam-9000');
    } finally {
      await responder.close();
    }
  });

  it('adds an ONVIF camera through the manager using the stream address the camera gives', async () => {
    const fake = await startFakeOnvifCamera();
    const spawnFn = makeFakeSpawn();
    const mgr = createCameraManager({ configDir: path.join(tmpHome, 'mgr-onvif'), homeDir: tmpHome, spawnFn });
    mgr.store.saveSettings({ recordingsDir: path.join(tmpHome, 'mgr-onvif-rec') });
    await mgr.init();
    try {
      const view = await mgr.saveCamera({ name: 'Drive', kind: 'onvif', username: 'admin', password: 'secret', onvif: { hostname: '127.0.0.1', port: fake.port, profileToken: 'sub' } });
      assert.strictEqual(view.streamUrl, 'rtsp://127.0.0.1:554/sub');
      assert.strictEqual(view.onvif.ptz, true);
      assert.strictEqual(view.onvif.manufacturer, 'Acme');
      await wait(30);
      const live = spawnFn.procs.find((p) => p.args.includes('pipe:3'));
      assert.ok(live.args.includes('rtsp://admin:secret@127.0.0.1:554/sub'));
      assert.deepStrictEqual(await mgr.ptzPresets(view.id), [{ token: '1', name: 'Gate' }, { token: '2', name: 'Street' }]);
      // A wrong login is caught at save time, and nothing is saved.
      await assert.rejects(
        mgr.saveCamera({ name: 'Bad', kind: 'onvif', username: 'nobody', password: 'x', onvif: { hostname: '127.0.0.1', port: fake.port } }),
        /refused the user name or password/,
      );
      assert.deepStrictEqual(mgr.listCameras().map((c) => c.name), ['Drive']);
    } finally {
      await mgr.shutdown();
      await fake.close();
    }
  });
});
