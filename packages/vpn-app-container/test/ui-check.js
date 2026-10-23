'use strict';
// Render the real renderer with actual missing-runtime status, without Electron.
// This is UI verification, not a live VPN/network test.
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const { Controller } = require('../lib/controller');
async function main() {
  const { chromium } = require(process.env.ROBOS_PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({ headless: true,
    ...(process.env.ROBOS_BROWSER ? { executablePath: process.env.ROBOS_BROWSER } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1100 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const runtime = await new Controller().prerequisites();
    assert.equal(runtime.ready, false, 'This check is specifically for the missing-runtime flow');
    await page.addInitScript(runtime => {
      window.vpn = {
        prerequisites: async () => runtime,
        status: async () => ({ state: 'unavailable', logs: runtime.message }),
      };
    }, runtime);
    await page.goto(pathToFileURL(path.join(__dirname, '../renderer/index.html')).href);
    await page.waitForFunction(() => document.querySelector('#runtime').textContent.includes('required'));
    assert.equal(await page.locator('#start').isDisabled(), true);
    assert.equal(await page.locator('#build').isDisabled(), true);
    assert.equal(await page.locator('#open').isDisabled(), true);
    await page.locator('#app').selectOption('transmission');
    await page.reload();
    assert.equal(await page.locator('#app').inputValue(), 'transmission');
    await page.locator('#app').selectOption('qbittorrent');
    assert.deepEqual(errors, []);
    if (process.env.ROBOS_UI_SCREENSHOT) {
      fs.mkdirSync(path.dirname(process.env.ROBOS_UI_SCREENSHOT), { recursive: true });
      await page.screenshot({ path: process.env.ROBOS_UI_SCREENSHOT, fullPage: true });
    }
    console.log('PASS: real renderer disables launch/build/open without Docker; app designation persists; no renderer errors');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
