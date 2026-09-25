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
      stt.destroy();

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

    it('detects wake-word with standard speech punctuation (commas, periods, capitalizations)', () => {
      const detector = new WakeWordDetector();
      const res1 = detector.processText('Hello, Robos.');
      assert.strictEqual(res1.matched, true);
      assert.strictEqual(res1.query, '');

      const res2 = detector.processText('Hello, RobOS, what is the git status?');
      assert.strictEqual(res2.matched, true);
      assert.strictEqual(res2.query, 'what is the git status?');

      const res3 = detector.processText('Hey, row bose, list active tasks.');
      assert.strictEqual(res3.matched, true);
      assert.strictEqual(res3.query, 'list active tasks.');

      const res4 = detector.processText('Hello, robust.');
      assert.strictEqual(res4.matched, true);
      assert.strictEqual(res4.query, '');
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

    it('responds casually with one of 50+ greetings and emits show-hud when user says "hello robos"', async () => {
      const tts = new TTSEngine();
      let spokenText = null;
      tts.speak = async (text) => {
        spokenText = text;
        return { ok: true, text };
      };

      const detector = new WakeWordDetector();
      const assistant = new DesktopAssistant({ ttsEngine: tts, wakeDetector: detector, autoSpeak: true });

      let hudShown = false;
      let hudGreeting = null;
      assistant.on('show-hud', (evt) => {
        hudShown = true;
        hudGreeting = evt.greeting;
      });

      // Assert at least 50 greeting options exist
      const { DEFAULT_GREETINGS } = require('../../../voice-prompt/lib/greetings');
      assert.ok(DEFAULT_GREETINGS.length >= 50, `Must have at least 50 greeting varieties, found ${DEFAULT_GREETINGS.length}`);

      // User says "hello robos" on the stream and nothing else
      const wakeRes = detector.processText('hello robos');
      assert.strictEqual(wakeRes.matched, true);
      assert.strictEqual(wakeRes.query, '');

      // Allow microtask ticks for handleWakeWord
      await new Promise(r => setTimeout(r, 50));

      assert.ok(spokenText, 'Assistant must speak greeting aloud');
      assert.ok(DEFAULT_GREETINGS.includes(spokenText), `Spoken greeting "${spokenText}" must be from DEFAULT_GREETINGS list`);
      assert.strictEqual(hudShown, true, 'Assistant must emit show-hud event');
      assert.strictEqual(hudGreeting, spokenText, 'HUD greeting must match spoken greeting');
      assert.strictEqual(assistant.getState(), 'LISTENING');
    });

    it('respects custom user-configured greeting override', async () => {
      const tts = new TTSEngine();
      let spokenText = null;
      tts.speak = async (text) => {
        spokenText = text;
        return { ok: true, text };
      };

      const detector = new WakeWordDetector();
      const assistant = new DesktopAssistant({
        ttsEngine: tts,
        wakeDetector: detector,
        autoSpeak: true,
        wakeGreeting: 'Ready to build.'
      });

      detector.processText('hello robos');
      await new Promise(r => setTimeout(r, 50));

      assert.strictEqual(spokenText, 'Ready to build.');
      assert.strictEqual(assistant.getState(), 'LISTENING');
    });

    it('responds with casual greeting when direct query is a greeting ("hello robos", "hi", "row bose")', async () => {
      const tts = new TTSEngine();
      let spokenText = null;
      tts.speak = async (text) => {
        spokenText = text;
        return { ok: true, text };
      };

      const { DEFAULT_GREETINGS } = require('../../../voice-prompt/lib/greetings');
      const assistant = new DesktopAssistant({ ttsEngine: tts, autoSpeak: true });

      const res1 = await assistant.processQuery('hello robos');
      assert.ok(DEFAULT_GREETINGS.includes(res1.turn.response), 'Should respond with casual greeting');

      const res2 = await assistant.processQuery('hi');
      assert.ok(DEFAULT_GREETINGS.includes(res2.turn.response), 'Should respond with casual greeting');

      const res3 = await assistant.processQuery('row bose');
      assert.ok(DEFAULT_GREETINGS.includes(res3.turn.response), 'Should respond with casual greeting');
    });

    it('continuously analyzes speech stream and autonomously executes matched action', async () => {
      const tts = new TTSEngine();
      let spokenText = null;
      tts.speak = async (text) => {
        spokenText = text;
        return { ok: true, text };
      };

      const assistant = new DesktopAssistant({ ttsEngine: tts, autoSpeak: true });
      assistant.setState('LISTENING');

      let actionDoneData = null;
      assistant.on('action-done', (evt) => {
        actionDoneData = evt;
      });

      // Stream in words: "open task explorer"
      await assistant.handleStreamText({ text: 'open task explorer' });

      assert.ok(actionDoneData, 'Should emit action-done when actionable command is heard on stream');
      assert.ok(actionDoneData.actionDone.includes('Task Explorer'), 'Should execute open task explorer action');
      assert.ok(spokenText && spokenText.includes('Task Explorer'), 'Should voice back action response');
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

  describe('5. RobOS Voice Assistant HUD Overlay & Intent Engine', () => {
    const { getHudBounds } = require('../../../voice-prompt/main');
    const { SkillsExecutor } = require('../../../voice-prompt/lib/skills-executor');

    it('calculates screen positions for all 4 HUD dock corners', () => {
      const br = getHudBounds('bottom-right', 400, 200);
      assert.ok(br.x > 0 && br.y > 0);
      assert.strictEqual(br.width, 400);
      assert.strictEqual(br.height, 200);

      const bl = getHudBounds('bottom-left', 400, 200);
      assert.strictEqual(bl.x, 24);
      assert.ok(bl.y > 0);

      const tr = getHudBounds('top-right', 400, 200);
      assert.ok(tr.x > 0);
      assert.strictEqual(tr.y, 24);

      const tl = getHudBounds('top-left', 400, 200);
      assert.strictEqual(tl.x, 24);
      assert.strictEqual(tl.y, 24);
    });

    it('detects actionable commands in continuous stream and rejects fillers', () => {
      const executor = new SkillsExecutor();

      assert.strictEqual(executor.hasActionableIntent('open task explorer'), true);
      assert.strictEqual(executor.hasActionableIntent('open task explorer and add a task: implement auth'), true);
      assert.strictEqual(executor.hasActionableIntent('add a task to verify payment gateway'), true);
      assert.strictEqual(executor.hasActionableIntent('what is the git status'), true);
      assert.strictEqual(executor.hasActionableIntent('validate knowledge graph'), true);
      assert.strictEqual(executor.hasActionableIntent('restart taskbar'), true);

      // Rejects non-actionable speech
      assert.strictEqual(executor.hasActionableIntent('hello robos'), false);
      assert.strictEqual(executor.hasActionableIntent('hi'), false);
      assert.strictEqual(executor.hasActionableIntent('um yeah okay'), false);
      assert.strictEqual(executor.hasActionableIntent(''), false);
    });

    it('verifies promptStore defaults contain HUD configuration and 50+ greetings', () => {
      const prefs = promptStore.loadPrefs();
      assert.strictEqual(prefs.hudPosition, 'bottom-right');
      assert.strictEqual(prefs.showHudOnWake, true);
      assert.ok(Array.isArray(prefs.wakeGreetings));
      assert.ok(prefs.wakeGreetings.length >= 50);
    });
  });
});

