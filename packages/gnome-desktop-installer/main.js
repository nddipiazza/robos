'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { ShortcutWorkerClient } = require('./lib/worker-client');

// Append QEMU / headless container compatibility flags
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'gnome-desktop-installer'));
app.setName('robos-gnome-desktop-installer');

// Optional global error handler
try {
  const { setupGlobalErrorHandlers } = require('/usr/local/share/robos/robos-lib/logger');
  setupGlobalErrorHandlers('gnome-desktop-installer', dialog);
} catch {
  try {
    const { setupGlobalErrorHandlers } = require('../robos-lib/logger');
    setupGlobalErrorHandlers('gnome-desktop-installer', dialog);
  } catch {}
}

// Run all filesystem & GNOME shortcut operations on a dedicated background worker thread
// so UI rendering and window animations never freeze.
const workerClient = new ShortcutWorkerClient();
let mainWindow = null;

// ── IPC Handlers (Non-blocking via Worker Thread) ────────────────────────────

ipcMain.handle('gdi:list-apps', () => {
  return workerClient.listApps();
});

ipcMain.handle('gdi:install-app', (_, appId, options = {}) => {
  return workerClient.installApp(appId, options);
});

ipcMain.handle('gdi:uninstall-app', (_, appId) => {
  return workerClient.uninstallApp(appId);
});

ipcMain.handle('gdi:set-desktop-shortcut', (_, appId, enabled) => {
  return workerClient.setDesktopShortcut(appId, enabled);
});

ipcMain.handle('gdi:set-dock-pinned', (_, appId, pinned) => {
  return workerClient.setDockPinned(appId, pinned);
});

ipcMain.handle('gdi:bulk-install', (event, appIds, options = {}) => {
  return workerClient.bulkInstall(appIds, options, (stepData) => {
    try {
      if (!event.sender.isDestroyed()) {
        event.sender.send('gdi:progress', stepData);
      }
    } catch {}
  });
});

ipcMain.handle('gdi:bulk-remove-desktop', (_, appIds) => {
  return workerClient.bulkRemoveDesktopShortcuts(appIds);
});

ipcMain.handle('gdi:refresh-caches', () => {
  return workerClient.refreshCaches();
});

ipcMain.handle('gdi:get-details', (_, appId) => {
  return workerClient.getAppDetails(appId);
});

ipcMain.handle('gdi:launch-app', (_, appId) => {
  return workerClient.launchApp(appId);
});

// ── Window Setup ─────────────────────────────────────────────────────────────

function createWindow() {
  const iconPng = path.join(__dirname, 'icon.png');
  const iconSvg = path.join(__dirname, 'icon.svg');

  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 920,
    minHeight: 600,
    title: 'RobOS GNOME Desktop App Installer',
    backgroundColor: '#0d1117',
    icon: fs.existsSync(iconPng) ? iconPng : iconSvg,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Wire up DOM Snapshot debug server
  try {
    const libPaths = [
      process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'dom-snapshot'),
      path.resolve(__dirname, '..', 'robos-lib', 'dom-snapshot'),
      '/usr/local/share/robos/robos-lib/dom-snapshot',
    ].filter(Boolean);
    for (const p of libPaths) {
      try {
        const { registerSnapshotIPC, startDebugServer } = require(p);
        registerSnapshotIPC(mainWindow);
        startDebugServer(mainWindow, 19201, 'gnome-desktop-installer');
        break;
      } catch {}
    }
  } catch { /* robos-lib not installed */ }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', async () => {
  await workerClient.terminate();
  app.quit();
});
