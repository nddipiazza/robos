'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path'), os = require('node:os'), fs = require('node:fs');
const { Hosts } = require('./lib/hosts.cjs');
app.setName('robos-services');
app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'robos-services'));
for (const flag of ['no-sandbox', 'disable-gpu', 'disable-dev-shm-usage']) app.commandLine.appendSwitch(flag);
const hosts = new Hosts(); let win, debugServer;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  app.quit();
  setTimeout(() => app.exit(0), 3000).unref();
});
app.on('before-quit', () => { debugServer?.close(); });
for (const lib of ['../robos-lib/logger', '/usr/local/share/robos/robos-lib/logger']) {
  try { require(lib).setupGlobalErrorHandlers('robos-services', require('electron').dialog); break; } catch {}
}
const handle = (name, fn) => ipcMain.handle(`services:${name}`, async (event, ...args) => {
  if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Invalid sender');
  try { return { ok: true, result: await fn(...args) }; } catch (e) { return { ok: false, error: e.message }; }
});
handle('hosts', () => hosts.list()); handle('save-host', value => hosts.save(value));
handle('key', () => hosts.key()); handle('probe', id => hosts.probe(id));
handle('install', id => hosts.install(id));
handle('list', id => hosts.call(id, { command: 'list' }));
handle('action', (id, request) => hosts.call(id, { ...request, command: 'action' }));
handle('linger', id => hosts.call(id, { command: 'linger' }));
handle('connection', id => hosts.call(id, { command: 'connection' }));
app.whenReady().then(() => {
  win = new BrowserWindow({ width: 1300, height: 880, minWidth: 980, minHeight: 640, show: process.env.ROBOS_SERVICES_TEST !== '1', title: 'RobOS Services', backgroundColor: '#0d1117', icon: path.join(__dirname, fs.existsSync(path.join(__dirname, 'icon.png')) ? 'icon.png' : 'icon.svg'), webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, offscreen: process.env.ROBOS_SERVICES_TEST === '1', backgroundThrottling: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.loadFile(path.join(__dirname, 'renderer/index.html'));
  if (process.env.ROBOS_SERVICES_TEST !== '1') {
    for (const lib of ['../robos-lib/dom-snapshot', '/usr/local/share/robos/robos-lib/dom-snapshot']) {
      try { const debug = require(lib); if (!debug.startDebugServer.supportsHostBinding) continue; debug.registerSnapshotIPC(ipcMain); debugServer = debug.startDebugServer(win, 19208, 'robos-services', { host: '127.0.0.1' }); break; } catch {}
    }
  }
});
app.on('window-all-closed', () => app.quit());
