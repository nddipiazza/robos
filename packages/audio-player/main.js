'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { CastService } = require('./lib/cast-service');
const { MediaLibrary } = require('./lib/media-library');
const cloud = require('./lib/cloud-storage');
const lyrics = require('./lib/lyrics');

function ensureFileAccessible(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  if (fs.existsSync(filePath)) return true;
  // If it's a GVFS SFTP mount that timed out or disconnected, attempt auto-reconnect via gio mount
  const match = filePath.match(/\/run\/user\/\d+\/gvfs\/sftp:host=([^/]+)/);
  if (match) {
    const host = match[1];
    try {
      const { execFileSync } = require('child_process');
      execFileSync('gio', ['mount', `sftp://${host}`], { stdio: 'ignore', timeout: 5000 });
      return fs.existsSync(filePath);
    } catch {}
  }
  return false;
}

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
    icon: fs.existsSync(path.join(__dirname, 'icon.png')) ? path.join(__dirname, 'icon.png') : path.join(__dirname, 'icon.svg'),
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


ipcMain.handle('audio:play-test-chime', async (_evt, ip) => {
  try {
    return await castService.playTestChime(ip);
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
  const res = await castService.stopPlayback(ip);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('audio:speaker-playback-stopped', { ip });
  }
  return res;
});

ipcMain.handle('audio:cast-stop-all', async () => {
  const res = await castService.stopAllPlayback();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('audio:speaker-playback-stopped', { all: true });
  }
  return res;
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
      id: `trk_${crypto.createHash('sha1').update(p).digest('hex').slice(0, 16)}`,
      title: path.parse(filename).name,
      artist: 'Local File',
      album: 'Local Files',
      filePath: p,
      src: pathToFileURL(p).href
    };
  });

  return { canceled: false, tracks };
});

ipcMain.handle('audio:ensure-file-accessible', async (_evt, filePath) => {
  return ensureFileAccessible(filePath);
});

ipcMain.handle('audio:get-library', async () => {
  return mediaLibrary.getLibrary();
});

ipcMain.handle('audio:select-library-folder', async () => {
  if (!mainWindow) return { canceled: true };
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Music Folder(s)',
    buttonLabel: 'Add Folder',
    properties: ['openDirectory', 'multiSelections', 'dontAddToRecent']
  });

  if (res.canceled || !res.filePaths.length) {
    return { canceled: true };
  }

  // Launch background scan worker off the main thread
  mediaLibrary.scanFoldersInBackground(res.filePaths, {
    onDiscovered: (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio:library-scan-discovered', data);
      }
    },
    onProgress: (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio:library-scan-progress', progress);
      }
    },
    onBatch: (batch) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio:library-scan-batch', batch);
      }
    },
    onDone: (doneData) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio:library-scan-complete', doneData);
      }
    },
    onError: (err) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio:library-scan-error', { error: err.message });
      }
    }
  });

  return {
    canceled: false,
    started: true,
    folders: res.filePaths
  };
});

ipcMain.handle('audio:scan-folders', async (_evt, folders) => {
  if (!Array.isArray(folders) || !folders.length) return { canceled: true };
  mediaLibrary.scanFoldersInBackground(folders, {
    onDiscovered: (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio:library-scan-discovered', data);
      }
    },
    onProgress: (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio:library-scan-progress', progress);
      }
    },
    onBatch: (batch) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio:library-scan-batch', batch);
      }
    },
    onDone: (doneData) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio:library-scan-complete', doneData);
      }
    },
    onError: (err) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio:library-scan-error', { error: err.message });
      }
    }
  });
  return { started: true, folders };
});

ipcMain.handle('audio:cancel-scan', async () => {
  const canceled = mediaLibrary.cancelScan();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('audio:library-scan-canceled');
  }
  return { canceled };
});

ipcMain.handle('audio:import-paths', async (_evt, targetPaths) => {
  if (!Array.isArray(targetPaths) || !targetPaths.length) return { canceled: true, tracks: [] };
  
  const files = [];
  const dirs = [];
  for (const p of targetPaths) {
    try {
      if (fs.existsSync(p)) {
        const stat = fs.statSync(p);
        if (stat.isDirectory()) dirs.push(p);
        else if (stat.isFile()) files.push(p);
      }
    } catch {}
  }

  const quickTracks = [];
  for (const f of files) {
    try {
      const track = await mediaLibrary.parseTrack(f);
      quickTracks.push(track);
    } catch {}
  }
  if (quickTracks.length > 0) {
    const incomingFileSet = new Set(quickTracks.map(t => t.filePath));
    mediaLibrary.tracks = mediaLibrary.tracks.filter(t => !incomingFileSet.has(t.filePath)).concat(quickTracks);
    mediaLibrary._rebuildIndexes();
    mediaLibrary._saveCache();
  }

  if (dirs.length > 0) {
    mediaLibrary.scanFoldersInBackground(dirs, {
      onDiscovered: (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('audio:library-scan-discovered', data);
        }
      },
      onProgress: (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('audio:library-scan-progress', progress);
        }
      },
      onBatch: (batch) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('audio:library-scan-batch', batch);
        }
      },
      onDone: (doneData) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('audio:library-scan-complete', doneData);
        }
      },
      onError: (err) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('audio:library-scan-error', { error: err.message });
        }
      }
    });
  }

  return {
    tracks: quickTracks,
    scanningDirs: dirs.length > 0,
    dirs,
    library: mediaLibrary.getLibrary()
  };
});

