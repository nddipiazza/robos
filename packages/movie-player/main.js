'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const { CastService, audioMimeType, sniffAudioType } = require('./lib/cast-service');
const { MediaLibrary } = require('./lib/media-library');
const cloud = require('./lib/cloud-storage');
const { createTagQueue } = require('./lib/cloud-tags');
const lyrics = require('./lib/lyrics');
const { LibraryFolders } = require('./lib/library-folders');
const aiPlaylist = require('./lib/ai-playlist');
const aiMetadata = require('./lib/ai-metadata');
const { PublicMetadataService } = require('./lib/public-metadata');
const { createControlServer } = require('./lib/control-server');

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
  if (!filePath || typeof filePath !== 'string') return Promise.resolve(false);
  if (fs.existsSync(filePath)) return Promise.resolve(true);
  // If it's a GVFS SFTP mount that timed out or disconnected, attempt non-blocking auto-reconnect via gio mount
  const match = filePath.match(/\/run\/user\/\d+\/gvfs\/sftp:host=([^/]+)/);
  if (match) {
    const host = match[1];
    return new Promise((resolve) => {
      try {
        const proc = spawn('gio', ['mount', `sftp://${host}`], { stdio: 'ignore' });
        const timer = setTimeout(() => { try { proc.kill(); } catch {} resolve(false); }, 4000);
        proc.on('error', () => { clearTimeout(timer); resolve(false); });
        proc.on('close', () => { clearTimeout(timer); resolve(fs.existsSync(filePath)); });
      } catch {
        resolve(false);
      }
    });
  }
  return Promise.resolve(false);
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
app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (app.isReady()) createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});
const castService = new CastService();
const mediaLibrary = new MediaLibrary();
castService.mediaLibrary = mediaLibrary;
castService.cloudStorage = cloud;
const libraryFolders = new LibraryFolders({ mediaLibrary, cloud, castService });
const publicMetadata = new PublicMetadataService({ mediaLibrary, castService });

// Refresh cloud track stream URLs once CastService streamServer allocates its port,
// and migrate any legacy cloud tracks stored under ~/.cache/robos/audio-player/cloud/
function refreshCloudTrackUrls() {
  if (!castService.streamPort) return;
  const trackMap = new Map(mediaLibrary.tracks.map(t => [t.id, t]));
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
      if (track.cloud.cached === undefined) {
        track.cloud.cached = cloud.isTrackCached(track.filePath, track.cloud.size);
      }
      const nextSrc = castService.getCloudStreamUrl(track.id, false, trackMap.get(track.id));
      if (track.src !== nextSrc) {
        track.src = nextSrc;
        updated = true;
      }
    }
  }
  if (updated) {
    mediaLibrary._saveCacheSoon();
  }
  castService._saveStreamServerEndpoint();
}

// ── Cloud song tags ─────────────────────────────────────────────────────────
// Cloud songs are listed without downloading them, so their tags are read in the
// background, fetching only the bytes that hold them (lib/cloud-tags).
const cloudTagQueue = createTagQueue({
  read: (track) => mediaLibrary.refreshCloudTags(track, cloud.readRemoteRange),
  flush: () => {
    mediaLibrary._rebuildIndexes();
    mediaLibrary._saveCacheSoon();
    sendToWindow('audio:library-scan-batch', { library: mediaLibrary.getLibrary() });
  },
  flushMs: 2500,
  onAuthRequired: () => {}, // Data Sources already shows its "sign in" toast
});

function readCloudTagsInBackground(tracks = mediaLibrary.cloudTracksNeedingTags()) {
  if (tracks.length) cloudTagQueue.add(tracks);
}

castService.onCloudTrackCached = (track) => cloudTagQueue.add([track]);

setTimeout(refreshCloudTrackUrls, 200);
setTimeout(() => {
  mediaLibrary.upgradeCloudGuesses();
  readCloudTagsInBackground();
}, 3000);
try { cloud.enforceCacheLimit(); } catch {}

