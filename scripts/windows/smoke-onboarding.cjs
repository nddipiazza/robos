'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

async function main() {
  const root = path.resolve(process.argv[2]);
  const { _electron } = require(path.join(root, 'packages/robos-test/node_modules/playwright-core'));
  fs.mkdirSync('run', { recursive: true });
  const profile = fs.mkdtempSync(path.resolve('run/onboarding-regression-'));
  for (const dir of ['AppData/Roaming', 'AppData/Local']) fs.mkdirSync(path.join(profile, dir), { recursive: true });
  const app = await _electron.launch({ executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'),
    args: ['--no-sandbox', '--disable-gpu', path.join(root, 'windows'), '--app=robos-onboarding'],
    env: { ...process.env, ROBOS_WINDOWS_AUDIT: '1', HOME: profile, USERPROFILE: profile,
      APPDATA: path.join(profile, 'AppData/Roaming'), LOCALAPPDATA: path.join(profile, 'AppData/Local') } });
  try {
    const page = await app.firstWindow();
    console.log('Onboarding window opened');
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
    console.log('Onboarding DOM ready');
    assert.equal(await page.locator('iframe[src]').count(), 0, 'Hidden apps must not start during wizard startup');
    for (const [step, id] of [[8, 'agents-manager'], [9, 'git-projects'], [10, 'software-center']]) {
      console.log(`Opening step ${step}: ${id}`);
      await page.locator(`.step-nav-item[data-step="${step}"]`).click();
      assert.equal(await page.locator(`#iframe-${id}`).getAttribute('src'), `../../${id}/renderer/index.html`);
      assert.equal(await page.locator(`#iframe-${id}`).getAttribute('data-src'), null, 'Only initialize each frame once');
    }
    // The wizard must remain responsive while the embedded catalog probes run.
    await page.locator('.step-nav-item[data-step="1"]').click({ timeout: 2000 });
    assert.equal(await page.locator('#step-1').getAttribute('aria-hidden'), 'false');
    await page.screenshot({ path: 'run/onboarding-startup-regression.png' });
    console.log('PASS onboarding startup, deferred embedded apps, and responsive navigation');
  } catch (error) {
    console.error(error);
    throw error;
  } finally {
    const child = app.process();
    let timer;
    await Promise.race([app.close().catch(() => {}), new Promise(resolve => { timer = setTimeout(resolve, 1500); })]);
    clearTimeout(timer);
    if (child.exitCode === null) spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
