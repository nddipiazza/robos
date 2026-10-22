'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const root = path.resolve(process.argv[2]);
const output = path.resolve('run/windows-audit');
fs.mkdirSync(output, { recursive: true });
const requested = process.argv.slice(3);
const apps = [{ id: 'launcher' }, ...JSON.parse(fs.readFileSync(path.join(root, 'apps.json')))].filter(a => !requested.length || requested.includes(a.id));

async function worker(id) {
  // Audit startup without changing the user's configured accounts, graph or app data.
  const profile = path.join(output, 'profiles', id);
  for (const dir of [profile, path.join(profile, 'AppData/Roaming'), path.join(profile, 'AppData/Local')]) fs.mkdirSync(dir, { recursive: true });
  const { _electron } = require(path.join(root, 'packages/robos-test/node_modules/playwright-core'));
  let instance;
  const errors = [], failedRequests = [];
  let stderr = '';
  const result = { id, ok: false };
  try {
    instance = await _electron.launch({ executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'),
      args: ['--no-sandbox', '--disable-gpu', path.join(root, 'windows'), ...(id === 'launcher' ? [] : [`--app=${id}`])], timeout: 12000,
      env: { ...process.env, ROBOS_WINDOWS_AUDIT: '1', HOME: profile, USERPROFILE: profile,
        APPDATA: path.join(profile, 'AppData/Roaming'), LOCALAPPDATA: path.join(profile, 'AppData/Local'),
        PATH: `${path.join(root, 'runtime')};${path.join(root, 'runtime/git/cmd')};${process.env.PATH}` } });
    instance.process().stderr.on('data', data => stderr += data);
    instance.on('window', page => page.on('pageerror', error => errors.push(error.message)));
    const page = await instance.firstWindow({ timeout: 12000 });
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', req => failedRequests.push({ url: req.url(), error: req.failure()?.errorText }));
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
    await page.waitForTimeout(1000);
    const state = await page.evaluate(() => ({ title: document.title, text: document.body?.innerText || '',
      controls: document.querySelectorAll('button,input,a,select,textarea').length,
      scripts: [...document.scripts].filter(s => s.src).map(s => s.src) }));
    Object.assign(result, state, { errors, failedRequests });
    result.ok = state.text.trim().length > 30 && !errors.length && !failedRequests.some(r => !/^https?:/.test(r.url));
    await page.screenshot({ path: path.join(output, `${id}.png`) });
  } catch (error) { result.error = error.message; }
  finally {
    result.stderr = stderr;
    fs.writeFileSync(path.join(output, `${id}.json`), JSON.stringify(result, null, 2));
    if (instance) {
      const child = instance.process();
      let timer;
      await Promise.race([instance.close().catch(() => {}), new Promise(resolve => { timer = setTimeout(resolve, 1500); })]);
      clearTimeout(timer);
      if (child.exitCode === null) spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    }
  }
}

async function audit() {
  const results = [];
  for (const app of apps) {
    const file = path.join(output, `${app.id}.json`);
    fs.rmSync(file, { force: true });
    await new Promise(resolve => {
      const child = spawn(process.execPath, [__filename, root, '--worker', app.id], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let log = '';
      child.stdout.on('data', d => log += d); child.stderr.on('data', d => log += d);
      const timeout = setTimeout(() => spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }), 32000);
      child.on('close', () => {
        clearTimeout(timeout);
        const result = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : { id: app.id, ok: false, error: log || 'Startup timed out' };
        if (!result.ok && log) result.driverLog = log;
        results.push(result);
        console.log(`${result.ok ? 'PASS' : 'FAIL'} ${app.id}${result.ok ? '' : ': ' + (result.error || result.errors?.join('; ') || result.failedRequests?.map(r => r.url).join('; ')).slice(0, 300)}`);
        fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
        resolve();
      });
    });
  }
  console.log(`Passed ${results.filter(r => r.ok).length}/${results.length}`);
  if (results.some(r => !r.ok)) process.exitCode = 1;
}
// Playwright can reject a second launch promise when a child dies during boot.
process.on('unhandledRejection', error => console.error(error));
if (process.argv[3] === '--worker') worker(process.argv[4]).catch(error => { console.error(error); process.exitCode = 1; });
else audit().catch(error => { console.error(error); process.exitCode = 1; });
