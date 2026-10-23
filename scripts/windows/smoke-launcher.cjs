'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, execFileSync, spawnSync } = require('node:child_process');

async function main() {
  const root = path.resolve(process.argv[2]);
  const packaged = !!process.argv[3];
  const executable = packaged ? path.resolve(process.argv[3]) : path.join(root, 'node_modules/electron/dist/electron.exe');
  const args = [...(packaged ? [] : [path.join(root, 'windows')])];
  const output = path.resolve('run/windows-launcher-smoke'); fs.mkdirSync(output, { recursive: true });
  const profile = fs.mkdtempSync(path.join(output, 'profile-'));
  for (const d of ['AppData/Roaming', 'AppData/Local']) fs.mkdirSync(path.join(profile, d), { recursive: true });
  const env = { ...process.env, HOME: profile, USERPROFILE: profile, APPDATA: path.join(profile, 'AppData/Roaming'),
    LOCALAPPDATA: path.join(profile, 'AppData/Local'), ROBOS_WINDOWS_AUDIT: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const { _electron } = require(path.join(root, 'packages/robos-test/node_modules/playwright-core'));
  const started = Date.now();
  const app = await _electron.launch({ executablePath: executable, args: ['--no-sandbox', '--disable-gpu', ...args], env });
  const children = new Set();
  const results = {};
  try {
    const page = await app.firstWindow();
    await page.locator('.suite-card').first().waitFor();
    await page.getByRole('button', { name: 'Enable Win + Shift + Space', exact: true }).waitFor();
    results.coldMs = Date.now() - started;
    await page.getByRole('button', { name: 'Enable Win + Shift + Space', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('shortcut-toggle').disabled);
    const shortcutState = await page.evaluate(() => window.robos.launcherState());
    console.log('Shortcut state:', JSON.stringify(shortcutState));
    results.shortcut = shortcutState;
    if (!shortcutState.shortcutActive) assert.match(await page.locator('#launcher-hint').innerText(), /in use/);
    await page.evaluate(() => { window.cachedLauncherProof = 'same-renderer'; });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
    const warmStarted = Date.now();
    const second = spawn(executable, args, { env, windowsHide: false, stdio: 'ignore' });
    const exit = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { second.kill(); reject(new Error('Second launcher did not hand off')); }, 15000);
      second.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Second launcher exited ${code}`)); });
      second.once('error', error => { clearTimeout(timer); reject(error); });
    });
    await exit;
    await page.waitForFunction(() => document.hasFocus());
    results.warmMs = Date.now() - warmStarted;
    assert.equal(await page.evaluate(() => window.cachedLauncherProof), 'same-renderer');
    // This goes through the launcher's real IPC, not the standalone --app path.
    results.pointOfSale = await page.evaluate(() => window.robos.launch('point-of-sale'));
    children.add(results.pointOfSale.pid);
    assert.equal(results.pointOfSale.visible, true);
    const handle = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `(Get-Process -Id ${Number(results.pointOfSale.pid)}).MainWindowHandle.ToInt64()`], { encoding: 'utf8', windowsHide: true }).trim();
    assert.notEqual(handle, '0', 'A running process with a hidden window is not a successful GUI launch');
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.show(); w.focus(); });
    await page.getByRole('button', { name: 'Household', exact: true }).first().click();
    await page.waitForFunction(() => document.getElementById('status').textContent === 'Opening Household', { timeout: 30000 });
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.show(); w.focus(); });
    await page.screenshot({ path: path.join(output, 'launcher.png') });
    if (shortcutState.shortcutActive) await page.getByRole('button', { name: 'Win + Shift + Space enabled', exact: true }).click();
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
    console.log('PASS visible app launch, real tile click, resident reuse, and shortcut registration/conflict handling');
  } finally {
    // Terminate only GUI app children created by this isolated test launcher.
    try {
      const rows = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        `@(Get-CimInstance Win32_Process | Where-Object ParentProcessId -eq ${Number(app.process().pid)} | Select-Object -ExpandProperty ProcessId) | ConvertTo-Json -Compress`], { encoding: 'utf8', windowsHide: true }) || '[]');
      for (const pid of [].concat(rows)) children.add(pid);
    } catch {}
    for (const pid of children) if (Number.isInteger(pid)) spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 5000 });
    const child = app.process(); let timer;
    await Promise.race([app.close().catch(() => {}), new Promise(resolve => { timer = setTimeout(resolve, 1500); })]); clearTimeout(timer);
    if (child.exitCode === null) spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 5000 });
  }
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
