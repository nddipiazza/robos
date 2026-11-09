'use strict';

// Talks to a personality in the real app: types a message, gets an answer in
// the conversation, and checks what every face display is sent (thinking,
// speaking, a moving mouth, captions word by word), then what the ears hear
// and what the eyes see. The stand-in model (PERSONALITY_TEST_BRAIN=1) answers,
// so no agent CLI is needed.

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, httpGet } = (() => {
  const s = require('../../lib/snapshot');
  const get = (url) => new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
  return { evalJS: s.evalJS, httpGet: get };
})();

const OUT = path.join(__dirname, '..', '..', 'run', 'personality-e2e');

async function waitFor(fn, timeoutMs = 15000, what = 'condition') {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    try {
      last = await fn();
      if (last) return last;
    } catch (err) { last = err.message; }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for ${what} (last: ${JSON.stringify(last)})`);
}

/** Collects what the stage sends to face displays. */
function listen(faceUrl) {
  const u = new URL(faceUrl);
  const events = [];
  const req = http.get(`${u.origin}/events?t=${u.searchParams.get('t')}`, (res) => {
    let buf = '';
    res.setEncoding('utf8');
    res.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const msg = buf.slice(0, i);
        buf = buf.slice(i + 2);
        for (const line of msg.split('\n')) if (line.startsWith('data: ')) events.push(JSON.parse(line.slice(6)));
      }
    });
  });
  req.on('error', () => {});
  return { events, close: () => req.destroy() };
}

async function screenshot(port, name) {
  fs.mkdirSync(OUT, { recursive: true });
  const res = await httpGet(`http://127.0.0.1:${port}/screenshot`);
  if (res.status === 200) fs.writeFileSync(path.join(OUT, name), res.body);
}