ipcMain.handle('audio:get-lyrics', async (_evt, track) => lyrics.getLyrics(track));

// ── RobOS cloud storage (Data Sources FTP / SFTP connections) ───────────────

function sendToWindow(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

ipcMain.handle('audio:cloud-connections', async () => cloud.listConnections());

ipcMain.handle('audio:cloud-list', async (_evt, { id, path: remotePath }) => {
  try {
    return { ok: true, ...(await cloud.list(id, remotePath)) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('audio:cloud-import', async (_evt, { id, paths }) => {
  try {
    const localFiles = await cloud.fetchAudio(id, paths || [], (p) => sendToWindow('audio:cloud-progress', p));
    const tracks = [];
    for (const f of localFiles) {
      try { tracks.push(await mediaLibrary.parseTrack(f)); } catch {}
    }
    if (tracks.length) {
      const incoming = new Set(tracks.map(t => t.filePath));
      mediaLibrary.tracks = mediaLibrary.tracks.filter(t => !incoming.has(t.filePath)).concat(tracks);
      mediaLibrary._rebuildIndexes();
      mediaLibrary._saveCache();
    }
    return { ok: true, added: tracks.length, library: mediaLibrary.getLibrary() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('audio:scan-default-library', async () => {
  const musicDir = path.join(os.homedir(), 'Music');
  if (!fs.existsSync(musicDir)) {
    fs.mkdirSync(musicDir, { recursive: true });
  }
  mediaLibrary.scanFoldersInBackground([musicDir], {
    onDiscovered: (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio:library-scan-discovered', data);
      }
    },
    onProgress: (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio:library-scan-progress', progress);
      }
    },
    onBatch: (batch) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio:library-scan-batch', batch);
      }
    },
    onDone: (doneData) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio:library-scan-complete', doneData);
      }
    },
    onError: (err) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio:library-scan-error', { error: err.message });
      }
    }
  });
  return { started: true, folder: musicDir };
});

// ── Playlist IPC Handlers ───────────────────────────────────────────────────

ipcMain.handle('audio:get-playlists', async () => {
  return mediaLibrary.getPlaylists();
});

ipcMain.handle('audio:get-playlist', async (_evt, id) => {
  return mediaLibrary.getPlaylist(id);
});

ipcMain.handle('audio:create-playlist', async (_evt, data) => {
  return mediaLibrary.createPlaylist(data || {});
});

ipcMain.handle('audio:update-playlist', async (_evt, { id, updates }) => {
  return mediaLibrary.updatePlaylist(id, updates || {});
});

ipcMain.handle('audio:delete-playlist', async (_evt, id) => {
  return mediaLibrary.deletePlaylist(id);
});

ipcMain.handle('audio:add-tracks-to-playlist', async (_evt, { id, tracks }) => {
  return mediaLibrary.addTracksToPlaylist(id, tracks || []);
});

ipcMain.handle('audio:remove-track-from-playlist', async (_evt, { id, trackIndex }) => {
  return mediaLibrary.removeTrackFromPlaylist(id, trackIndex);
});

ipcMain.handle('audio:reorder-playlist-tracks', async (_evt, { id, fromIndex, toIndex }) => {
  return mediaLibrary.reorderPlaylistTracks(id, fromIndex, toIndex);
});

ipcMain.handle('audio:export-playlist-m3u', async (_evt, id) => {
  if (!mainWindow) return { canceled: true };
  const playlist = mediaLibrary.getPlaylist(id);
  if (!playlist) return { canceled: true, error: 'Playlist not found' };
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Playlist as M3U',
    defaultPath: `${playlist.name.replace(/[^a-zA-Z0-9_\-\s]/g, '_')}.m3u`,
    filters: [{ name: 'M3U Playlist', extensions: ['m3u', 'm3u8'] }]
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  return mediaLibrary.exportM3u(id, res.filePath);
});

ipcMain.handle('audio:import-playlist-m3u', async () => {
  if (!mainWindow) return { canceled: true };
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Import M3U Playlist',
    properties: ['openFile'],
    filters: [{ name: 'M3U Playlists', extensions: ['m3u', 'm3u8'] }]
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };
  const playlist = await mediaLibrary.importM3u(res.filePaths[0]);
  return { canceled: false, playlist };
});



