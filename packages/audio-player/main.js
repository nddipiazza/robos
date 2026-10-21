'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { CastService } = require('./lib/cast-service');
const { MediaLibrary } = require('./lib/media-library');
const cloud = require('./lib/cloud-storage');
const lyrics = require('./lib/lyrics');
const { LibraryFolders } = require('./lib/library-folders');
const aiPlaylist = require('./lib/ai-playlist');

// Shared RobOS modules: the repo checkout in development, the installed copy on the VM.
function requireShared(...relPaths) {
  for (const rel of relPaths) {
    const candidates = [
      process.env.ROBOS_LIB_PATH && rel.startsWith('robos-lib/') && path.join(process.env.ROBOS_LIB_PATH, rel.slice('robos-lib/'.length)),
      path.resolve(__dirname, '..', rel),
      path.join('/usr/local/share/robos', rel),
    ].filter(Boolean);
    for (const p of candidates) {
      try { return require(p); } catch {}
    }
  }
  return null;
}

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
const castService = new CastService();
const mediaLibrary = new MediaLibrary();
castService.mediaLibrary = mediaLibrary;
castService.cloudStorage = cloud;
const libraryFolders = new LibraryFolders({ mediaLibrary, cloud, castService });

// Refresh cloud track stream URLs once CastService streamServer allocates its port,
// and migrate any legacy cloud tracks stored under ~/.cache/robos/audio-player/cloud/
function refreshCloudTrackUrls() {
  if (!castService.streamPort) return;
  let updated = false;
  for (const track of mediaLibrary.tracks) {
    if (!track.cloud && track.filePath && track.filePath.startsWith(cloud.CACHE_ROOT + path.sep)) {
      const rel = path.relative(cloud.CACHE_ROOT, track.filePath);
      const parts = rel.split(path.sep);
      if (parts.length >= 2) {
        const connId = parts[0];
        const remotePath = '/' + parts.slice(1).join('/');
        track.cloud = {
          connectionId: connId,
          driverType: 'gdrive',
          remotePath,
          driveId: null,
          size: fs.existsSync(track.filePath) ? fs.statSync(track.filePath).size : null,
          cached: fs.existsSync(track.filePath),
        };
        updated = true;
      }
    }
    if (track.cloud) {
      track.cloud.cached = cloud.isTrackCached(track.filePath, track.cloud.size);
      const nextSrc = castService.getCloudStreamUrl(track.id, false);
      if (track.src !== nextSrc) {
        track.src = nextSrc;
        updated = true;
      }
    }
  }
  if (updated) {
    mediaLibrary._saveCache();
  }
}

setTimeout(refreshCloudTrackUrls, 200);
try { cloud.enforceCacheLimit(); } catch {}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
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

