'use strict';
// Against a running Electron theater with a trusted, real local-review manifest:
// ROBOS_THEATER_CDP=http://127.0.0.1:9334 node --test .../local-review.e2e.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.ROBOS_PLAYWRIGHT_MODULE || 'playwright-core');
test('local draft: CSP-safe controls, real diff, video playback, and runner handoff', { skip: !process.env.ROBOS_THEATER_CDP, timeout: 150000 }, async () => {
  const browser = await chromium.connectOverCDP(process.env.ROBOS_THEATER_CDP);
  try {
    const page = browser.contexts()[0].pages()[0];
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.waitForSelector('#stage-6.active');
    assert.match(await page.locator('#theater-pr-title').textContent(), /^Local draft:/);
    assert.equal(await page.locator('#step-btn-7').isVisible(), false);
    await page.locator('#step-btn-3').click();
    await page.waitForSelector('#stage-3.active');
    assert.ok((await page.locator('#diff-code-lines').textContent()).trim().length > 0);
    await page.locator('#step-btn-5').click();
    await page.waitForSelector('#stage-5.active video');
    await page.locator('video').evaluate(v => v.play());
    await page.waitForFunction(() => document.querySelector('video').currentTime > 0);
    await page.locator('video').evaluate(v => v.pause());
    await page.locator('#step-btn-6').click();
    await page.locator('#btn-run-show-fix').click();
    await page.waitForSelector('#frontend-handoff-banner:not(.hidden)', { timeout: 120000 });
    assert.equal(await page.locator('#show-fix-terminal-status').textContent(), 'HANDOFF');
    assert.equal(await page.locator('#check-fix-demonstrated').isChecked(), false);
    await page.locator('[data-theater-action="focusBrowserHandoff"]').click();
    assert.equal(await page.locator('#check-fix-demonstrated').isChecked(), false);
    assert.deepEqual(errors, []);
    // Leave the live browser open for the human; do not confirm on their behalf.
  } finally {
    await browser.close();
  }
});