let debugServerStarted = false;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 840,
    minHeight: 580,
    backgroundColor: '#0d1117',
    title: 'RobOS Movie Player',
    icon: fs.existsSync(path.join(__dirname, 'icon.png')) ? path.join(__dirname, 'icon.png') : path.join(__dirname, 'icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  app.setName('robos-movie-player');

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Wire snapshot server on port 19214
  if (_debugServer) {
    try {
      if (typeof _debugServer.registerSnapshotIPC === 'function') {
        _debugServer.registerSnapshotIPC(mainWindow);
      }
      if (!debugServerStarted && typeof _debugServer.startDebugServer === 'function') {
        debugServerStarted = true;
        _debugServer.startDebugServer(mainWindow, 19214, 'movie-player');
      }
    } catch (e) {
      console.warn('[MoviePlayer] Could not start debug snapshot server:', e.message);
    }
  }

  mainWindow.webContents.once('did-finish-load', () => {
    libraryFolders.list();
    const now = Date.now();
    const targets = libraryFolders.folders.filter(f => {
      if (f.syncEnabled === false) return false;
      // Skip immediate re-walk on startup if this cloud folder was already synced within the last 5 minutes
      if (f.kind === 'cloud' && f.lastSynced && mediaLibrary.tracks.length > 0 && (now - new Date(f.lastSynced).getTime() < 5 * 60 * 1000)) {
        return false;
      }
      return true;
    });
    scanLocalFolders(targets);
    if (targets.some(f => f.kind === 'cloud')) {
      syncCloudFolders(targets).then(() => {
        sendToWindow('audio:folders-updated', folderState({ withLibrary: true }));
      }).catch(err => console.error('Startup folder check failed:', err.message));
    } else {
      sendToWindow('audio:folders-updated', folderState({ withLibrary: true }));
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  controlServer.start().catch(err => console.warn('[AudioPlayer] Control API unavailable:', err.message));
  try {
    const tvMod = requireShared('robos-lib/tv-engine');
    if (tvMod && typeof tvMod.createTvEngine === 'function') {
      const tvEngine = tvMod.createTvEngine({ appName: 'movie-player' });
      tvEngine.getPortalOwnership().then(async (own) => {
        if (!own.reachable) {
          await tvEngine.startPortalServer();
        } else if (own.stale && own.canRestart) {
          await tvEngine.restartPortal();
        }
      }).catch(() => {});
    }
  } catch {}

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Large libraries batch their cache writes; make sure the last one lands.
app.on('before-quit', () => {
  try { mediaLibrary.flush(); } catch {}
  try { controlServer.stop(); } catch {}
});

// ── Control API for other RobOS apps (lib/control-server.js) ────────────────

// The renderer owns playback, so each call is answered there.
const controlRequests = new Map(); // requestId → resolve
let controlRequestSeq = 0;
function askRenderer(action, payload = {}, timeoutMs = 15000) {
  if (!mainWindow || mainWindow.isDestroyed()) return Promise.resolve({ ok: false, error: 'The Audio Player window is closed' });
  const requestId = ++controlRequestSeq;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      controlRequests.delete(requestId);
      resolve({ ok: false, error: 'The Audio Player did not answer' });
    }, timeoutMs);
    controlRequests.set(requestId, (result) => { clearTimeout(timer); resolve(result); });
    mainWindow.webContents.send('audio:control-request', { requestId, action, payload });
  });
}

ipcMain.handle('audio:control-reply', async (_evt, { requestId, result } = {}) => {
  const resolve = controlRequests.get(requestId);
  controlRequests.delete(requestId);
  if (resolve) resolve(result || { ok: false });
  return true;
});

const controlServer = createControlServer({
  handlers: {
    status: () => askRenderer('status'),
    speakClip: (clip) => askRenderer('speak-clip', clip, 60000),
    pause: () => askRenderer('pause'),
    resume: () => askRenderer('resume'),
  },
  log: (entry) => console.warn('[AudioPlayer] control:', JSON.stringify(entry)),
});

