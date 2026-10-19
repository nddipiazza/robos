'use strict';
// The desktop shell: starts the embedded server, shows the staff app, exposes only the narrow preload bridge.
// Needs `npm install` (Electron binary) and a display (use xvfb-run on a headless machine); skipped otherwise.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { playwright } = require('./browser');

const electronBinary = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron');
const haveDisplay = !!process.env.DISPLAY;
const skip = !fs.existsSync(electronBinary) ? 'Electron is not installed (run npm install)' : !haveDisplay ? 'No display (run under xvfb-run)' : false;

test('desktop app opens on the first-run screen, signs in, keeps data on disk and does not leak Node into the page', { skip, timeout: 120000 }, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-electron-'));
  const app = await playwright()._electron.launch({ executablePath: electronBinary, args: [path.join(__dirname, '..', 'main.js'), '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'], env: { ...process.env, ROBOS_POS_DATA: dataDir } });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('[data-testid="setup-coffee"]', { timeout: 30000 });
    assert.match(page.url(), /^http:\/\/127\.0\.0\.1:\d+\/$/);
    await page.click('[data-testid="setup-coffee"]');
    await page.waitForSelector('[data-testid="login-submit"]');
    for (const k of '3333') await page.click(`.numpad button[data-key="${k}"]`);
    await page.click('[data-testid="login-submit"]');
    await page.waitForSelector('[data-testid="whoami"]');
    assert.match(await page.textContent('[data-testid="whoami"]'), /Cleo/);
    assert.equal(await page.evaluate(() => typeof window.robos.posInfo), 'function');
    assert.equal(await page.evaluate(() => typeof require), 'undefined');
    assert.equal((await page.evaluate(() => window.robos.posInfo())).dataDir, dataDir);
  } finally { await app.close(); }
  assert.ok(fs.existsSync(path.join(dataDir, 'store.json')));
  assert.equal(fs.statSync(path.join(dataDir, 'store.json')).mode & 0o077, 0);
});