// Large libraries batch their cache writes; make sure the last one lands.
app.on('before-quit', () => {
  try { mediaLibrary.flush(); } catch {}
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── Background scan → renderer updates ─────────────────────────────────────

// Library payloads are large (100k tracks ≈ 30 MB over IPC) and rebuilding the
// renderer's browse index costs a few hundred ms, so during a scan the renderer
// receives progress a few times per second and the library itself only every few
// seconds, scaled to the library size.
const PROGRESS_INTERVAL_MS = 150;

function libraryPushInterval() {
  const n = mediaLibrary.tracks.length;
  return n < 5000 ? 1000 : n < 30000 ? 3000 : 6000;
}

function scanUpdates({ onDone } = {}) {
  let lastProgress = 0;
  let lastLibraryPush = 0;
  let pendingLibrary = null;
  const pushLibrary = () => {
    if (pendingLibrary) { clearTimeout(pendingLibrary); pendingLibrary = null; }
    lastLibraryPush = Date.now();
    sendToWindow('audio:library-scan-batch', { library: mediaLibrary.getLibrary() });
  };
  return {
    onDiscovered: (data) => sendToWindow('audio:library-scan-discovered', data),
    onProgress: (progress) => {
      const now = Date.now();
      if (now - lastProgress < PROGRESS_INTERVAL_MS && progress.current !== progress.total) return;
      lastProgress = now;
      sendToWindow('audio:library-scan-progress', { current: progress.current, total: progress.total, file: progress.file });
    },
    onBatch: () => {
      const wait = libraryPushInterval() - (Date.now() - lastLibraryPush);
      if (wait <= 0) pushLibrary();
      else if (!pendingLibrary) pendingLibrary = setTimeout(pushLibrary, wait);
    },
    onDone: (done) => {
      if (pendingLibrary) { clearTimeout(pendingLibrary); pendingLibrary = null; }
      if (onDone) onDone(done);
      sendToWindow('audio:library-scan-complete', { totalFound: done.totalFound, canceled: done.canceled, library: mediaLibrary.getLibrary() });
    },
    onError: (err) => {
      if (pendingLibrary) { clearTimeout(pendingLibrary); pendingLibrary = null; }
      sendToWindow('audio:library-scan-error', { error: err.message });
    },
  };
}

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
    let streamUrl;
    if (fs.existsSync(filePath)) {
      if (filePath.startsWith(cloud.CACHE_ROOT + path.sep)) {
        cloud.touchCacheFile(filePath);
      }
      streamUrl = castService.registerFile(filePath);
    } else {
      // Check if it's a cloud track that should be streamed on demand
      const cloudTrack = mediaLibrary.tracks.find(t => t.filePath === filePath && t.cloud);
      if (!cloudTrack) throw new Error('File does not exist: ' + filePath);
      streamUrl = castService.getCloudStreamUrl(cloudTrack.id, true);
    }
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
  if (filePath && filePath.startsWith(cloud.CACHE_ROOT + path.sep) && fs.existsSync(filePath)) {
    cloud.touchCacheFile(filePath);
    return true;
  }
  const cloudTrack = mediaLibrary.tracks.find(t => t.filePath === filePath && t.cloud);
  if (cloudTrack) return true; // Will be streamed on demand via /cloud-stream/:trackId
  return ensureFileAccessible(filePath);
});

ipcMain.handle('audio:get-library', async () => {
  refreshCloudTrackUrls();
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
  mediaLibrary.scanFoldersInBackground(res.filePaths, scanUpdates());

  return {
    canceled: false,
    started: true,
    folders: res.filePaths
  };
});

ipcMain.handle('audio:scan-folders', async (_evt, folders) => {
  if (!Array.isArray(folders) || !folders.length) return { canceled: true };
  mediaLibrary.scanFoldersInBackground(folders, scanUpdates());
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
  mediaLibrary.mergeTracks(quickTracks);

  if (dirs.length > 0) {
    mediaLibrary.scanFoldersInBackground(dirs, scanUpdates());
  }

  return {
    tracks: quickTracks,
    scanningDirs: dirs.length > 0,
    dirs,
    library: mediaLibrary.getLibrary()
  };
});

// ── Managed library folders (local + cloud) ────────────────────────────────

// Only attach the (potentially huge) library when the call changed tracks.
function folderState({ withLibrary = false } = {}) {
  const state = { folders: libraryFolders.list() };
  if (withLibrary) state.library = mediaLibrary.getLibrary();
  return state;
}

function scanLocalFolders(folders) {
  const paths = folders.filter(f => f.kind === 'local' && fs.existsSync(f.path)).map(f => f.path);
  if (!paths.length) return;
  mediaLibrary.scanFoldersInBackground(paths, scanUpdates({
    onDone: () => folders.forEach(f => f.kind === 'local' && libraryFolders.markSynced(f.id)),
  }));
}

async function syncCloudFolders(folders) {
  const results = [];
  for (const f of folders.filter(x => x.kind === 'cloud')) {
    try {
      results.push({ id: f.id, ...(await libraryFolders.syncCloud(f.id, (p) => sendToWindow('audio:cloud-progress', { ...p, folder: f.label }))) });
    } catch (err) {
      results.push({ id: f.id, error: err.message });
    }
  }
  return results;
}

