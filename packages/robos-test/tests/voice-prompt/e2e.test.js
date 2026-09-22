'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, getSnapshot } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Voice Prompt Agent E2E Test Suite', () => {
  it('launches Voice Prompt app, validates UI rendering, device selection, activation, and dictation with context metadata', async () => {
    const app = await launchApp('voice-prompt', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'Voice Prompt debug port should be allocated');

      // 1. Verify basic DOM elements rendered
      const title = await evalJS(app.port, 'document.querySelector(".title-group h1")?.textContent');
      assert.strictEqual(title, 'RobOS Voice Prompt Agent');

      const statusText = await evalJS(app.port, 'document.getElementById("status-text")?.textContent');
      assert.strictEqual(statusText, 'STANDBY');

      const selectDeviceOptions = await evalJS(app.port, 'document.getElementById("select-device")?.options?.length');
      assert.ok(selectDeviceOptions >= 1, 'Microphone device selector should have at least 1 option');

      // 2. Verify active app context elements are loaded
      const activeAppBadge = await evalJS(app.port, 'document.getElementById("ctx-active-app")?.textContent');
      assert.ok(activeAppBadge && activeAppBadge.length > 0, 'Active app badge should be populated');

      // 3. Test activation toggle via mic button
      await evalJS(app.port, 'document.getElementById("btn-toggle-mic").click()');
      await new Promise(r => setTimeout(r, 200));

      const recordingStatus = await evalJS(app.port, 'document.getElementById("status-text")?.textContent');
      assert.strictEqual(recordingStatus, 'LISTENING ● REC');

      const isWaveformVisible = await evalJS(app.port, '!document.getElementById("recording-waveform").classList.contains("hidden")');
      assert.strictEqual(isWaveformVisible, true);

      // 4. Test speech-to-text dictation and context metadata attachment
      const testPromptText = 'Investigate high memory usage in kubernetes cluster pods';
      await evalJS(app.port, `
        (async () => {
          document.getElementById("dictation-input").value = "${testPromptText}";
          await document.getElementById("btn-save-dictation").click();
        })()
      `);
      await new Promise(r => setTimeout(r, 400));

      // 5. Verify the prompt appears in history with context metadata
      const count = await evalJS(app.port, 'document.getElementById("prompts-count")?.textContent');
      assert.ok(parseInt(count, 10) >= 1, 'Prompts count should be at least 1');

      const renderedText = await evalJS(app.port, 'document.querySelector(".prompt-item .prompt-text")?.textContent');
      assert.strictEqual(renderedText, testPromptText);

      const hasContextTag = await evalJS(app.port, '!!document.querySelector(".prompt-item .prompt-context-tag")');
      assert.strictEqual(hasContextTag, true, 'Prompt item should display active app context tag');

      // 6. Test expanding metadata JSON viewer
      await evalJS(app.port, 'document.querySelector(".btn-meta-toggle")?.click()');
      const isJsonVisible = await evalJS(app.port, '!document.querySelector(".prompt-json-view").classList.contains("hidden")');
      assert.strictEqual(isJsonVisible, true, 'Metadata JSON view should expand');

      const jsonText = await evalJS(app.port, 'document.querySelector(".prompt-json-view")?.textContent');
      assert.ok(jsonText.includes('activeApp'), 'JSON metadata should include activeApp');
      assert.ok(jsonText.includes('workspace'), 'JSON metadata should include workspace');

      // 7. Deactivate microphone
      await evalJS(app.port, 'document.getElementById("btn-toggle-mic").click()');
      await new Promise(r => setTimeout(r, 200));
      const finalStatus = await evalJS(app.port, 'document.getElementById("status-text")?.textContent');
      assert.strictEqual(finalStatus, 'STANDBY');

    } finally {
      await killApp(app);
    }
  });
});
