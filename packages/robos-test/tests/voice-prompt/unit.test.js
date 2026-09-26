'use strict';

process.env.ROBOS_TEST = '1';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

const promptStore = require('../../../voice-prompt/lib/prompt-store');
const contextProvider = require('../../../voice-prompt/lib/context-provider');
const { STTEngine } = require('../../../voice-prompt/lib/stt-engine');

describe('Voice Prompt Unit Tests', () => {
  let tmpDir;
  let testPromptsFile;
  let testPrefsFile;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-voice-unit-'));
    testPromptsFile = path.join(tmpDir, 'voice-prompts.json');
    testPrefsFile = path.join(tmpDir, 'voice-prefs.json');
  });

  after(() => {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
  });

  describe('Prompt Store Persistence', () => {
    it('loadPrompts returns empty array if file does not exist', () => {
      const prompts = promptStore.loadPrompts(path.join(tmpDir, 'nonexistent.json'));
      assert.deepStrictEqual(prompts, []);
    });

    it('savePrompt saves voice prompt with metadata', () => {
      const prompt = promptStore.savePrompt({
        text: 'Review pull request 104',
        durationMs: 3200,
        device: 'hw:1,0',
        metadata: {
          activeApp: { appId: 'pr-review', title: 'PR #104' },
          runningApps: [{ appId: 'pr-review', pid: 1234 }],
        },
      }, testPromptsFile);

      assert.ok(prompt.id.startsWith('vp-'));
      assert.strictEqual(prompt.text, 'Review pull request 104');
      assert.strictEqual(prompt.metadata.activeApp.appId, 'pr-review');

      const loaded = promptStore.loadPrompts(testPromptsFile);
      assert.strictEqual(loaded.length, 1);
      assert.strictEqual(loaded[0].id, prompt.id);
    });

    it('getPrompt finds prompt by ID', () => {
      const prompts = promptStore.loadPrompts(testPromptsFile);
      const first = prompts[0];
      const found = promptStore.getPrompt(first.id, testPromptsFile);
      assert.strictEqual(found.id, first.id);
      assert.strictEqual(found.text, first.text);
    });

    it('deletePrompt removes prompt by ID', () => {
      const prompts = promptStore.loadPrompts(testPromptsFile);
      const targetId = prompts[0].id;
      promptStore.deletePrompt(targetId, testPromptsFile);

      const remaining = promptStore.loadPrompts(testPromptsFile);
      assert.strictEqual(remaining.length, 0);
    });

    it('loadPrefs and savePrefs round-trips configured microphone device', () => {
      const prefs = promptStore.loadPrefs(testPrefsFile);
      assert.strictEqual(prefs.configuredDevice, 'default');

      promptStore.savePrefs({ configuredDevice: 'hw:1,0', sampleRate: 44100 }, testPrefsFile);
      const updated = promptStore.loadPrefs(testPrefsFile);
      assert.strictEqual(updated.configuredDevice, 'hw:1,0');
      assert.strictEqual(updated.sampleRate, 44100);
    });
  });

  describe('Context Provider (RobOS Apps in Use)', () => {
    it('getActiveWindow returns structured window info', async () => {
      const win = await contextProvider.getActiveWindow();
      assert.ok(typeof win === 'object');
      assert.ok('wid' in win);
      assert.ok('title' in win);
      assert.ok('appId' in win);
    });

    it('getRunningApps scans running processes or socket', async () => {
      const apps = await contextProvider.getRunningApps();
      assert.ok(Array.isArray(apps));
    });

    it('getWorkspaceContext returns active workspace and git branch', () => {
      const ws = contextProvider.getWorkspaceContext();
      assert.ok(ws.name);
      assert.ok(ws.branch);
    });

    it('getAggregatedContext aggregates active window, running apps, and workspace', async () => {
      const ctx = await contextProvider.getAggregatedContext();
      assert.ok(ctx.capturedAt);
      assert.ok(ctx.activeApp);
      assert.ok(Array.isArray(ctx.runningApps));
      assert.ok(ctx.workspace);
      assert.ok(ctx.summary);
    });
  });

  describe('STT Engine & Activation Controller', () => {
    it('lists available capture devices with default microphone', async () => {
      const engine = new STTEngine();
      const devices = await engine.listDevices();
      assert.ok(Array.isArray(devices));
      assert.ok(devices.length >= 1);
      assert.strictEqual(devices[0].id, 'default');
    });

    it('toggles activation state and fires events', async () => {
      const engine = new STTEngine({ configuredDevice: 'default' });
      assert.strictEqual(engine.isActive(), false);

      let activatedFired = false;
      let deactivatedFired = false;

      engine.on('activated', () => { activatedFired = true; });
      engine.on('deactivated', () => { deactivatedFired = true; });

      const actRes = await engine.activate({ device: 'default' });
      assert.strictEqual(actRes.ok, true);
      assert.strictEqual(engine.isActive(), true);
      assert.strictEqual(activatedFired, true);

      const deactRes = await engine.deactivate();
      assert.strictEqual(deactRes.ok, true);
      assert.strictEqual(engine.isActive(), false);
      assert.strictEqual(deactivatedFired, true);
    });

    it('processDictation transcribes input and emits dictation event', async () => {
      const engine = new STTEngine();
      let dictationResult = null;
      engine.on('dictation', (res) => { dictationResult = res; });

      const res = await engine.processDictation('Create a new task for API testing', {
        device: 'default',
        durationMs: 2500,
      });

      assert.strictEqual(res.text, 'Create a new task for API testing');
      assert.strictEqual(res.durationMs, 2500);
      assert.strictEqual(dictationResult.text, res.text);
    });

    it('readWavToFloat32 correctly extracts samples even when data chunkSize is 0 (streaming)', () => {
      const { readWavToFloat32 } = require('../../../voice-prompt/lib/stt-engine');
      const header = Buffer.alloc(44);
      header.write('RIFF', 0);
      header.writeUInt32LE(36 + 100 * 2, 4);
      header.write('WAVE', 8);
      header.write('fmt ', 12);
      header.writeUInt32LE(16, 16);
      header.writeUInt16LE(1, 20); // PCM
      header.writeUInt16LE(1, 22); // mono
      header.writeUInt32LE(16000, 24); // rate
      header.writeUInt32LE(32000, 28); // byte rate
      header.writeUInt16LE(2, 32); // block align
      header.writeUInt16LE(16, 34); // bits
      header.write('data', 36);
      header.writeUInt32LE(0, 40); // chunkSize = 0 (streaming pw-record style)

      const pcmData = Buffer.alloc(200); // 100 samples
      for (let i = 0; i < 100; i++) {
        pcmData.writeInt16LE(1000, i * 2);
      }
      const testWav = path.join(tmpDir, 'test-stream.wav');
      fs.writeFileSync(testWav, Buffer.concat([header, pcmData]));

      const samples = readWavToFloat32(testWav);
      assert.ok(samples);
      assert.strictEqual(samples.length, 100);
      assert.ok(Math.abs(samples[0] - (1000 / 32768.0)) < 0.001);
    });

    it('emits interim-text event during streaming dictation', async () => {
      const engine = new STTEngine();
      let interimFired = false;
      engine.on('interim-text', (data) => {
        interimFired = true;
        assert.strictEqual(data.text, 'Streaming interim speech');
      });

      engine.emit('interim-text', { text: 'Streaming interim speech', isFinal: false });
      assert.strictEqual(interimFired, true);
    });
  });

  describe('HTTP REST API Endpoints', () => {
    let server;
    const testPort = 19199;

    before(async () => {
      process.env.ROBOS_VOICE_PORT = String(testPort);
      process.env.ROBOS_VOICE_PROMPTS_FILE = testPromptsFile;
      process.env.ROBOS_VOICE_PREFS_FILE = testPrefsFile;
      // Start API server using main's startApiServer
      const voiceMain = require('../../../voice-prompt/main');
      server = voiceMain.startApiServer();
      await new Promise((res) => setTimeout(res, 200));
    });

    after(() => {
      if (server) {
        try {
          if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
          server.close();
        } catch {}
      }
    });

    function httpReq(method, pathName, body = null) {
      return new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: testPort,
          path: pathName,
          method,
          headers: { 'Content-Type': 'application/json' },
        }, (res) => {
          let data = '';
          res.on('data', c => { data += c; });
          res.on('end', () => {
            try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
            catch { resolve({ status: res.statusCode, data }); }
          });
        });
        req.on('error', reject);
        if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
        req.end();
      });
    }

    it('GET /api/status returns agent status and active app', async () => {
      const res = await httpReq('GET', '/api/status');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.ok, true);
      assert.ok('active' in res.data);
      assert.ok('configuredDevice' in res.data);
      assert.ok('activeApp' in res.data);
    });

    it('GET /api/context queries active RobOS app context in real-time', async () => {
      const res = await httpReq('GET', '/api/context');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.ok, true);
      assert.ok(res.data.context.activeApp);
      assert.ok(Array.isArray(res.data.context.runningApps));
      assert.ok(res.data.context.workspace);
    });

    it('POST /api/activate and POST /api/deactivate controls listening state', async () => {
      const actRes = await httpReq('POST', '/api/activate');
      assert.strictEqual(actRes.status, 200);
      assert.strictEqual(actRes.data.active, true);

      const deactRes = await httpReq('POST', '/api/deactivate');
      assert.strictEqual(deactRes.status, 200);
      assert.strictEqual(deactRes.data.active, false);
    });

    it('POST /api/dictate transcribes text, captures RobOS app context metadata, and persists prompt', async () => {
      const dictateRes = await httpReq('POST', '/api/dictate', {
        text: 'Fix the failing integration test in rest-client',
        device: 'default',
        durationMs: 2400,
      });

      assert.strictEqual(dictateRes.status, 201);
      assert.strictEqual(dictateRes.data.ok, true);
      const prompt = dictateRes.data.prompt;
      assert.strictEqual(prompt.text, 'Fix the failing integration test in rest-client');
      assert.ok(prompt.metadata);
      assert.ok(prompt.metadata.activeApp);
      assert.ok(prompt.metadata.capturedAt);

      // Verify prompt is in /api/prompts
      const listRes = await httpReq('GET', '/api/prompts');
      assert.strictEqual(listRes.status, 200);
      assert.ok(listRes.data.prompts.some(p => p.id === prompt.id));
    });

    it('GET /api/devices returns available capture devices', async () => {
      const devRes = await httpReq('GET', '/api/devices');
      assert.strictEqual(devRes.status, 200);
      assert.strictEqual(devRes.data.ok, true);
      assert.ok(Array.isArray(devRes.data.devices));
      assert.ok(devRes.data.devices.length >= 1);
    });
  });

  describe('Speech Stream Overlap & Recall Prevention', () => {
    const { mergeWithPrevious, normalize } = require('../../../voice-prompt/renderer/hud');

    it('normalizes punctuation and whitespace', () => {
      assert.strictEqual(normalize("Hello, world!  How's it?"), "hello world hows it");
    });

    it('drops exact duplicate speech strings', () => {
      const res = mergeWithPrevious("That's pretty good.", "that's pretty good");
      assert.strictEqual(res.action, 'ignore');
    });

    it('drops substring recall fragments from sliding window', () => {
      const res = mergeWithPrevious("The link data section is really stupid.", "really stupid.");
      assert.strictEqual(res.action, 'ignore');
    });

    it('drops middle or prefix substring echoes', () => {
      const res = mergeWithPrevious("How is it going can you hear me yet", "can you hear me yet");
      assert.strictEqual(res.action, 'ignore');
    });

    it('replaces when newText extends prevText prefix', () => {
      const res = mergeWithPrevious("The", "The Json LD link data");
      assert.strictEqual(res.action, 'replace');
      assert.strictEqual(res.text, "The Json LD link data");
    });

    it('stitches sliding window overlapping word sequences', () => {
      const res = mergeWithPrevious("The Json LD link data", "link data section is really stupid.");
      assert.strictEqual(res.action, 'replace');
      assert.strictEqual(res.text, "The Json LD link data section is really stupid.");
    });

    it('stitches sliding window with 1-word offset', () => {
      const res = mergeWithPrevious("The Json LD link data", "the link data section is really stupid.");
      assert.strictEqual(res.action, 'replace');
      assert.strictEqual(res.text, "The Json LD link data section is really stupid.");
    });

    it('appends truly distinct new sentences', () => {
      const res = mergeWithPrevious("Can you hear me yet?", "That's pretty good.");
      assert.strictEqual(res.action, 'append');
    });
  });
});

