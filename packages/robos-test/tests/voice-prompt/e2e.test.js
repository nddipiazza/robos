'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const http = require('http');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

function postJson(port, pathName, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: pathName,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve(body); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

describe('RobOS Voice Dictation App E2E Test Suite', () => {
  it('launches RobOS Voice app on bottom-right, validates record toggle, live dictation bubbles with timestamps, copy all, copy message, and clear', { timeout: 60000 }, async () => {
    const app = await launchApp('voice-prompt', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'Voice Prompt debug port should be allocated');

      // 1. Verify header title rendered
      const title = await evalJS(app.port, 'document.querySelector(".hud-title")?.textContent');
      assert.strictEqual(title, 'RobOS Voice');

      // 2. Verify record button and welcome empty state
      const initialRecordLabel = await evalJS(app.port, 'document.getElementById("record-btn-label")?.textContent');
      assert.strictEqual(initialRecordLabel, 'Start Recording');

      const isInitiallyRecording = await evalJS(app.port, 'document.getElementById("btn-toggle-record")?.classList.contains("recording")');
      assert.strictEqual(isInitiallyRecording, false);

      const hasCopyAllBtn = await evalJS(app.port, '!!document.getElementById("btn-copy-all")');
      assert.strictEqual(hasCopyAllBtn, true);

      const isWelcomeVisible = await evalJS(app.port, '!document.getElementById("chat-welcome")?.classList.contains("hidden")');
      assert.strictEqual(isWelcomeVisible, true);

      // 3. Test activation toggle via record button
      await evalJS(app.port, 'document.getElementById("btn-toggle-record").click()');
      await new Promise(r => setTimeout(r, 200));

      const activeRecordLabel = await evalJS(app.port, 'document.getElementById("record-btn-label")?.textContent');
      assert.strictEqual(activeRecordLabel, 'Stop Recording');

      const isNowRecording = await evalJS(app.port, 'document.getElementById("btn-toggle-record")?.classList.contains("recording")');
      assert.strictEqual(isNowRecording, true);

      // 4. Simulate streaming incoming speech chunk
      const testChunk1 = 'Investigate high memory usage in kubernetes cluster pods';
      await postJson(app.port, '/api/stream/simulate', { text: testChunk1, isFinal: true });
      await new Promise(r => setTimeout(r, 300));

      // 5. Verify the dictation bubble appears with timestamp and copy button
      const bubbleCount = await evalJS(app.port, 'document.querySelectorAll(".dictation-bubble:not(.interim)").length');
      assert.strictEqual(bubbleCount, 1, 'Should have 1 finalized dictation bubble');

      const bubbleText = await evalJS(app.port, 'document.querySelector(".dictation-bubble .bubble-text")?.textContent');
      assert.strictEqual(bubbleText, testChunk1);

      const hasTime = await evalJS(app.port, '!!document.querySelector(".dictation-bubble .bubble-time")?.textContent');
      assert.strictEqual(hasTime, true, 'Bubble should display timestamp');

      const hasCopyMsgBtn = await evalJS(app.port, '!!document.querySelector(".dictation-bubble .btn-copy-msg")');
      assert.strictEqual(hasCopyMsgBtn, true, 'Bubble should have individual copy button');

      // 6. Test copying single message
      await evalJS(app.port, 'document.querySelector(".dictation-bubble .btn-copy-msg").click()');
      await new Promise(r => setTimeout(r, 100));
      const copyMsgLabel = await evalJS(app.port, 'document.querySelector(".dictation-bubble .copy-label")?.textContent');
      assert.strictEqual(copyMsgLabel, 'Copied!');

      // 7. Stream second message
      const testChunk2 = 'Deploying latest auth fix to staging';
      await postJson(app.port, '/api/stream/simulate', { text: testChunk2, isFinal: true });
      await new Promise(r => setTimeout(r, 300));

      const bubbleCount2 = await evalJS(app.port, 'document.querySelectorAll(".dictation-bubble:not(.interim)").length');
      assert.strictEqual(bubbleCount2, 2, 'Should have 2 finalized dictation bubbles');

      // 8. Test Copy All
      await evalJS(app.port, 'document.getElementById("btn-copy-all").click()');
      await new Promise(r => setTimeout(r, 100));
      const copyAllLabel = await evalJS(app.port, 'document.getElementById("copy-all-label")?.textContent');
      assert.strictEqual(copyAllLabel, 'Copied All!');

      // 9. Clear messages
      await evalJS(app.port, 'document.getElementById("btn-clear-chat").click()');
      await new Promise(r => setTimeout(r, 100));
      const clearedCount = await evalJS(app.port, 'document.querySelectorAll(".dictation-bubble").length');
      assert.strictEqual(clearedCount, 0, 'Dictation bubbles should be cleared');

      const isWelcomeBack = await evalJS(app.port, '!document.getElementById("chat-welcome")?.classList.contains("hidden")');
      assert.strictEqual(isWelcomeBack, true, 'Welcome placeholder should be restored');

      // 10. Deactivate recording
      await evalJS(app.port, 'document.getElementById("btn-toggle-record").click()');
      await new Promise(r => setTimeout(r, 200));

      const finalRecordLabel = await evalJS(app.port, 'document.getElementById("record-btn-label")?.textContent');
      assert.strictEqual(finalRecordLabel, 'Start Recording');
      const isFinallyRecording = await evalJS(app.port, 'document.getElementById("btn-toggle-record")?.classList.contains("recording")');
      assert.strictEqual(isFinallyRecording, false);

    } finally {
      await killApp(app);
    }
  });
});