describe('RobOS Personality', () => {
  it('talks back, moves its mouth, captions, hears and sees', async () => {
    const app = await launchApp('personality', {
      name: 'personality-e2e',
      env: { ROBOS_TEST: '1', PERSONALITY_TEST_BRAIN: '1', PERSONALITY_STAGE_PORT: '0' },
    });
    let stream;
    try {
      const port = app.port;
      await waitFor(() => evalJS(port, `document.querySelector('#personality-select option') ? true : false`), 15000, 'app to load');
      const state = await evalJS(port, `window.personality.getState()`);
      assert.strictEqual(state.active.name, 'Robo');
      assert.ok(state.faceUrl.startsWith('http://127.0.0.1:'), 'face display is served');
      assert.strictEqual(state.testBrain, true);

      // The face page loads in the app window.
      const page = await httpGet(state.faceUrl);
      assert.strictEqual(page.status, 200);
      stream = listen(state.faceUrl);
      await waitFor(() => stream.events.find((e) => e.type === 'state'), 5000, 'face state');
      assert.strictEqual(stream.events.find((e) => e.type === 'state').name, 'Robo');

      // Type a message and send it.
      await evalJS(port, `(() => { document.getElementById('message').value = 'Hello Robo'; document.getElementById('send').click(); return true; })()`);
      const transcript = await waitFor(async () => {
        const s = await evalJS(port, `window.__personalityApp()`);
        return s.transcript.length >= 2 ? s.transcript : null;
      }, 15000, 'an answer in the conversation');
      assert.deepStrictEqual(transcript[0], { role: 'user', text: 'Hello Robo' });
      assert.strictEqual(transcript[1].role, 'assistant');
      assert.match(transcript[1].text, /^Hello! I am Robo/);

      // Every face display followed along: thinking, then speaking with a moving mouth and captions.
      await waitFor(() => stream.events.some((e) => e.type === 'caption' && e.done), 20000, 'the line to finish');
      const activities = stream.events.filter((e) => e.type === 'activity').map((e) => e.activity);
      assert.ok(activities.includes('thinking'), 'shows it is thinking');
      assert.ok(activities.includes('speaking'), 'shows it is speaking');
      assert.strictEqual(activities[activities.length - 1], 'idle', 'rests after speaking');
      const mouth = stream.events.filter((e) => e.type === 'mouth').map((e) => e.v);
      assert.ok(mouth.length > 10, 'mouth updates stream to the face');
      assert.ok(Math.max(...mouth) > 0.5, 'mouth opens wide on vowels');
      assert.ok(mouth.some((v) => v < 0.2), 'and closes between sounds');
      const captions = stream.events.filter((e) => e.type === 'caption');
      assert.ok(captions.some((c) => c.words > 0 && c.words < c.text.split(' ').length), 'captions advance word by word');
      assert.match(captions[captions.length - 1].text, /Hello! I am Robo/);
      assert.ok(stream.events.some((e) => e.type === 'mood' && e.mood === 'excited'), 'the answer mood reaches the face');
      await screenshot(port, '01-talked.png');

      // Ears: words show on the face as they are heard, and a finished sentence is answered.
      stream.events.length = 0;
      await evalJS(port, `window.personality.testHeard({ text: 'what do', final: false })`);
      await evalJS(port, `window.personality.testHeard({ text: 'what do you see', final: true })`);
      await waitFor(() => stream.events.some((e) => e.type === 'caption' && e.done), 20000, 'the answer to what it heard');
      const heard = stream.events.filter((e) => e.type === 'heard');
      assert.deepStrictEqual(heard.map((h) => [h.text, h.final]), [['what do', false], ['what do you see', true]]);
      const afterHeard = await evalJS(port, `window.__personalityApp().transcript`);
      assert.match(afterHeard[afterHeard.length - 1].text, /eyes are not connected/);

      // Eyes: a picture shows on the face as picture-in-picture and the model is told it can see.
      stream.events.length = 0;
      const jpg = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'docs', 'assets', 'images', 'agent-dispatch-pipeline.jpg'));
      await evalJS(port, `window.personality.testSight({ jpgBase64: ${JSON.stringify(jpg.toString('base64'))}, cameraName: 'Desk camera' })`);
      const sight = await waitFor(() => stream.events.find((e) => e.type === 'sight' && e.at), 5000, 'sight on the face');
      assert.strictEqual(sight.cameraName, 'Desk camera');
      const u = new URL(state.faceUrl);
      const pic = await httpGet(`${u.origin}/sight.jpg?t=${u.searchParams.get('t')}`);
      assert.strictEqual(pic.status, 200);
      assert.ok(pic.body.equals(jpg), 'the face shows the picture the eyes see');
      await waitFor(() => evalJS(port, `!document.getElementById('eyes-preview').classList.contains('hidden')`), 5000, 'eyes preview in the Eyes card');
      await evalJS(port, `(() => { document.getElementById('message').value = 'What do you see?'; document.getElementById('send').click(); return true; })()`);
      const sawTurn = await waitFor(async () => {
        const t = await evalJS(port, `window.__personalityApp().transcript`);
        const last = t[t.length - 1];
        return last.role === 'assistant' && /Desk camera/.test(last.text) ? last : null;
      }, 15000, 'an answer about what it sees');
      assert.match(sawTurn.text, /looking through Desk camera/);
      assert.match(await evalJS(port, `document.querySelector('#transcript .turn:last-child .who').textContent`), /looked/);

      // Changing the face reaches the displays.
      stream.events.length = 0;
      await evalJS(port, `(() => { const s = document.getElementById('face-style'); s.value = 'buddy'; s.dispatchEvent(new Event('change')); return true; })()`);
      const restyled = await waitFor(() => stream.events.find((e) => e.type === 'state' && e.face.style === 'buddy'), 5000, 'new face style');
      assert.strictEqual(restyled.face.style, 'buddy');
      await new Promise((r) => setTimeout(r, 600));
      await screenshot(port, '02-buddy-face.png');

      // The face opens in its own desktop window too.
      await evalJS(port, `document.getElementById('face-window').click()`);
      await waitFor(async () => (await evalJS(port, `window.personality.getState()`)).faceWindowOpen, 5000, 'the face window');
      assert.strictEqual(await evalJS(port, `document.getElementById('face-window').textContent`), 'Close window');
      await evalJS(port, `document.getElementById('face-window').click()`);
      await waitFor(async () => !(await evalJS(port, `window.personality.getState()`)).faceWindowOpen, 5000, 'the face window to close');

      // The conversation is kept for next time.
      const saved = JSON.parse(fs.readFileSync(path.join(app.sandboxHome, '.config', 'robos', 'personality', 'history', 'robo.json'), 'utf8'));
      assert.ok(saved.length >= 6, 'history saved');
      assert.ok(saved.some((t) => t.viaEars), 'heard turns are marked');
    } finally {
      stream?.close();
      await killApp(app);
    }
  });

  it('moves the mouth with the loudness of the voice audio', async () => {
    // A voice-like test recording: a tone whose loudness rises and falls 3 times a second.
    fs.mkdirSync(OUT, { recursive: true });
    const wav = path.join(OUT, 'test-voice.wav');
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'aevalsrc=0.6*sin(2*PI*220*t)*abs(sin(2*PI*3*t)):s=24000:d=2.5', wav]);
    const app = await launchApp('personality', {
      name: 'personality-voice',
      env: { ROBOS_TEST: '1', PERSONALITY_TEST_BRAIN: '1', PERSONALITY_STAGE_PORT: '0', PERSONALITY_TEST_VOICE_WAV: wav },
    });
    let stream;
    try {
      const port = app.port;
      await waitFor(() => evalJS(port, `document.querySelector('#personality-select option') ? true : false`), 15000, 'app to load');
      const state = await evalJS(port, `window.personality.getState()`);
      stream = listen(state.faceUrl);
      await waitFor(() => stream.events.find((e) => e.type === 'state'), 5000, 'face state');
      await evalJS(port, `document.getElementById('voice-test').click()`);
      const started = Date.now();
      await waitFor(() => stream.events.some((e) => e.type === 'caption' && e.done), 15000, 'the test line to finish');
      const took = Date.now() - started;
      assert.ok(took >= 2000, `the line lasts as long as its audio (${took} ms)`);
      const mouth = stream.events.filter((e) => e.type === 'mouth').map((e) => e.v);
      assert.ok(mouth.length > 30, 'mouth follows the audio');
      assert.ok(Math.max(...mouth) > 0.8, 'opens on the loud parts');
      // Count open-close cycles: the loudness rises and falls ~7 times in 2.5 s.
      let cycles = 0;
      let open = false;
      for (const v of mouth) {
        if (!open && v > 0.6) { open = true; cycles++; }
        if (open && v < 0.2) open = false;
      }
      assert.ok(cycles >= 4, `mouth opens and closes with the sound (${cycles} times)`);
      assert.match(await evalJS(port, `document.getElementById('voice-status').textContent`), /test-voice/);
    } finally {
      stream?.close();
      await killApp(app);
    }
  });
});
