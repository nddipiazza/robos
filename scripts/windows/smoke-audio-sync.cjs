'use strict';
// Real Electron UI and IPC, isolated profile, synthetic Google Drive mount.
// Usage: node scripts/windows/smoke-audio-sync.cjs <installed-suite> [app-directory]
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

async function main() {
  const installed = path.resolve(process.argv[2]);
  const appDir = path.resolve(process.argv[3] || path.join(installed, 'packages/audio-player'));
  const { _electron } = require(path.join(installed, 'packages/robos-test/node_modules/playwright-core'));
  const output = path.resolve('run/audio-sync-smoke');
  fs.mkdirSync(output, { recursive: true });
  const profile = fs.mkdtempSync(path.join(output, 'profile-'));
  const config = path.join(profile, '.config/robos');
  const mount = path.join(profile, 'cloud-music');
  fs.mkdirSync(config, { recursive: true });
  fs.mkdirSync(mount);
  const writeSong = name => {
    const wav = Buffer.alloc(8044);
    wav.write('RIFF'); wav.writeUInt32LE(8036, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(8000, 28);
    wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34);
    wav.write('data', 36); wav.writeUInt32LE(8000, 40); wav.fill(128, 44);
    fs.writeFileSync(path.join(mount, `${name}.wav`), wav);
  };
  writeSong('First song');
  fs.writeFileSync(path.join(config, 'data-sources.json'), JSON.stringify(['google', 'google-copy'].map(id => ({
    id, name: 'My music', category: 'storage', driverType: 'gdrive', folderId: 'fixture-folder',
    folders: [{ id: 'fixture-folder', label: 'Music' }], accessToken: 'ya29.test_audio_sync', localMountPath: mount,
  }))));
  const env = { ...process.env, HOME: profile, USERPROFILE: profile,
    APPDATA: path.join(profile, 'AppData/Roaming'), LOCALAPPDATA: path.join(profile, 'AppData/Local') };
  delete env.ELECTRON_RUN_AS_NODE;
  // Windows derives Electron paths from the OS, so isolate userData explicitly.
  const entry = path.join(profile, 'entry.cjs');
  fs.writeFileSync(entry, `require('electron').app.setPath('userData', ${JSON.stringify(path.join(profile, 'electron'))});
    require(${JSON.stringify(path.join(appDir, 'main.js'))});`);
  let app;
  const launch = async () => {
    app = await _electron.launch({ executablePath: path.join(installed, 'node_modules/electron/dist/electron.exe'),
      args: ['--no-sandbox', '--disable-gpu', entry], env, timeout: 20000 });
    const page = await app.firstWindow();
    await page.locator('#tab-btn-cloud').click();
    await page.locator('.cloud-sync-folder').waitFor();
    return page;
  };
  const waitForCount = (page, count) => page.waitForFunction(n =>
    document.querySelector('.cloud-sync-folder')?.textContent.includes(`${n} tracks`), count);
  try {
    let page = await launch();
    assert.equal(await page.locator('.cloud-sync-source').count(), 1);
    let check = page.getByRole('checkbox', { name: 'Keep Music synced', exact: true });
    assert.equal(await check.isChecked(), false);
    await check.check();
    await waitForCount(page, 1);
    assert.equal((await page.evaluate(() => window.robosAudio.listFolders())).folders.length, 1);
    writeSong('Second song');
    await page.getByRole('button', { name: 'Refresh Music', exact: true }).click();
    await waitForCount(page, 2);
    await app.close(); app = null;

    writeSong('Startup song');
    page = await launch();
    await waitForCount(page, 3);
    check = page.getByRole('checkbox', { name: 'Keep Music synced', exact: true });
    assert.equal(await check.isChecked(), true);
    await check.uncheck();
    await page.waitForFunction(() => document.querySelector('.cloud-sync-folder')?.textContent.includes('Sync paused'));
    await app.close(); app = null;

    writeSong('Paused song');
    page = await launch();
    check = page.getByRole('checkbox', { name: 'Keep Music synced', exact: true });
    assert.equal(await check.isChecked(), false);
    assert.equal((await page.evaluate(() => window.robosAudio.listFolders())).folders[0].trackCount, 3);
    await check.check();
    await waitForCount(page, 4);
    await page.screenshot({ path: path.join(output, 'cloud-sync.png') });
    const folderId = (await page.evaluate(() => window.robosAudio.listFolders())).folders[0].id;
    await page.locator('#tab-btn-library').click();
    await page.locator('#library-scope').selectOption(folderId);
    await page.waitForFunction(() => document.querySelector('#lib-nav-songs .lib-nav-count')?.textContent === '4');
    console.log('PASS duplicate Google folder, persistent choice, refresh, startup sync, paused startup, resume');
  } finally {
    if (app) await app.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