ipcMain.handle('audio:folders-list', async () => folderState());

ipcMain.handle('audio:folders-add-local', async () => {
  if (!mainWindow) return { canceled: true };
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Add Music Folder(s) to Library',
    buttonLabel: 'Add Folder',
    properties: ['openDirectory', 'multiSelections', 'dontAddToRecent'],
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };
  const added = res.filePaths.map(p => libraryFolders.add({ kind: 'local', path: p }));
  scanLocalFolders(added);
  return { canceled: false, ...folderState() };
});

ipcMain.handle('audio:folders-add-cloud', async (_evt, { connectionId, path: remotePath, label }) => {
  try {
    const folder = libraryFolders.add({ kind: 'cloud', connectionId, path: remotePath, label });
    const [result] = await syncCloudFolders([folder]);
    if (result && result.error) return { ok: false, error: result.error, ...folderState({ withLibrary: true }) };
    return { ok: true, ...result, ...folderState({ withLibrary: true }) };
  } catch (err) {
    return { ok: false, error: err.message, ...folderState() };
  }
});

ipcMain.handle('audio:folders-rescan', async (_evt, id) => {
  const targets = id ? [libraryFolders.get(id)].filter(Boolean) : libraryFolders.folders.slice();
  scanLocalFolders(targets);
  const results = await syncCloudFolders(targets);
  const failed = results.filter(r => r.error);
  return { ok: !failed.length, error: failed.map(r => r.error).join('; ') || undefined, ...folderState({ withLibrary: true }) };
});

ipcMain.handle('audio:folders-rename', async (_evt, { id, label }) => {
  libraryFolders.rename(id, label);
  return folderState();
});

ipcMain.handle('audio:folders-remove', async (_evt, { id, removeTracks }) => {
  libraryFolders.remove(id, !!removeTracks);
  return folderState({ withLibrary: !!removeTracks });
});

ipcMain.handle('audio:get-lyrics', async (_evt, track) => lyrics.getLyrics(track));

// ── AI playlists & Virtual DJ (RobOS agent + RobOS voice) ──────────────────

const aiAgent = requireShared('robos-lib/ai-agent');
const aiJson = requireShared('robos-lib/ai-json');
const quickAsk = requireShared('robos-lib/quick-ask');
if (quickAsk && typeof quickAsk.registerQuickAskIPC === 'function') {
  try { quickAsk.registerQuickAskIPC(ipcMain); } catch {}
}

let ttsEngine = null;
function getTtsEngine() {
  if (!ttsEngine) {
    const mod = requireShared('voice-prompt/lib/tts-engine');
    if (mod && mod.TTSEngine) ttsEngine = new mod.TTSEngine();
  }
  return ttsEngine;
}

const AGENT_MISSING = 'RobOS agent tools are not installed (robos-lib/ai-agent). Install RobOS or set ROBOS_LIB_PATH.';
const askAgent = (prompt) => aiAgent.ask(prompt, { timeoutMs: 180000 });

