'use strict';
// Uses the real packaged main process, downloader, extractor, UI and native shortcuts.
// Only the release transport is redirected to a local fixture server.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const repo = path.resolve(__dirname, '../..');
const tools = name => require(process.env.ROBOS_PLAYWRIGHT && name === 'playwright-core' ? process.env.ROBOS_PLAYWRIGHT : path.join(repo, 'packages/app-manager/node_modules', name));
async function main() {
  const output = path.join(repo, 'run/app-manager-smoke'); fs.mkdirSync(output, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-manager-smoke-'));
  const source = path.join(temporary, 'fixture'); fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'package.json'), '{"name":"robos-smoke-app","version":"1.0.0","main":"main.js"}');
  fs.writeFileSync(path.join(source, 'main.js'), `const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const w=new BrowserWindow({webPreferences:{contextIsolation:true,nodeIntegration:false}});w.loadURL('data:text/html,<h1>Selected app opened successfully</h1>')});app.on('window-all-closed',()=>app.quit());`);
  const archive = path.join(temporary, 'fixture.tgz'); await tools('tar').c({ cwd: source, file: archive, gzip: true, portable: true }, ['.']);
  const payload = fs.readFileSync(archive), version = require('../../packages/app-manager/package.json').version;
  const item = (id, group) => ({ id, label: id === 'smoke-one' ? 'Sample Notes' : 'Sample Register', group, kind: 'app', description: 'An independently downloaded test app',
    version, dependencies: [], bytes: payload.length, unpackedBytes: 10000, sha256: crypto.createHash('sha256').update(payload).digest('hex'),
    url: `https://github.com/nddipiazza/robos/releases/download/v${version}/${id}.tgz` });
  const catalog = { schema: 1, version, platform: process.platform, arch: process.arch, components: [item('smoke-one', 'Everyday & business'), item('smoke-two', 'Developer tools')] };
  const server = http.createServer((req, res) => { if (req.url.endsWith('.json')) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(catalog)); } else res.end(payload); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const env = { ...process.env, HOME: temporary, USERPROFILE: temporary, LOCALAPPDATA: path.join(temporary, 'AppData/Local'), APPDATA: path.join(temporary, 'AppData/Roaming') };
  fs.mkdirSync(env.LOCALAPPDATA, { recursive: true }); fs.mkdirSync(env.APPDATA, { recursive: true });
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.platform === 'win32' ? path.join(repo, 'release/app-manager/win-unpacked/RobOS.exe') : path.join(repo, 'release/app-manager/linux-unpacked/robos-app-manager');
  const { _electron: electron } = tools('playwright-core');
  let application;
  const steps = [];
  try {
    application = await electron.launch({ executablePath, args: ['--no-sandbox', '--disable-gpu', '--enable-logging=stderr'], env, timeout: 30000 });
    await application.evaluate(({ dialog }, port) => {
      const original = globalThis.fetch;
      globalThis.fetch = (url, options) => original(`http://127.0.0.1:${port}/${String(url).split('/').pop()}`, options);
      dialog.showMessageBox = async () => ({ response: 1 });
    }, server.address().port);
    const window = await application.firstWindow(); await window.waitForSelector('#refresh');
    await window.locator('#refresh').click(); await window.getByText('Sample Notes', { exact: true }).waitFor();
    const narrate = async text => { steps.push(text); await window.evaluate(text => {
      let card = document.getElementById('smoke-caption'); if (!card) { card = document.createElement('div'); card.id = 'smoke-caption'; card.setAttribute('role', 'status'); document.body.append(card); }
      card.textContent = text;
    }, text); };
    await narrate('Choose just one app. Other apps stay uninstalled.');
    await window.getByRole('checkbox', { name: 'Select Sample Notes', exact: true }).check();
    await window.locator('#install').click(); await window.getByText('Selected apps are ready to open.', { exact: true }).waitFor();
    await window.getByText('Installed', { exact: true }).waitFor();
    const state = await window.evaluate(() => window.robosManager.state());
    if (Object.keys(state.installed).join() !== 'smoke-one') throw new Error('An unselected app was installed');
    await narrate('The selected app is installed and has a native menu entry.');
    const locations = require('../../packages/app-manager/lib/paths.cjs').paths({ platform: process.platform, home: temporary, env });
    const shortcut = process.platform === 'win32' ? path.join(locations.shortcuts, 'smoke-one/Sample Notes.lnk') : path.join(locations.shortcuts, 'robos-managed-smoke-one.desktop');
    if (!fs.existsSync(shortcut)) throw new Error('Missing native menu entry');
    await window.screenshot({ path: path.join(output, 'installed.png') });
    await narrate('Open the downloaded app using the shared RobOS runtime.');
    await window.getByRole('button', { name: 'Open', exact: true }).click();
    await window.getByText('Opened Sample Notes.', { exact: true }).waitFor();
    await window.getByRole('button', { name: 'Uninstall', exact: true }).waitFor();
    // Close managed child processes so removal can proceed. Query the test process
    // tree on Windows; Linux pkill matches only this isolated owner's app argument.
    await application.evaluate(() => {
      const { execFileSync } = require('node:child_process');
      if (process.platform === 'win32') execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        `Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq ${process.pid} -and $_.CommandLine -like '*--app=smoke-one*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`], { windowsHide: true });
      else { try { execFileSync('pkill', ['-P', String(process.pid), '-f', '--', '--app=smoke-one']); } catch {} }
    });
    await new Promise(resolve => setTimeout(resolve, 500));
    await narrate('Uninstall the app and remove its native menu entry.');
    await window.getByRole('button', { name: 'Uninstall', exact: true }).click();
    await window.waitForFunction(async () => !Object.keys((await window.robosManager.state()).installed).length);
    if (fs.existsSync(shortcut)) throw new Error('Uninstall left a stale shortcut');
    await window.screenshot({ path: path.join(output, 'removed.png') });
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ passed: true, platform: process.platform, steps }, null, 2));
    console.log('Packaged manager: selective download, installation, native shortcut, launch and removal passed.');
  } finally {
    if (application) await application.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
