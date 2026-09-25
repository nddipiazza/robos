'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { TTSEngine } = require('../../../voice-prompt/lib/tts-engine');

describe('RobOS Voice Outgoing TTS Engine Tests', () => {
  let tts;
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-tts-test-'));
    tts = new TTSEngine();
  });

  after(() => {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
  });

  it('lists natural human voices across engines', async () => {
    const voices = await tts.listVoices();
    assert.ok(voices.kokoro, 'Kokoro voices should be listed');
    assert.ok(voices['edge-tts'], 'Edge-TTS voices should be listed');
    assert.ok(voices.piper, 'Piper voices should be listed');

    assert.ok(voices.kokoro.some(v => v.id === 'af_heart'), 'Kokoro should have af_heart');
    assert.ok(voices['edge-tts'].some(v => v.id.includes('Andrew')), 'Edge-TTS should have Andrew');
  });

  it('manages and updates speech synthesis preferences', () => {
    const initial = tts.getPrefs();
    assert.strictEqual(initial.engine, 'kokoro');

    tts.savePrefs({ engine: 'edge-tts', voice: 'en-US-AndrewMultilingualNeural', speed: 1.15 });
    const updated = tts.getPrefs();
    assert.strictEqual(updated.engine, 'edge-tts');
    assert.strictEqual(updated.voice, 'en-US-AndrewMultilingualNeural');
    assert.strictEqual(updated.speed, 1.15);
  });

  it('synthesizes speech using Kokoro-82M model and generates audio', async () => {
    const res = await tts.synthesize('Hello RobOS!', { engine: 'kokoro', voice: 'af_heart' });
    assert.ok(res.ok, 'Synthesis should succeed');
    assert.ok(res.filePath, 'File path should be returned');
    assert.ok(fs.existsSync(res.filePath), 'Synthesized audio file should exist on disk');
    assert.ok(fs.statSync(res.filePath).size > 1000, 'Audio file should have non-trivial size');
    assert.ok(res.durationMs > 0, 'Duration should be greater than zero');
    try { fs.unlinkSync(res.filePath); } catch {}
  });

  it('synthesizes speech using Edge-TTS and generates audio', async () => {
    const res = await tts.synthesize('Hello RobOS! Edge TTS test.', {
      engine: 'edge-tts',
      voice: 'en-US-AndrewMultilingualNeural',
    });
    assert.ok(res.ok, 'Edge-TTS synthesis should succeed');
    assert.ok(res.filePath, 'MP3 file path should be returned');
    assert.ok(fs.existsSync(res.filePath), 'Synthesized MP3 file should exist');
    assert.ok(fs.statSync(res.filePath).size > 1000, 'MP3 file should have data');
    try { fs.unlinkSync(res.filePath); } catch {}
  });

  it('speaks aloud and dispatches start/end events', async () => {
    let startEmitted = false;
    let endEmitted = false;

    tts.once('speaking-start', () => { startEmitted = true; });
    tts.once('speaking-end', () => { endEmitted = true; });

    const res = await tts.speak('RobOS voice synthesis active.', { silent: true });
    assert.ok(res.ok);
    assert.strictEqual(startEmitted, true);
    assert.strictEqual(endEmitted, true);
  });

  it('stop() halts ongoing playback immediately', () => {
    tts.speak('Long paragraph to test stop mechanism.', { silent: true });
    tts.stop();
    assert.strictEqual(tts.isSpeaking, false);
  });
});
