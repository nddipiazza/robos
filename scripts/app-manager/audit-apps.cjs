'use strict';
// Starts every app in this platform's catalog the way App Manager does: installed by the real
// Manager into an isolated home, then launched from its managed location. On Linux, also checks
// each desktop entry and window class. Linux needs a display:
//   xvfb-run -a -s "-screen 0 1440x900x24" node scripts/app-manager/audit-apps.cjs [app ids]
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const repo = path.resolve(__dirname, '../..');
const lib = name => require(path.join(repo, 'packages/app-manager/lib', name));
const linux = process.platform === 'linux';
const executablePath = process.env.ROBOS_MANAGER_EXE || path.join(repo, 'release/app-manager', {
  win32: 'win-unpacked/RobOS.exe', linux: 'linux-unpacked/robos-app-manager',
  darwin: `${process.arch === 'arm64' ? 'mac-arm64' : 'mac'}/RobOS.app/Contents/MacOS/RobOS` }[process.platform]);
const payloads = path.resolve(process.env.ROBOS_SMOKE_PAYLOADS || path.join(repo, 'release/app-manager'));
const output = path.join(repo, 'run/app-audit');
const catalogFile = path.join(payloads, `robos-catalog-${process.platform}-${process.arch}.json`);
// The audit never installs into, or reads from, the user's own desktop and settings.
function isolate(home) {
  const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: path.join(home, 'AppData/Roaming'), LOCALAPPDATA: path.join(home, 'AppData/Local'),
    XDG_DATA_HOME: path.join(home, '.local/share'), XDG_CONFIG_HOME: path.join(home, '.config'), XDG_CACHE_HOME: path.join(home, '.cache'),
    ROBOS_APP_AUDIT: '1', GSETTINGS_BACKEND: 'memory' };
  delete env.ELECTRON_RUN_AS_NODE; delete env.WAYLAND_DISPLAY; delete env.XDG_CURRENT_DESKTOP;
  return env;
}
const desktopIssues = (id, entry) => {
  const issues = [], text = fs.readFileSync(entry, 'utf8');
  if (!text.includes(`StartupWMClass=robos-${id}\n`)) issues.push('missing StartupWMClass');
  const icon = text.match(/^Icon=(.*)$/m)?.[1];
  if (!icon?.startsWith('/') || !fs.existsSync(icon)) issues.push(`no real icon: ${icon}`);
  if (spawnSync('desktop-file-validate', [entry], { encoding: 'utf8' }).status !== 0) issues.push('invalid desktop entry');
  return issues;
};
function windowClasses(pid, visibleOnly) {
  const search = ['search', ...(visibleOnly ? ['--onlyvisible'] : []), '--pid', String(pid)];
  const ids = spawnSync('xdotool', search, { encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean);
  return [...new Set(ids.map(id => spawnSync('xprop', ['-id', id, 'WM_CLASS'], { encoding: 'utf8' }).stdout.match(/= "([^"]+)"/)?.[1]).filter(Boolean))];
}
function kill(pid) {
  if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else { try { process.kill(pid, 'SIGKILL'); } catch {} }
}
async function worker(id, home) {
  const env = isolate(home), { _electron } = require(path.join(repo, 'packages/app-manager/node_modules/playwright-core'));
  const errors = [], failedRequests = [], result = { id, ok: false }, started = Date.now();
  let instance, page, stderr = '';
  try {
    instance = await _electron.launch({ executablePath, args: ['--no-sandbox', '--disable-gpu', `--app=${id}`], env, timeout: 15000 });
    instance.process().stderr.on('data', data => { stderr += data; });
    instance.on('window', opened => opened.on('pageerror', error => errors.push(error.message)));
    page = await instance.firstWindow({ timeout: 15000 });
    result.firstWindowMs = Date.now() - started;
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
    await page.waitForTimeout(1200);
    const state = await page.evaluate(() => ({ title: document.title, text: document.body?.innerText || '', controls: document.querySelectorAll('button,input,a,select,textarea').length }));
    result.title = state.title; result.textLength = state.text.trim().length; result.controls = state.controls; result.errors = errors; result.failedRequests = failedRequests;
    let matched = true;
    if (linux) {
      // Electron keeps hidden helper windows under the runtime's default name. Every window the
      // user can see must match the entry. Desktop Manager and Git Login Manager start hidden by design.
      const expected = `robos-${id}`, pid = instance.process().pid;
      const visible = windowClasses(pid, true), all = windowClasses(pid, false);
      result.windowClasses = visible; result.startsHidden = !visible.length;
      matched = visible.length ? visible.every(name => name === expected) : all.includes(expected);
      if (!matched) result.error = `Window class ${JSON.stringify(visible.length ? visible : all)} does not match ${expected}`;
    }
    result.ok = result.textLength > 30 && !errors.length && !failedRequests.some(request => !/^https?:/.test(request.url)) && matched;
    await page.screenshot({ path: path.join(output, `${id}.png`), timeout: 5000 }).catch(() => {});
  } catch (error) {
    result.error = error.message; result.errors = errors; result.failedRequests = failedRequests;
    if (page) await page.screenshot({ path: path.join(output, `${id}-failure.png`), timeout: 1500 }).catch(() => {});
  } finally {
    result.elapsedMs = Date.now() - started; result.stderr = stderr.slice(-4000);
    fs.writeFileSync(path.join(output, `${id}.json`), JSON.stringify(result, null, 2));
    if (instance) {
      const child = instance.process(); let timer;
      await Promise.race([instance.close().catch(() => {}), new Promise(resolve => { timer = setTimeout(resolve, 2000); })]);
      clearTimeout(timer);
      if (child.exitCode === null) kill(child.pid);
    }
  }
  process.exit(0);
}
async function main() {
  fs.rmSync(output, { recursive: true, force: true }); fs.mkdirSync(output, { recursive: true });
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-app-audit-'));
  const env = isolate(home); fs.mkdirSync(env.APPDATA, { recursive: true }); fs.mkdirSync(env.LOCALAPPDATA, { recursive: true });
  const requested = process.argv.slice(2);
  const catalog = lib('catalog.cjs').validateCatalog(JSON.parse(fs.readFileSync(catalogFile, 'utf8')), process.platform, process.arch);
  const apps = catalog.components.filter(item => item.kind === 'app' && (!requested.length || requested.includes(item.id)));
  const locations = lib('paths.cjs').paths({ platform: process.platform, home, env });
  // Only Linux entries can be written outside Electron. Launching does not depend on them.
  const native = linux ? lib('integration.cjs').integration({ locations, executable: executablePath, packaged: true, platform: 'linux', desktop: lib('gnome.cjs').gnome({ env: {} }) }) : { shortcut() {}, removeAll() {} };
  const manager = new (lib('manager.cjs').Manager)({ locations, native, version: catalog.version,
    downloader: async (item, destination) => fs.copyFileSync(path.join(payloads, new URL(item.url).pathname.split('/').pop()), destination) });
  manager.catalog = catalog;
  await manager.install(apps.map(item => item.id));
  console.log(`Installed ${apps.length} apps and their shared components`);
  const results = [];
  for (const app of apps) {
    const file = path.join(output, `${app.id}.json`);
    await new Promise(resolve => {
      const child = spawn(process.execPath, [__filename, '--worker', app.id, home], { stdio: 'ignore', windowsHide: true });
      const timeout = setTimeout(() => kill(child.pid), 60000);
      child.on('close', () => { clearTimeout(timeout); resolve(); });
    });
    fs.rmSync(path.join(locations.root, 'running', `${app.id}.json`), { force: true });
    const result = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : { id: app.id, ok: false, error: 'Startup timed out' };
    const issues = linux ? desktopIssues(app.id, path.join(locations.shortcuts, `robos-managed-${app.id}.desktop`)) : [];
    if (issues.length) { result.ok = false; result.desktopIssues = issues; }
    results.push(result);
    const reason = result.ok ? '' : `: ${[result.error, ...(result.errors || []), ...(result.failedRequests || []).map(item => item.url), ...issues].filter(Boolean).join('; ').slice(0, 300) || `no content (${result.textLength} characters)`}`;
    console.log(`${result.ok ? 'PASS' : 'FAIL'} ${app.id}${reason}`);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  }
  console.log(`Passed ${results.filter(item => item.ok).length}/${results.length}`);
  if (linux) spawnSync('pkill', ['-f', home], { stdio: 'ignore' });
  fs.rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  if (results.some(item => !item.ok)) process.exitCode = 1;
}
process.on('unhandledRejection', error => console.error(error));
if (process.argv[2] === '--worker') worker(process.argv[3], process.argv[4]).catch(error => { console.error(error); process.exit(1); });
else main().catch(error => { console.error(error); process.exitCode = 1; });
