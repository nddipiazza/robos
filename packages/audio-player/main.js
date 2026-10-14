'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { CastService } = require('./lib/cast-service');
const { MediaLibrary } = require('./lib/media-library');

// Optional snapshot debug server
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

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let mainWindow = null;
const mediaLibrary = new MediaLibrary();
const castService = new CastService();
castService.mediaLibrary = mediaLibrary;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 840,
    minHeight: 580,
    backgroundColor: '#0d1117',
    title: 'RobOS Audio Player',
    icon: path.join(__dirname, 'icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  app.setName('robos-audio-player');

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Wire snapshot server on port 19196
  if (_debugServer) {
    try {
      if (typeof _debugServer.registerSnapshotIPC === 'function') {
        _debugServer.registerSnapshotIPC(mainWindow);
      }
      if (typeof _debugServer.startDebugServer === 'function') {
        _debugServer.startDebugServer(mainWindow, 19196, 'audio-player');
      }
    } catch (e) {
      console.warn('[AudioPlayer] Could not start debug snapshot server:', e.message);
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC Handlers ────────────────────────────────────────────────────────────

ipcMain.handle('audio:discover-speakers', async () => {
  try {
    return await castService.scanSubnet();
  } catch (err) {
    console.error('[AudioPlayer] Error scanning speakers:', err);
    return [];
  }
});

ipcMain.handle('audio:get-speaker-status', async (_evt, ip) => {
  try {
    return await castService.getSpeakerStatus(ip);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('audio:set-speaker-volume', async (_evt, { ip, level, muted }) => {
  try {
    return await castService.setSpeakerVolume(ip, level, muted);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('audio:cast-file', async (_evt, { ip, filePath, metadata }) => {
  try {
    if (!fs.existsSync(filePath)) throw new Error('File does not exist: ' + filePath);
    const streamUrl = castService.registerFile(filePath);
    return await castService.castMediaUrl(ip, streamUrl, metadata, (status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio:speaker-status-change', { ip, status });
      }
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('audio:cast-url', async (_evt, { ip, url, metadata }) => {
  try {
    return await castService.castMediaUrl(ip, url, metadata, (status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio:speaker-status-change', { ip, status });
      }
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('audio:cast-tts', async (_evt, { ip, text, metadata }) => {
  try {
    return await castService.broadcastTTS(ip, text, metadata);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('audio:cast-pause', async (_evt, ip) => {
  return castService.pausePlayback(ip);
});

ipcMain.handle('audio:cast-resume', async (_evt, ip) => {
  return castService.resumePlayback(ip);
});

ipcMain.handle('audio:cast-stop', async (_evt, ip) => {
  return castService.stopPlayback(ip);
});

ipcMain.handle('audio:open-file-dialog', async () => {
  if (!mainWindow) return { canceled: true };
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Audio Files',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (res.canceled || !res.filePaths.length) {
    return { canceled: true, tracks: [] };
  }

  const tracks = res.filePaths.map(p => {
    const filename = path.basename(p);
    return {
      title: path.parse(filename).name,
      artist: 'Local File',
      filePath: p,
      src: `file://${p}`
    };
  });

  return { canceled: false, tracks };
});

ipcMain.handle('audio:get-library', async () => {
  return mediaLibrary.getLibrary();
});

ipcMain.handle('audio:select-library-folder', async () => {
  if (!mainWindow) return { canceled: true };
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Music Library Folder',
    properties: ['openDirectory']
  });

  if (res.canceled || !res.filePaths.length) {
    return { canceled: true };
  }

  const folder = res.filePaths[0];
  const scanResult = await mediaLibrary.scanDirectory(folder, (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('audio:library-scan-progress', progress);
    }
  });

  return { canceled: false, folder, ...scanResult };
});

ipcMain.handle('audio:scan-default-library', async () => {
  const musicDir = path.join(os.homedir(), 'Music');
  if (!fs.existsSync(musicDir)) {
    fs.mkdirSync(musicDir, { recursive: true });
  }
  return await mediaLibrary.scanDirectory(musicDir, (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('audio:library-scan-progress', progress);
    }
  });
});

