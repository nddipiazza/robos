'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { Controller, parseProfile, APPS } = require('./lib/controller');
app.setName('robos-vpn-app-container');
app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'vpn-app-container'));
for (const flag of ['no-sandbox', 'disable-gpu', 'disable-dev-shm-usage']) app.commandLine.appendSwitch(flag);
const controller = new Controller();
let profile = null;
let mainWindow;
ipcMain.handle('vpn:prerequisites', () => controller.prerequisites());
ipcMain.handle('vpn:build', () => controller.build());
ipcMain.handle('vpn:import', async () => {
  const selected = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: [{ name: 'OpenVPN profile', extensions: ['ovpn'] }] });
  if (selected.canceled) return null;
  const file = selected.filePaths[0];
  const parsed = parseProfile(fs.readFileSync(file, 'utf8'), name => fs.readFileSync(path.join(path.dirname(file), name), 'utf8'));
  profile = parsed;
  return { hostname: profile.hostname, port: profile.port, protocol: profile.protocol };
});
ipcMain.handle('vpn:start', (_, id, credentials) => {
  if (!profile) throw new Error('Import your VPN profile first');
  return controller.start(id, profile, credentials || {});
});
ipcMain.handle('vpn:stop', (_, id) => controller.stop(id));
ipcMain.handle('vpn:status', (_, id) => controller.status(id));
ipcMain.handle('vpn:open', (_, id) => {
  if (!Object.hasOwn(APPS, id)) throw new Error('Unknown app');
  return shell.openExternal(`http://127.0.0.1:${id === 'qbittorrent' ? 18080 : 18081}`);
});
app.whenReady().then(() => {
  mainWindow = new BrowserWindow({ width: 1000, height: 820, backgroundColor: '#0d1117',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.js') } });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  try {
    const { registerSnapshotIPC, startDebugServer } = require('/usr/local/share/robos/robos-lib/dom-snapshot');
    registerSnapshotIPC(mainWindow);
    startDebugServer(mainWindow, 19232, 'vpn-app-container');
  } catch { /* Optional debug library. */ }
});
app.on('window-all-closed', () => app.quit());