ipcMain.handle('audio:ai-agent-info', async () => {
  if (!aiAgent) return { ok: false, error: AGENT_MISSING };
  try {
    const info = aiAgent.listProviders();
    return { ok: true, activeName: info.activeName, api: info.api || null };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('audio:ai-playlist-generate', async (_evt, { request, count, dj } = {}) => {
  if (!aiAgent) return { ok: false, error: AGENT_MISSING };
  try {
    return await aiPlaylist.generateAiPlaylist(
      { tracks: mediaLibrary.tracks, request, count, dj },
      {
        ask: askAgent,
        parseJson: aiJson && aiJson.parseAIJson,
        onProgress: (p) => sendToWindow('audio:ai-progress', p),
      }
    );
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('audio:dj-lines', async (_evt, { persona, upcoming } = {}) => {
  if (!aiAgent) return { ok: false, error: AGENT_MISSING, lines: {} };
  try {
    return await aiPlaylist.generateDjLines({ persona, upcoming }, { ask: askAgent, parseJson: aiJson && aiJson.parseAIJson });
  } catch (err) {
    return { ok: false, error: err.message, lines: {} };
  }
});

ipcMain.handle('audio:dj-voices', async () => {
  const tts = getTtsEngine();
  if (!tts) return { ok: false, voices: {} };
  try {
    return { ok: true, voices: await tts.listVoices() };
  } catch (err) {
    return { ok: false, error: err.message, voices: {} };
  }
});

// Renders a DJ line to an audio file. `voice` is "engine:voiceId" from audio:dj-voices.
ipcMain.handle('audio:dj-synthesize', async (_evt, { text, voice } = {}) => {
  const tts = getTtsEngine();
  if (!tts) return { ok: false, error: 'RobOS voice (voice-prompt) is not installed.' };
  try {
    const [engine, ...rest] = String(voice || '').split(':');
    const opts = engine && rest.length ? { engine, voice: rest.join(':') } : {};
    const res = await tts.synthesize(String(text || ''), opts);
    // The engine's last resort is a second of silence; treat that as "no voice available".
    if (!res || !res.ok || res.engine === 'fallback') return { ok: false, error: 'No text-to-speech engine produced audio.' };
    return { ok: true, filePath: res.filePath, durationMs: res.durationMs, engine: res.engine };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── Library browsing: cover art, play statistics, loved tracks ─────────────

async function waitForStreamPort(timeoutMs = 3000) {
  const started = Date.now();
  while (!castService.streamPort && Date.now() - started < timeoutMs) {
    await new Promise(r => setTimeout(r, 50));
  }
  return castService.streamPort;
}

// The renderer loads art over loopback; Cast speakers need the LAN address.
ipcMain.handle('audio:get-art-base', async () => {
  const port = await waitForStreamPort();
  if (!port) return { local: null, cast: null };
  return {
    local: `http://127.0.0.1:${port}/art/`,
    cast: `http://${castService.hostIp}:${port}/art/`,
  };
});

ipcMain.handle('audio:get-track-stats', async () => mediaLibrary.getStats());

ipcMain.handle('audio:record-play', async (_evt, trackId) => mediaLibrary.recordPlay(trackId));

ipcMain.handle('audio:set-loved', async (_evt, { ids, loved }) => mediaLibrary.setLoved(ids, loved));

ipcMain.handle('audio:show-in-folder', async (_evt, filePath) => {
  if (!filePath || typeof filePath !== 'string' || !fs.existsSync(filePath)) return { ok: false };
  shell.showItemInFolder(filePath);
  return { ok: true };
});

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
    const descriptors = await cloud.indexCloudAudio(id, paths || [], (p) => sendToWindow('audio:cloud-progress', p));
    const tracks = [];
    for (const desc of descriptors) {
      try {
        const trackId = mediaLibrary._generateTrackId(desc.localPath);
        const streamUrl = castService.getCloudStreamUrl(trackId, false);
        tracks.push(await mediaLibrary.buildCloudTrack(desc, streamUrl));
      } catch {}
    }
    mediaLibrary.mergeTracks(tracks);
    return { ok: true, added: tracks.length, library: mediaLibrary.getLibrary() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('audio:cloud-cache-stats', async () => cloud.getCacheStats());

ipcMain.handle('audio:cloud-cache-set-max', async (_evt, maxBytes) => {
  const stats = cloud.setMaxCacheBytes(maxBytes);
  refreshCloudTrackUrls();
  return stats;
});

ipcMain.handle('audio:cloud-cache-clear', async () => {
  const res = cloud.clearCache();
  refreshCloudTrackUrls();
  return res;
});

ipcMain.handle('audio:scan-default-library', async () => {
  const musicDir = path.join(os.homedir(), 'Music');
  if (!fs.existsSync(musicDir)) {
    fs.mkdirSync(musicDir, { recursive: true });
  }
  mediaLibrary.scanFoldersInBackground([musicDir], scanUpdates());
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



