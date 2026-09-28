'use strict';
// Real Electron UI + IPC + device enumeration; isolated preferences, no microphone capture.
// Run with NODE_PATH pointing to playwright-core if robos-test dependencies are not installed.
const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const output = process.env.ROBOS_PROOF_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'robos-voice-settings-proof-'));
const config = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-voice-settings-config-'));
fs.mkdirSync(output, { recursive: true });
const cues = [];
async function step(page, selector, text, action) {
  const start = Date.now();
  await page.locator(selector).waitFor({ state: 'visible' });
  await page.locator(selector).evaluate((el, text) => {
    el.style.outline = '2px solid #00bcd4';
    const note = document.createElement('div');
    note.id = 'demo-cue'; note.textContent = text;
    Object.assign(note.style, { position: 'fixed', bottom: '12px', right: '12px', maxWidth: '360px', padding: '12px', background: '#161b22', color: '#f0f6fc', border: '1px solid #00bcd4', zIndex: '9999', pointerEvents: 'none' });
    document.body.append(note);
  }, text);
  if (action) await action();
  await page.waitForTimeout(1600);
  await page.evaluate(() => document.getElementById('demo-cue')?.remove());
  await page.locator(selector).evaluate(el => el.style.outline = '');
  cues.push({ start, end: Date.now(), text });
}
(async () => {
  const app = await electron.launch({
    executablePath: process.env.ROBOS_ELECTRON || path.join(root, 'packages/voice-prompt/node_modules/electron/dist/electron'),
    args: [path.join(root, 'packages/voice-prompt'), '--no-sandbox', '--disable-gpu', `--user-data-dir=${config}/electron`],
    env: { ...process.env, ROBOS_CONFIG_DIR: config, ROBOS_VOICE_PORT: '19289' },
    recordVideo: { dir: output, size: { width: 960, height: 720 } },
  });
  try {
    const hud = await app.firstWindow();
    const settingsOpened = app.waitForEvent('window');
    await step(hud, '#btn-voice-commands', 'Open RobOS Voice settings from the gear.', async () => {
      assert.equal(await hud.locator('#btn-voice-commands').getAttribute('aria-label'), 'RobOS Voice settings');
      await hud.locator('#btn-voice-commands').click();
    });
    const settings = await settingsOpened;
    const page = settings || app.windows().find(p => p !== hud);
    assert(page);
    await page.locator('#select-settings-device:not([disabled])').waitFor();
    const options = await page.locator('#select-settings-device option').evaluateAll(es => es.map(e => e.value));
    assert(options.length > 1, 'A real microphone is required for device persistence verification');
    const device = options.find(v => v !== 'default');
    await step(page, '#select-settings-device', 'Choose a microphone for dictation.', () => page.selectOption('#select-settings-device', device));
    await step(page, '#btn-save-device', 'Save the microphone selection.', () => page.click('#btn-save-device'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(config, 'voice-prompt-prefs.json'))).configuredDevice, device);
    const status = await fetch('http://127.0.0.1:19289/api/status').then(r => r.json());
    assert.equal(status.configuredDevice, device);
    await page.screenshot({ path: path.join(output, 'device.png') });
    await step(page, '#tab-commands', 'RobOS Commands is the second settings tab.', () => page.click('#tab-commands'));
    await page.locator('.command-card').first().waitFor();
    await step(page, '#commands-search-input', 'Search the registered RobOS commands.', () => page.fill('#commands-search-input', 'voice'));
    assert(await page.locator('.command-card').count() > 0);
    await page.screenshot({ path: path.join(output, 'commands.png') });
    await page.click('#btn-close-window');
    const reopened = app.waitForEvent('window');
    await hud.click('#btn-voice-commands');
    const again = await reopened;
    await again.locator('#select-settings-device:not([disabled])').waitFor();
    assert.equal(await again.inputValue('#select-settings-device'), device);
    assert.equal(await again.locator('#tab-device').getAttribute('aria-selected'), 'true');
    await again.click('#tab-commands');
    await again.locator('#tab-commands').press('ArrowLeft');
    assert.equal(await again.locator('#tab-device').getAttribute('aria-selected'), 'true');
    console.log('PASS: gear, device persistence, commands search, reopen, keyboard tabs. Proof:', output);
  } finally {
    await app.close();
    const zero = cues[0]?.start || Date.now();
    const stamp = n => new Date(n - zero).toISOString().slice(11, 23);
    fs.writeFileSync(path.join(output, 'voice-settings.vtt'), 'WEBVTT\n\n' + cues.map(c => `${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n'));
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
