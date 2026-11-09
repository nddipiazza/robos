'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const APP = path.join(__dirname, '..', '..', '..', 'personality');
const { buildPrompt, parseReply, testReply } = require(path.join(APP, 'lib', 'brain'));
const { createStore, normalizePersonality, DEFAULT_PERSONALITY } = require(path.join(APP, 'lib', 'store'));
const { createStageServer } = require(path.join(APP, 'lib', 'stage-server'));
const { createEyes } = require(path.join(APP, 'lib', 'eyes'));
const core = require(path.join(APP, 'web', 'talk-core'));

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'personality-test-'));
}

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

describe('brain', () => {
  const p = normalizePersonality(DEFAULT_PERSONALITY);

  it('builds a spoken-style prompt with persona, history and the new message', () => {
    const prompt = buildPrompt({
      personality: p,
      history: [{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'Hello!' }],
      message: 'How are you?',
      now: new Date('2026-11-06T15:00:00'),
    });
    assert.match(prompt, /You are Robo/);
    assert.match(prompt, /warm, curious robot/);
    assert.match(prompt, /User: hi\nRobo: Hello!/);
    assert.match(prompt, /User: How are you\?\nRobo:$/);
    assert.match(prompt, /mood tag/);
    assert.match(prompt, /cannot see right now/);
  });

  it('tells the model about the camera picture and speech recognition', () => {
    const prompt = buildPrompt({ personality: p, message: 'what do you see', viaEars: true, sight: { cameraName: 'Porch', file: 'sight.jpg' } });
    assert.match(prompt, /camera "Porch"/);
    assert.match(prompt, /sight\.jpg/);
    assert.match(prompt, /speech recognition/);
  });

  it('parses the mood tag and strips markdown and emoji from the answer', () => {
    assert.deepStrictEqual(parseReply('[excited] **Hello** there! 🎉'), { mood: 'excited', say: 'Hello there!' });
    assert.deepStrictEqual(parseReply('Robo: [sad] Oh no.', 'Robo'), { mood: 'sad', say: 'Oh no.' });
    assert.deepStrictEqual(parseReply('No tag here'), { mood: 'happy', say: 'No tag here' });
    assert.strictEqual(parseReply('[weird] Hi').mood, 'happy');
    assert.strictEqual(parseReply('- one\n- two\n`code`').say, 'one two code');
    assert.strictEqual(parseReply('See [the docs](http://x) now').say, 'See the docs now');
  });

  it('shortens very long answers at a sentence end', () => {
    const long = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} goes here.`).join(' ');
    const { say } = parseReply(long);
    assert.ok(say.length <= 700);
    assert.ok(say.endsWith('.'));
  });

  it('has a test brain that answers without an agent', () => {
    assert.match(testReply({ personality: p, message: 'hello' }), /^\[excited\] Hello! I am Robo/);
    assert.match(testReply({ personality: p, message: 'what do you see?', sight: null }), /not connected/);
    assert.match(testReply({ personality: p, message: 'what do you see?', sight: { cameraName: 'Desk' } }), /Desk/);
  });
});

describe('store', () => {
  it('starts with Robo and saves changes to each part', () => {
    const dir = tmpDir();
    const store = createStore({ configDir: dir });
    assert.strictEqual(store.active().name, 'Robo');
    store.update({ name: 'Sunny', face: { style: 'buddy' }, voice: { speed: 9 }, eyes: { cameraId: 'cam1' } });
    const again = createStore({ configDir: dir }).active();
    assert.strictEqual(again.name, 'Sunny');
    assert.strictEqual(again.face.style, 'buddy');
    assert.strictEqual(again.face.color, '#00bcd4', 'unchanged parts are kept');
    assert.strictEqual(again.voice.speed, 2, 'speed is clamped');
    assert.strictEqual(again.eyes.cameraId, 'cam1');
  });

  it('creates, switches and removes personalities with their history', () => {
    const store = createStore({ configDir: tmpDir() });
    const max = store.create('Max');
    assert.strictEqual(store.active().id, max.id);
    store.appendHistory(max.id, { role: 'user', text: 'hi' });
    assert.strictEqual(store.history(max.id).length, 1);
    assert.strictEqual(store.history('robo').length, 0);
    store.remove(max.id);
    assert.strictEqual(store.active().id, 'robo');
    assert.throws(() => store.remove('robo'), /at least one/);
  });

  it('rejects unknown face styles and bad colors', () => {
    const p = normalizePersonality({ face: { style: 'alien', color: 'red' } });
    assert.strictEqual(p.face.style, 'robot');
    assert.strictEqual(p.face.color, '#00bcd4');
  });
});

describe('talk core', () => {
  const RATE = core.SAMPLE_RATE;
  function chunk(level, ms = 64) {
    const n = Math.round((RATE * ms) / 1000);
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = level * Math.sin(i / 3);
    return a;
  }

  it('finds an utterance between silences and reports live partials', () => {
    const events = [];
    const d = new core.UtteranceDetector({
      partialMs: 500,
      onStart: () => events.push('start'),
      onPartial: (s) => events.push(`partial:${s.length > 0}`),
      onEnd: (s) => events.push(`end:${Math.round(s.length / RATE * 10) / 10}`),
    });
    for (let i = 0; i < 20; i++) d.push(chunk(0.002)); // quiet room
    for (let i = 0; i < 20; i++) d.push(chunk(0.2)); // ~1.3 s of speech
    for (let i = 0; i < 16; i++) d.push(chunk(0.002)); // ~1 s of silence
    assert.strictEqual(events[0], 'start');
    assert.ok(events.includes('partial:true'), 'partials while speaking');
    const end = events.find((e) => e.startsWith('end:'));
    assert.ok(end, 'utterance ended');
    assert.ok(Number(end.split(':')[1]) >= 1.3, 'includes the whole utterance');
  });

  it('ignores a short click', () => {
    let ended = false;
    const d = new core.UtteranceDetector({ onEnd: () => { ended = true; } });
    for (let i = 0; i < 10; i++) d.push(chunk(0.002));
    d.push(chunk(0.3, 64));
    for (let i = 0; i < 20; i++) d.push(chunk(0.002));
    assert.strictEqual(ended, false);
  });

  it('resamples to 16 kHz and maps sound to mouth movement', () => {
    assert.strictEqual(core.downsample(new Float32Array(48000), 48000).length, 16000);
    const loud = new core.MouthFollower();
    const quiet = new core.MouthFollower();
    const env = (i) => Math.abs(Math.sin(i / 5));
    const a = [], b = [];
    for (let i = 0; i < 60; i++) { a.push(loud.push(0.4 * env(i))); b.push(quiet.push(0.04 * env(i))); }
    for (const series of [a, b]) {
      assert.ok(Math.max(...series.slice(20)) > 0.9, 'opens fully at any volume');
      assert.ok(Math.min(...series.slice(20)) < 0.1, 'and closes between sounds');
    }
    assert.strictEqual(new core.MouthFollower().push(0.001), 0, 'silence keeps it shut');
    assert.ok(core.mouthFromText('aaa', 0.5, 0) > core.mouthFromText('mmm', 0.5, 0));
    assert.strictEqual(core.mouthFromText('hello', 1.2, 0), 0);
    assert.strictEqual(core.wordsSpoken('one two three four', 0.5), 2);
    assert.strictEqual(core.wordsSpoken('one two', 1), 2);
  });
});

describe('stage server', () => {
  it('serves the face page and live events only with the token', async () => {
    let sight = null;
    const stage = createStageServer({ port: 0, getState: () => ({ name: 'Robo', activity: 'idle' }), getSight: () => sight });
    await stage.start();
    try {
      const base = `http://127.0.0.1:${stage.port}`;
      assert.strictEqual((await get(`${base}/face`)).status, 403);
      const page = await get(stage.localUrl('mode=embed'));
      assert.strictEqual(page.status, 200);
      assert.match(page.body.toString(), /face\.js/);
      assert.strictEqual((await get(`${base}/web/face.js`)).status, 200);
      assert.notStrictEqual((await get(`${base}/web/../main.js`)).status, 200, 'no files outside web/');
      assert.strictEqual((await get(`${base}/sight.jpg?t=${stage.token}`)).status, 404);
      sight = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
      const pic = await get(`${base}/sight.jpg?t=${stage.token}`);
      assert.strictEqual(pic.headers['content-type'], 'image/jpeg');

      // The event stream starts with the full state, then carries broadcasts.
      const events = await new Promise((resolve, reject) => {
        const got = [];
        const req = http.get(`${base}/events?t=${stage.token}`, (res) => {
          res.setEncoding('utf8');
          res.on('data', (d) => {
            for (const m of d.split('\n\n')) if (m.startsWith('data: ')) got.push(JSON.parse(m.slice(6)));
            if (got.length === 1) stage.broadcast('mouth', { v: 0.5 });
            if (got.length >= 2) { req.destroy(); resolve(got); }
          });
        });
        req.on('error', reject);
      });
      assert.deepStrictEqual(events[0], { type: 'state', name: 'Robo', activity: 'idle' });
      assert.deepStrictEqual(events[1], { type: 'mouth', v: 0.5 });
    } finally {
      await stage.stop();
    }
  });

  it('serves a spoken line\'s audio by id', async () => {
    const dir = tmpDir();
    const wav = path.join(dir, 'line.wav');
    fs.writeFileSync(wav, Buffer.alloc(200));
    const stage = createStageServer({ port: 0, getState: () => ({}), getSight: () => null });
    await stage.start();
    try {
      stage.addVoice('abc', wav);
      const res = await get(`http://127.0.0.1:${stage.port}${stage.voiceUrl('abc')}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers['content-type'], 'audio/wav');
    } finally {
      await stage.stop();
    }
  });
});

describe('eyes', () => {
  const requireShared = (rel) => { try { return require(path.join(APP, '..', rel)); } catch { return null; } };

  it('lists Camera Watch cameras and refuses cameras shared from another machine', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'camera-watch'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'camera-watch', 'cameras.json'), JSON.stringify({ version: 1, cameras: [
      { id: 'desk', name: 'Desk webcam', kind: 'device', enabled: true, device: { format: 'v4l2', name: '/dev/video0' } },
      { id: 'far', name: 'Cabin', kind: 'remote', enabled: true, remote: { peerNodeId: 'x', cameraId: 'y', secret: 's' } },
    ] }));
    const eyes = createEyes({ configDir: dir, requireShared });
    assert.ok(eyes.available, 'Camera Watch libraries load from the checkout');
    const cams = eyes.listCameras();
    assert.deepStrictEqual(cams.map((c) => [c.id, c.canOpen]), [['desk', true], ['far', false]]);
    const st = eyes.open('far');
    assert.strictEqual(st.state, 'error');
    assert.match(st.message, /another machine/);
    eyes.close();
  });

  it('opens a camera through the Camera Watch runner and keeps its frames', async () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'camera-watch'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'camera-watch', 'cameras.json'), JSON.stringify({ version: 1, cameras: [
      { id: 'desk', name: 'Desk webcam', kind: 'device', enabled: true, device: { format: 'v4l2', name: '/dev/video0' } },
    ] }));
    // A stand-in ffmpeg that writes one JPEG to the live-view pipe.
    const { EventEmitter } = require('node:events');
    const { PassThrough } = require('node:stream');
    let args = null;
    const spawnFn = (_bin, a) => {
      args = a;
      const proc = new EventEmitter();
      proc.stdout = new PassThrough();
      proc.stderr = new PassThrough();
      proc.stdio = [null, proc.stdout, proc.stderr, new PassThrough()];
      proc.kill = () => proc.emit('exit', 0);
      setTimeout(() => proc.stdout.write(Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9])), 20);
      return proc;
    };
    const eyes = createEyes({ configDir: dir, requireShared, spawnFn });
    const frame = new Promise((resolve) => eyes.on('frame', resolve));
    eyes.open('desk');
    await frame;
    assert.ok(eyes.frame(), 'latest frame kept');
    assert.strictEqual(eyes.cameraName(), 'Desk webcam');
    assert.ok(args.includes('/dev/video0'), 'ffmpeg reads the webcam');
    assert.ok(args.some((x) => /fps=4/.test(x)), 'eyes run at a low frame rate');
    eyes.close();
    assert.strictEqual(eyes.frame(), null);
  });
});
