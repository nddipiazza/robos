const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { ProfileDaemon } = require('./daemon');

// Single-instance lock (bypassed in test mode)
if (process.env.ROBOS_TEST !== '1' && process.env.ROBOS_TEST_MODE !== '1') {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) { app.quit(); process.exit(0); }
}

app.setName('robos-profiled');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

// Debug server (optional)
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

const daemon = new ProfileDaemon();
daemon.startSocketServer();

let win = null;

app.whenReady().then(() => {
  win = new BrowserWindow({
    title: 'RobOS Ephemeral Profile Manager',
    width: 920,
    height: 640,
    minWidth: 700,
    minHeight: 450,
    backgroundColor: '#0d1117',
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  if (_debugServer) _debugServer.startDebugServer(win, 19144);
});

app.on('window-all-closed', () => {
  daemon.stop();
  app.quit();
});

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('list-profiles', () => daemon.listProfiles());
ipcMain.handle('create-profile', (_, { name, options }) => daemon.createProfile(name, options));
ipcMain.handle('inspect-profile', (_, name) => daemon.inspectProfile(name));
ipcMain.handle('terminate-profile', (_, name) => daemon.terminateProfile(name));
ipcMain.handle('run-command', (_, { name, command, options }) => daemon.runCommand(name, command, options));
ipcMain.handle('wipe-all', () => daemon.wipeAll());
ipcMain.handle('spawn-swarm', (_, { count, prefix, options }) => daemon.spawnSwarm(count, prefix, options));