app.on('window-all-closed', () => {
  try { mediaLibrary.flush(); } catch {}
  // Keep the background HTTP stream server (:19215) and Smart TV Portal (:19210) alive
  // so Smart TVs (Roku, LG, Samsung, Google TV) can continue browsing and streaming movies
  // with the TV remote even after the desktop window is closed.
  if (process.env.ROBOS_TEST === '1' || process.env.NODE_TEST_CONTEXT) {
    app.quit();
  }
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

ipcMain.handle('audio:launch-tv-library', async (_evt, ip) => {
  try {
    refreshCloudTrackUrls();
    castService._saveStreamServerEndpoint();
    const cfgPath = path.join(os.homedir(), '.config', 'robos', 'tv-studio.json');
    if (fs.existsSync(cfgPath)) {
      const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      const tvInfo = castService.speakers.get(ip) || (raw.tvs || []).find(t => t.ip === ip) || { ip, name: `Smart TV (${ip})`, platformId: 'roku-os' };
      raw.activeCinemaLibrary = {
        active: true,
        tvIp: ip,
        tvId: tvInfo.id || `tv-${ip}`,
        tvName: tvInfo.name || ip,
        platformId: tvInfo.platformId || 'roku-os',
        openedAt: new Date().toISOString(),
      };
      // Stop any currently playing video stream so the TV shows the interactive Library Browser
      if (raw.activeCinemaCast) {
        raw.activeCinemaCast.active = false;
      }
      fs.writeFileSync(cfgPath, JSON.stringify(raw, null, 2));
      if (tvInfo.platformId === 'roku-os') {
        castService._ensureRokuDevChannelLaunched(ip, tvInfo?.ports?.ecp || 8060);
      }
    }
    return {
      ok: true,
      ip,
      portalLibraryUrl: `http://${castService.hostIp}:19210/movie-player`,
      totalMovies: mediaLibrary.tracks.length,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('audio:close-tv-library', async (_evt, ip) => {
  try {
    const cfgPath = path.join(os.homedir(), '.config', 'robos', 'tv-studio.json');
    if (fs.existsSync(cfgPath)) {
      const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (raw.activeCinemaLibrary) {
        raw.activeCinemaLibrary.active = false;
        fs.writeFileSync(cfgPath, JSON.stringify(raw, null, 2));
      }
    }
    return { ok: true, ip };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('audio:get-active-cast', async () => {
  try {
    refreshCloudTrackUrls();
    return await castService.getOrReattachActiveCast((ip, status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio:speaker-status-change', { ip, status });
      }
    });
  } catch (err) {
    return { ok: false, active: false, error: err.message };
  }
});

ipcMain.handle('audio:discover-speakers', async (_evt, { scanLan = false } = {}) => {
  try {
    if (!scanLan) {
      const paired = castService.getPairedSmartTvs();
      if (paired && paired.length > 0) return paired;
    }
    return await castService.scanSubnet();
  } catch (err) {
    console.error('[MoviePlayer] Error scanning Smart TVs:', err);
    return castService.getPairedSmartTvs();
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
    const meta = { ...(metadata || {}), contentType: (metadata && metadata.contentType) || (fs.existsSync(filePath) ? sniffAudioType(filePath) : audioMimeType(filePath)) };
    return await castService.castMediaUrl(ip, streamUrl, meta, (status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio:speaker-status-change', { ip, status });
      }
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Downloads the next cloud song into the cache while the current one plays, so
// the change of song doesn't wait for it (a cache miss downloads the whole file).
ipcMain.handle('audio:prefetch-track', async (_evt, filePath) => {
  const track = filePath && mediaLibrary.tracks.find(t => t.filePath === filePath && t.cloud);
  if (!track) return { ok: false };
  if (cloud.isTrackCached(track.filePath, track.cloud.size)) return { ok: true, cached: true };
  try {
    await cloud.ensureTrackCached(track.cloud);
    track.cloud.cached = true;
    cloudTagQueue.add([track]);
    return { ok: true, cached: true };
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

ipcMain.handle('audio:cast-seek', async (_evt, { ip, seconds } = {}) => {
  if (!ip || ip === 'all') {
    const results = await Promise.all([...castService.activeConnections.keys()].map(i => castService.seekPlayback(i, seconds)));
    return { ok: results.some(r => r.ok) };
  }
  return castService.seekPlayback(ip, seconds);
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
    title: 'Select Movie / Video Files',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Movie & Media Files', extensions: ['mp4', 'mkv', 'webm', 'mov', 'm4v', 'avi', 'ogv', 'ts', 'm2ts', 'mpg', 'mpeg', 'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'] },
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

function maybeAutoFetchPublicMetadata() {
  const needsSync = mediaLibrary.tracks.some(t => !t.artId || !t.overview);
  if (!needsSync || publicMetadata._running) return;
  publicMetadata.syncAll({
    force: false,
    onProgress: (p) => sendToWindow('audio:metadata-fetch-progress', p),
  }).then(() => {
    sendToWindow('audio:library-scan-batch', { library: mediaLibrary.getLibrary() });
  }).catch(() => {});
}

function scanLocalFolders(folders) {
  const paths = folders.filter(f => f.kind === 'local' && fs.existsSync(f.path)).map(f => f.path);
  if (!paths.length) return;
  mediaLibrary.scanFoldersInBackground(paths, scanUpdates({
    onDone: () => {
      folders.forEach(f => f.kind === 'local' && libraryFolders.markSynced(f.id));
      maybeAutoFetchPublicMetadata();
    },
  }));
}

async function syncCloudFolders(folders) {
  const results = [];
  for (const f of folders.filter(x => x.kind === 'cloud')) {
    try {
      results.push({ id: f.id, ...(await libraryFolders.syncCloud(f.id, (p) => sendToWindow('audio:cloud-progress', { ...p, folder: f.label }))) });
    } catch (err) {
      f.syncError = err.message;
      results.push({ id: f.id, error: err.message });
    }
  }
  readCloudTagsInBackground();
  maybeAutoFetchPublicMetadata();
  return results;
}

ipcMain.handle('audio:folders-list', async () => folderState());

ipcMain.handle('audio:folders-set-enabled', async (_evt, { id, enabled }) => {
  try {
    const folder = libraryFolders.setEnabled(id, enabled);
    const results = enabled ? await syncCloudFolders([folder]) : [];
    if (enabled) scanLocalFolders([folder]);
    const failed = results.find(r => r.error);
    return { ok: !failed, error: failed?.error, ...folderState({ withLibrary: true }) };
  } catch (err) { return { ok: false, error: err.message, ...folderState() }; }
});

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
  const targets = id ? [libraryFolders.get(id)].filter(Boolean) : libraryFolders.folders.filter(f => f.syncEnabled !== false);
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

// The agent, model and effort come from <robos-agent-selector> (the RobOS provider
// catalog, same as PR Review), never from a fixed default.
const agentProviders = requireShared('robos-agent-client/providers');
const agentOneShot = requireShared('robos-agent-client/one-shot');
const aiJson = requireShared('robos-lib/ai-json');
const quickAsk = requireShared('robos-lib/quick-ask');
const skillCatalog = requireShared('robos-lib/skill-catalog');
if (quickAsk && typeof quickAsk.registerQuickAskIPC === 'function') {
  try { quickAsk.registerQuickAskIPC(ipcMain); } catch {}
}

ipcMain.handle('robos-skills-list', async () => {
  try {
    return skillCatalog && typeof skillCatalog.listSkills === 'function' ? skillCatalog.listSkills() : [];
  } catch {
    return [];
  }
});

ipcMain.handle('ap-list-path', async (_evt, prefix = '') => {
  try {
    const home = os.homedir();
    const expanded = String(prefix || '').replace(/^~/, home);
    const isDir = expanded.endsWith('/');
    const dir = isDir ? expanded : path.dirname(expanded);
    const partial = isDir ? '' : path.basename(expanded);
    if (!fs.existsSync(dir)) return { ok: true, items: [] };
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const items = entries
      .filter(e => !partial || e.name.toLowerCase().startsWith(partial.toLowerCase()))
      .slice(0, 12)
      .map(e => ({
        name: e.name + (e.isDirectory() ? '/' : ''),
        path: path.join(dir, e.name) + (e.isDirectory() ? '/' : ''),
      }));
    return { ok: true, items };
  } catch (err) {
    return { ok: false, items: [], error: err.message };
  }
});

let ttsEngine = null;
function getTtsEngine() {
  if (!ttsEngine) {
    const mod = requireShared('voice-prompt/lib/tts-engine');
    if (mod && mod.TTSEngine) ttsEngine = new mod.TTSEngine();
  }
  return ttsEngine;
}

const AGENT_MISSING = 'RobOS agent tools are not installed (robos-agent-client). Install RobOS or set ROBOS_LIB_PATH.';

function agentAsk(agent) {
  const { provider, model = '', effort = '' } = agent || {};
  return (prompt) => agentOneShot.ask({ provider, model, effort, prompt, timeoutMs: 240000 });
}

ipcMain.handle('audio:agent-providers', async (_evt, options) => {
  if (!agentProviders) return [];
  return agentProviders.options({ refresh: options?.refresh === true });
});

ipcMain.handle('audio:ai-playlist-generate', async (_evt, { request, count, dj, agent } = {}) => {
  if (!agentOneShot) return { ok: false, error: AGENT_MISSING };
  if (!agent || !agent.provider) return { ok: false, error: 'Choose an AI agent.' };
  try {
    return await aiPlaylist.generateAiPlaylist(
      { tracks: mediaLibrary.tracks, request, count, dj },
      {
        ask: agentAsk(agent),
        parseJson: aiJson && aiJson.parseAIJson,
        onProgress: (p) => sendToWindow('audio:ai-progress', p),
      }
    );
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('audio:fetch-public-metadata', async (_evt, { trackIds = null, force = false } = {}) => {
  try {
    const res = await publicMetadata.syncAll({
      trackIds,
      force: !!force,
      onProgress: (p) => sendToWindow('audio:metadata-fetch-progress', p),
    });
    const library = mediaLibrary.getLibrary();
    sendToWindow('audio:library-scan-batch', { library });
    return {
      ok: true,
      ...res,
      library,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('audio:cancel-public-metadata', async () => {
  return publicMetadata.cancel();
});

ipcMain.handle('audio:ai-fix-metadata-preview', async (_evt, { trackIds, scope = 'selected', prompt, agent, enableOpenLookup = true } = {}) => {
  if (!agentOneShot) return { ok: false, error: AGENT_MISSING };
  if (!agent || !agent.provider) return { ok: false, error: 'Choose an AI agent.' };
  try {
    let targetTracks = [];
    if (Array.isArray(trackIds) && trackIds.length > 0) {
      const idSet = new Set(trackIds);
      targetTracks = mediaLibrary.tracks.filter(t => idSet.has(t.id));
    } else if (scope === 'missing') {
      targetTracks = mediaLibrary.tracks.filter(t => aiMetadata.trackNeedsMetadataFix(t));
    } else {
      targetTracks = mediaLibrary.tracks.slice(0, 40);
    }

    if (!targetTracks.length) {
      return { ok: false, error: 'No tracks matched the selected scope.' };
    }

    const ask = agentAsk(agent);
    return await aiMetadata.previewAiMetadataFixes({
      tracks: targetTracks,
      prompt: prompt || aiMetadata.DEFAULT_FIX_METADATA_PROMPT,
      providerId: agent.provider,
      mediaLibrary,
      enableOpenLookup: enableOpenLookup !== false,
      onProgress: (p) => sendToWindow('audio:ai-progress', p),
      askFn: async (fullPrompt) => {
        const text = await ask(fullPrompt);
        return { ok: true, text: typeof text === 'string' ? text : (text && text.text) || '', providerId: agent.provider };
      },
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('audio:ai-fix-metadata-apply', async (_evt, { fixes, writeFiles = false } = {}) => {
  try {
    return await aiMetadata.applyAiMetadataFixes({
      fixes: Array.isArray(fixes) ? fixes : [],
      writeFiles: !!writeFiles,
      mediaLibrary,
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('audio:dj-lines', async (_evt, { persona, upcoming, agent } = {}) => {
  if (!agentOneShot) return { ok: false, error: AGENT_MISSING, lines: {} };
  if (!agent || !agent.provider) return { ok: false, error: 'Choose an AI agent in the Virtual DJ settings.', lines: {} };
  try {
    return await aiPlaylist.generateDjLines({ persona, upcoming }, { ask: agentAsk(agent), parseJson: aiJson && aiJson.parseAIJson });
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

// The voice the user set up in RobOS Voice ("engine:voiceId"), tried when the DJ's
// own voice can't be produced.
function robosVoicePref() {
  try {
    const file = process.env.ROBOS_VOICE_PREFS_FILE || path.join(os.homedir(), '.config', 'robos', 'voice-prompt-prefs.json');
    const tts = (JSON.parse(fs.readFileSync(file, 'utf8')) || {}).tts || {};
    return tts.engine ? `${tts.engine}:${tts.voice || ''}` : '';
  } catch { return ''; }
}

// DJ lines are rendered to a loud, level MP3 used both here and on speakers:
// - voice engines write quiet audio (and WAV, sometimes float, which speakers may
//   refuse; the voice cache also stores MP3s under .wav names);
// - a speaker plays the line at the music's volume, so its level must be in the file.
// The line is normalised to typical music loudness (-14 LUFS), then `level` (% of
// that; 100 = as loud as the music) is applied, with a limiter against clipping.
const DJ_LEVEL_DEFAULT = 150;
const djClipDir = path.join(os.tmpdir(), 'robos-dj-clips');
function djClip(filePath, level = DJ_LEVEL_DEFAULT) {
  const pct = Math.max(25, Math.min(300, Number(level) || DJ_LEVEL_DEFAULT));
  const gainDb = (20 * Math.log10(pct / 100)).toFixed(2);
  return new Promise((resolve) => {
    try {
      fs.mkdirSync(djClipDir, { recursive: true });
      const key = `${filePath}:${fs.statSync(filePath).mtimeMs}:${pct}`;
      const out = path.join(djClipDir, `${crypto.createHash('md5').update(key).digest('hex').slice(0, 16)}.mp3`);
      if (fs.existsSync(out) && fs.statSync(out).size > 0) return resolve(out);
      const filter = `loudnorm=I=-14:TP=-1.5:LRA=11,volume=${gainDb}dB,alimiter=limit=0.97:level=false`;
      const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', filePath, '-af', filter,
        '-ac', '2', '-ar', '44100', '-codec:a', 'libmp3lame', '-b:a', '160k', out], { stdio: 'ignore' });
      ff.on('error', () => resolve(filePath));
      ff.on('close', (code) => resolve(code === 0 && fs.existsSync(out) ? out : filePath));
    } catch { resolve(filePath); }
  });
}

// Start the voice engine (Kokoro loads its model in the background) before the
// first line is needed.
ipcMain.handle('audio:dj-warmup', async () => ({ ok: !!getTtsEngine() }));

// Renders a DJ line to an audio file. `voice` is "engine:voiceId" from audio:dj-voices.
ipcMain.handle('audio:dj-synthesize', async (_evt, { text, voice, level } = {}) => {
  const tts = getTtsEngine();
  if (!tts) return { ok: false, error: 'RobOS voice (voice-prompt) is not installed.' };
  const attempts = [String(voice || ''), robosVoicePref()].filter((v, i, a) => a.indexOf(v) === i);
  const problems = [];
  for (const choice of attempts) {
    try {
      const [engine, ...rest] = choice.split(':');
      const opts = engine ? { engine, voice: rest.join(':') || undefined, kokoroTimeoutMs: 60000 } : { kokoroTimeoutMs: 60000 };
      const res = await tts.synthesize(String(text || ''), opts);
      // The engine's last resort is a second of silence; treat that as "no voice".
      if (res && res.ok && res.engine !== 'fallback') {
        const clip = await djClip(res.filePath, level);
        return { ok: true, filePath: clip, castPath: clip, sourcePath: res.filePath, durationMs: res.durationMs, engine: res.engine };
      }
      for (const e of (res && res.errors) || []) problems.push(`${e.engine}: ${String(e.error).split('\n')[0].slice(0, 160)}`);
    } catch (err) {
      problems.push(err.message);
    }
  }
  const unique = [...new Set(problems)];
  return { ok: false, error: `No text-to-speech engine produced audio${unique.length ? ` — ${unique.join('; ')}` : ''}.` };
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

ipcMain.handle('audio:save-progress', async (_evt, { trackId, positionSec, durationSec, completed } = {}) => {
  const entry = mediaLibrary.saveProgress(trackId, { positionSec, durationSec, completed });
  return entry;
});

ipcMain.handle('audio:set-watched', async (_evt, { ids, watched } = {}) => {
  const changed = mediaLibrary.setWatched(ids, watched);
  castService._saveStreamServerEndpoint();
  return changed;
});

ipcMain.handle('audio:show-in-folder', async (_evt, filePath) => {
  if (!filePath || typeof filePath !== 'string' || !fs.existsSync(filePath)) return { ok: false };
  shell.showItemInFolder(filePath);
  return { ok: true };
});

// ── RobOS cloud storage (Data Sources FTP / SFTP connections) ───────────────

function sendToWindow(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

ipcMain.handle('audio:cloud-connections', async () => {
  const connections = cloud.listConnections();
  return connections.map(c => ({ ...c, folders: c.folders.map(f => ({ ...f,
    cloudKey: libraryFolders.cloudIdentity(c.id, f.remotePath, connections),
  })) }));
});

ipcMain.handle('audio:cloud-list', async (_evt, { id, path: remotePath, forceRefresh }) => {
  try {
    return { ok: true, ...(await cloud.list(id, remotePath, { forceRefresh: !!forceRefresh, strict: !!forceRefresh })) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('audio:cloud-import', async (_evt, { id, paths }) => {
  try {
    const descriptors = await cloud.indexCloudAudio(id, paths || [], (p) => sendToWindow('audio:cloud-progress', p));
    const tracks = [];
    const known = new Map(mediaLibrary.tracks.map(t => [t.filePath, t]));
    for (const desc of descriptors) {
      // Re-importing a song whose tags were already read keeps them.
      const had = known.get(desc.localPath);
      if (had && had.cloud && had.cloud.tagsRead) continue;
      try {
        const trackId = mediaLibrary._generateTrackId(desc.localPath);
        const streamUrl = castService.getCloudStreamUrl(trackId, false);
        tracks.push(await mediaLibrary.buildCloudTrack(desc, streamUrl));
      } catch {}
    }
    mediaLibrary.mergeTracks(tracks);
    readCloudTagsInBackground();
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
  const videosDir = path.join(os.homedir(), 'Videos');
  if (!fs.existsSync(videosDir)) {
    fs.mkdirSync(videosDir, { recursive: true });
  }
  mediaLibrary.scanFoldersInBackground([videosDir], scanUpdates());
  return { started: true, folder: videosDir };
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



