'use strict';
const fs = require('node:fs');
const path = require('node:path');
async function main() {
  const executable = path.resolve(process.argv[2]);
  const driver = path.resolve(process.argv[3]);
  const output = path.resolve('run/windows-packaged-smoke');
  fs.mkdirSync(output, { recursive: true });
  const { _electron } = require(driver);
  const results = [];
  for (const id of ['launcher', 'point-of-sale', 'software-center', 'household', 'audio-player']) {
    const profile = path.join(output, 'profiles', id);
    fs.mkdirSync(profile, { recursive: true });
    const app = await _electron.launch({ executablePath: executable,
      args: ['--no-sandbox', '--disable-gpu', ...(id === 'launcher' ? [] : [`--app=${id}`])],
      env: { ...process.env, HOME: profile, USERPROFILE: profile, ROBOS_WINDOWS_AUDIT: '1' }, timeout: 30000 });
    try {
      const page = await app.firstWindow();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1200);
      const text = await page.locator('body').innerText();
      if (text.trim().length < 30 || errors.length) throw new Error(`${id}: ${errors.join('; ') || 'Empty window'}`);
      await page.screenshot({ path: path.join(output, `${id}.png`) });
      results.push({ id, ok: true, title: await page.title() });
    } finally { await app.close(); }
  }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
