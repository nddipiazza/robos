'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { STTEngine } = require('../../../voice-prompt/lib/stt-engine');
const { TTSEngine } = require('../../../voice-prompt/lib/tts-engine');
const { WakeWordDetector } = require('../../../voice-prompt/lib/wake-word');
const { DesktopAssistant } = require('../../../voice-prompt/lib/desktop-assistant');
const promptStore = require('../../../voice-prompt/lib/prompt-store');
const { RobOSVoiceClient } = require('../../../robos-lib/voice');

describe('RobOS Voice Background Stream, Wake-Word & Desktop Assistant Tests', () => {
  let tmpDir;
  let testPromptsFile;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-voice-stream-test-'));
    testPromptsFile = path.join(tmpDir, 'test-prompts.json');
  });

  after(() => {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
  });

  describe('1. Background Stream Topic Mode (Ephemeral Pub/Sub)', () => {
    it('emits stream chunks and does NOT persist to prompt store by default', async () => {
      const stt = new STTEngine();
      let streamChunkReceived = false;

      stt.on('stream-text', (data) => {
        if (data.text === 'Live speech chunk') {
          streamChunkReceived = true;
        }
      });

      // Activate background mode
      await stt.activate({ backgroundMode: true });
      assert.strictEqual(stt.isBackgroundMode(), true);

      // Simulate incoming chunk on topic
      stt.simulateStreamChunk('Live speech chunk', false);
      assert.strictEqual(streamChunkReceived, true);

      // Deactivate in background mode
      const deactResult = await stt.deactivate();
      assert.strictEqual(deactResult.backgroundMode, true);

      // Verify promptStore was NOT modified
      const prompts = promptStore.loadPrompts(testPromptsFile);
      assert.strictEqual(prompts.length, 0, 'No prompts should be persisted in background stream mode');
    });
  });

  describe('2. Wake-Word Detection ("hello robos", "rob OS", "row bose")', () => {
    it('detects "hello robos" and extracts trailing query', () => {
      const detector = new WakeWordDetector();
      let wakeTriggered = false;
      let capturedQuery = null;

      detector.on('wake-word', (evt) => {
        wakeTriggered = true;
        capturedQuery = evt.query;
      });

      const res = detector.processText('Hello RobOS, what is the git status?');
      assert.strictEqual(res.matched, true);
      assert.strictEqual(wakeTriggered, true);
      assert.strictEqual(capturedQuery, 'what is the git status?');
    });

    it('detects "rob OS" variant', () => {
      const detector = new WakeWordDetector();
      const res = detector.processText('Hey rob OS how are you?');
      assert.strictEqual(res.matched, true);
      assert.strictEqual(res.query, 'how are you?');
    });

    it('detects "row bose" variant (pronounced like Bose speaker system)', () => {
      const detector = new WakeWordDetector();
      const res1 = detector.processText('hello row bose what is the active window');
      assert.strictEqual(res1.matched, true);
      assert.strictEqual(res1.query, 'what is the active window');

      const res2 = detector.processText('row bose run tests');
      assert.strictEqual(res2.matched, true);
      assert.strictEqual(res2.query, 'run tests');

      const res3 = detector.processText('hi row-bose status report');
      assert.strictEqual(res3.matched, true);
      assert.strictEqual(res3.query, 'status report');
    });

    it('ignores normal conversation without wake word', () => {
      const detector = new WakeWordDetector();
      const res = detector.processText('We should refactor the database connector tomorrow');
      assert.strictEqual(res.matched, false);
    });
  });

  describe('3. RobOS Desktop Assistant', () => {
    it('processes queries with desktop context and speaks response aloud', async () => {
      const tts = new TTSEngine();
      let spokenText = null;

      // Intercept speak call
      tts.speak = async (text) => {
        spokenText = text;
        return { ok: true, text };
      };

      const assistant = new DesktopAssistant({ ttsEngine: tts, autoSpeak: true });

      const result = await assistant.processQuery('What is the git status?');
      assert.ok(result.ok);
      assert.ok(result.turn.response.includes('branch'));
      assert.ok(spokenText, 'Assistant should have spoken the response aloud');
      assert.strictEqual(assistant.getHistory().length, 1);
    });

    it('transitions states through IDLE -> PROCESSING -> SPEAKING -> IDLE', async () => {
      const tts = new TTSEngine();
      tts.speak = async () => ({ ok: true });

      const states = [];
      const assistant = new DesktopAssistant({ ttsEngine: tts });
      assistant.on('state-change', (data) => states.push(data.state));

      await assistant.processQuery('Hello assistant test');
      assert.ok(states.includes('PROCESSING'));
      assert.ok(states.includes('SPEAKING'));
      assert.ok(states.includes('IDLE'));
    });
  });

  describe('4. RobOS Voice Library Wrapper (packages/robos-lib/voice.js)', () => {
    it('speaks text via library client and accesses available voices', async () => {
      const client = new RobOSVoiceClient();
      const voices = await client.getVoices();
      assert.ok(voices.kokoro || voices['edge-tts'], 'Should return voice categories');

      // Speak using library wrapper (runs with silent fallback when daemon is offline)
      const res = await client.speak('Testing RobOS voice library wrapper.', { silent: true });
      assert.ok(res.ok);
    });

    it('queries Desktop Assistant via library wrapper', async () => {
      const client = new RobOSVoiceClient();
      const res = await client.askAssistant('What is the git status?', { silent: true });
      assert.ok(res.ok);
      assert.ok(res.turn);
      assert.ok(res.turn.response);
    });
  });
});
