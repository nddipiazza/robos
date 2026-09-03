'use strict';
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const os   = require('os');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let _debugServer = null;
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'dom-snapshot'),
    path.resolve(__dirname, '..', 'robos-lib', 'dom-snapshot'),
    '/usr/local/share/robos/robos-lib/dom-snapshot',
  ].filter(Boolean);
  for (const p of libPaths) {
    try { _debugServer = require(p); break; } catch {}
  }
} catch {}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 900,
    x: 220,
    y: 80,
    title: 'Google Chrome - robos/acme-petshop: Issues · Gitea',
    backgroundColor: '#1e1f22',
    alwaysOnTop: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (_debugServer) {
    try {
      _debugServer.registerSnapshotIPC && _debugServer.registerSnapshotIPC(mainWindow);
      _debugServer.startDebugServer(mainWindow, 19175, 'gitea-browser');
    } catch {}
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.setName('gitea-browser');
app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'gitea-browser'));
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});
