const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const {
  ART_CACHE_DIR,
  getArtPath,
  readTrackMetadata,
  scanInWorker,
  loadLibrary,
  saveLibrary,
  loadStatsDisk,
  saveStatsDisk,
  loadPlaylists,
  savePlaylists,
  parseM3U,
  exportM3U,
  LibraryIndex
} = require('./lib/media-library');
const { CastService } = require('./lib/cast-service');
const { CloudStorageManager } = require('./lib/cloud-storage');
const { LibraryFoldersManager } = require('./lib/library-folders');
const { getLyrics, saveCustomSubtitles } = require('./lib/lyrics');
const { createControlServer } = require('./lib/control-server');
const { generateAiPlaylist, generateDjIntros } = require('./lib/ai-playlist');
const { enrichTracksMetadata } = require('./lib/ai-metadata');

let ttsEngine = null;
try {
  ttsEngine = require('/usr/local/share/robos/robos-voice/tts-engine');
} catch (_) {
  try {
    ttsEngine = require('../robos-voice/tts-engine');
  } catch (_) {}
}

let castClock = null;
try {
  castClock = require('/usr/local/share/robos/robos-lib/cast-clock');
} catch (_) {
  try {
    castClock = require('../robos-lib/cast-clock');
  } catch (_) {}
}

let castAmbient = null;
try {
  castAmbient = require('/usr/local/share/robos/robos-lib/cast-ambient');
} catch (_) {
  try {
    castAmbient = require('../robos-lib/cast-ambient');
  } catch (_) {}
}

let CastSpeakerWatcher = null;
try {
  ({ CastSpeakerWatcher } = require('/usr/local/share/robos/robos-lib/cast-speaker-watcher'));
} catch (_) {
  try {
    ({ CastSpeakerWatcher } = require('../robos-lib/cast-speaker-watcher'));
  } catch (_) {}
}

let mainWindow = null;
const castService = new CastService();
const libraryIndex = new LibraryIndex();
const cloudManager = new CloudStorageManager({
  libraryIndex,
  artDir: ART_CACHE_DIR
});
const foldersManager = new LibraryFoldersManager();
const speakerWatcher = CastSpeakerWatcher ? new CastSpeakerWatcher() : null;

const controlServer = createControlServer({
  getState: () => controlServer.getCachedState(),
  getLibraryTracks: () => libraryIndex.tracks,
  getPlaylists: () => loadPlaylists(),
  onCommand: async (cmd) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('audio:remote-command', cmd);
    }
    return { forwarded: true, action: cmd && cmd.action };
  }
});

// Ensure default sample videos are always indexed in the library so first launch has playable content
function seedInitialSampleTracks() {
  const playlists = loadPlaylists();
  const samplePlaylist = playlists.find(p => p.id === 'scifi-cinema');
  if (samplePlaylist && Array.isArray(samplePlaylist.tracks) && libraryIndex.tracks.length === 0) {
    libraryIndex.upsertTracks(samplePlaylist.tracks);
  }
}

// Hydrate library index + watch stats on startup
libraryIndex.loadStats(loadStatsDisk());
libraryIndex.setTracks(loadLibrary());
seedInitialSampleTracks();

function getAggregatePayload() {
  return {
    summary: libraryIndex.getSummary(),
    albums: libraryIndex.albums,
    artists: libraryIndex.artists,
    genres: libraryIndex.genres,
    decades: libraryIndex.decades,
    composers: libraryIndex.composers,
    folders: libraryIndex.folders
  };
}

function sendScanProgress(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('audio:scan-progress', payload);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 1020,
    minHeight: 660,
    title: 'RobOS Movie Player',
    backgroundColor: '#15120f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  try {
    const { registerSnapshotIPC, startDebugServer } = require('/usr/local/share/robos/robos-lib/dom-snapshot');
    registerSnapshotIPC(mainWindow);
    startDebugServer(mainWindow, 19213, 'movie-player');
  } catch (_) {
    try {
      const { registerSnapshotIPC, startDebugServer } = require('../robos-lib/dom-snapshot');
      registerSnapshotIPC(mainWindow);
      startDebugServer(mainWindow, 19213, 'movie-player');
    } catch (_) {}
  }

  castService.on('devices-updated', (devices) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('audio:cast-devices-updated', devices);
    }
  });

  castService.on('status', (status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('audio:cast-status', status);
    }
  });

  castService.startDiscovery();

  if (speakerWatcher) {
    speakerWatcher.on('takeover', (evt) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio:speaker-takeover', evt);
      }
    });
    speakerWatcher.on('speaker-state', (evt) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio:speaker-state', evt);
      }
    });
  }
}

// ── High-scale Library Query IPC ───────────────────────────────────────────

ipcMain.handle('audio:get-library', async () => {
  if (libraryIndex.tracks.length === 0) {
    const defaultDirs = [
      path.join(os.homedir(), 'Videos'),
      path.join(os.homedir(), 'Movies'),
      '/usr/share/backgrounds'
    ].filter(d => fs.existsSync(d));

    if (defaultDirs.length > 0) {
      await runBackgroundScan({ directories: defaultDirs });
    }
    seedInitialSampleTracks();
  }
  const initialPage = libraryIndex.queryTracks({ offset: 0, limit: 500, sortBy: 'title', sortDir: 'asc' });
  return {
    ...getAggregatePayload(),
    tracks: initialPage.tracks,
    total: initialPage.total
  };
});

ipcMain.handle('audio:get-library-summary', async () => {
  return getAggregatePayload();
});

ipcMain.handle('audio:query-tracks', async (_e, opts = {}) => {
  return libraryIndex.queryTracks(opts);
});

ipcMain.handle('audio:get-track', async (_e, id) => {
  return libraryIndex.byId.get(id) || null;
});

ipcMain.handle('audio:record-play', async (_e, trackId) => {
  const st = libraryIndex.recordPlay(trackId);
  saveStatsDisk(libraryIndex.exportStats());
  return st;
});

ipcMain.handle('audio:toggle-loved', async (_e, trackId, loved) => {
  const st = libraryIndex.toggleLoved(trackId, loved);
  saveStatsDisk(libraryIndex.exportStats());
  return st;
});

ipcMain.handle('audio:get-art-url', async (_e, artId) => {
  const p = getArtPath(artId);
  return p ? `file://${p}` : null;
});

ipcMain.handle('audio:get-lyrics', async (_e, trackId) => {
  const track = libraryIndex.byId.get(trackId);
  return getLyrics(track);
});

ipcMain.handle('movie:import-subtitles', async (_e, trackId) => {
  if (!trackId) return { ok: false, error: 'No active movie selected' };
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Subtitle File (.srt, .vtt, .lrc)',
    properties: ['openFile'],
    filters: [
      { name: 'Subtitle Files', extensions: ['srt', 'vtt', 'lrc', 'txt'] }
    ]
  });
  if (res.canceled || res.filePaths.length === 0) return { ok: false, canceled: true };
  const filePath = res.filePaths[0];
  const content = fs.readFileSync(filePath, 'utf8');
  const saved = saveCustomSubtitles(trackId, content);
  const track = libraryIndex.byId.get(trackId);
  if (track) {
    track.hasSubtitles = true;
    libraryIndex.upsertTracks([track]);
  }
  return { ok: true, subtitles: saved, filePath };
});

ipcMain.handle('movie:save-snapshot', async (_e, { dataUrl, title = 'movie-frame', timestamp = 0 } = {}) => {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    return { ok: false, error: 'Invalid frame snapshot data' };
  }
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  const buf = Buffer.from(base64, 'base64');
  const picturesDir = path.join(os.homedir(), 'Pictures', 'RobOS Movie Snapshots');
  fs.mkdirSync(picturesDir, { recursive: true });
  const safeTitle = String(title).replace(/[^a-z0-9-_]+/gi, '_').slice(0, 40) || 'frame';
  const timeStr = Math.floor(Number(timestamp) || 0);
  const outPath = path.join(picturesDir, `${safeTitle}_${timeStr}s_${Date.now()}.png`);
  fs.writeFileSync(outPath, buf);
  return { ok: true, path: outPath, bytes: buf.length };
});

async function runBackgroundScan({ directories = [], files = [] }) {
  sendScanProgress({ active: true, processed: 0, total: 0 });
  const res = await scanInWorker({
    directories,
    files,
    existingTracks: libraryIndex.tracks,
    onDiscovered: (total) => {
      sendScanProgress({ active: true, processed: 0, total });
    },
    onBatch: (batchMsg) => {
      libraryIndex.upsertTracks(batchMsg.tracks);
      sendScanProgress({
        active: true,
        processed: batchMsg.processed,
        total: batchMsg.total,
        reused: batchMsg.reused,
        parsed: batchMsg.parsed
      });
    }
  });
  saveLibrary(libraryIndex.tracks, true);
  sendScanProgress({ active: false, processed: res.total, total: res.total });
  return res;
}

ipcMain.handle('audio:scan-folders', async (_event, dirs) => {
  const targetDirs = Array.isArray(dirs) && dirs.length > 0
    ? dirs
    : [path.join(os.homedir(), 'Videos'), path.join(os.homedir(), 'Movies')];

  await runBackgroundScan({ directories: targetDirs });
  for (const d of targetDirs) foldersManager.markScanned(d);
  const page = libraryIndex.queryTracks({ offset: 0, limit: 500 });
  return {
    ...getAggregatePayload(),
    tracks: page.tracks,
    total: page.total
  };
});

// ── Managed Library Folders IPC ─────────────────────────────────────────────

ipcMain.handle('audio:folders-list', async () => {
  return foldersManager.listWithStats(libraryIndex);
});

ipcMain.handle('audio:folders-add', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Add Movie Library Folder',
    properties: ['openDirectory']
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  const dirPath = res.filePaths[0];
  foldersManager.addFolder(dirPath);
  await runBackgroundScan({ directories: [dirPath] });
  foldersManager.markScanned(dirPath);
  return {
    folders: foldersManager.listWithStats(libraryIndex),
    library: getAggregatePayload()
  };
});

ipcMain.handle('audio:folders-remove', async (_e, dirPath) => {
  if (!dirPath) return null;
  foldersManager.removeFolder(dirPath);
  const prefix = dirPath.endsWith(path.sep) ? dirPath : dirPath + path.sep;
  libraryIndex.removeByPredicate(t => t.source !== 'cloud' && t.path && (t.path === dirPath || t.path.startsWith(prefix)));
  saveLibrary(libraryIndex.tracks, true);
  return {
    folders: foldersManager.listWithStats(libraryIndex),
    library: getAggregatePayload()
  };
});

ipcMain.handle('audio:folders-rescan', async (_e, dirPath) => {
  const targets = dirPath
    ? [dirPath]
    : foldersManager.listWithStats(libraryIndex).map(f => f.path).filter(p => fs.existsSync(p));
  if (targets.length > 0) {
    await runBackgroundScan({ directories: targets });
    for (const d of targets) foldersManager.markScanned(d);
  }
  return {
    folders: foldersManager.listWithStats(libraryIndex),
    library: getAggregatePayload()
  };
});

ipcMain.handle('audio:pick-folder', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Movie Folder to Scan',
    properties: ['openDirectory', 'multiSelections']
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  await runBackgroundScan({ directories: res.filePaths });
  const page = libraryIndex.queryTracks({ offset: 0, limit: 500 });
  return {
    folders: res.filePaths,
    ...getAggregatePayload(),
    tracks: page.tracks,
    total: page.total
  };
});

ipcMain.handle('audio:pick-files', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Add Movie / Video Files',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Video & Movie Files', extensions: ['mp4', 'mkv', 'webm', 'mov', 'm4v', 'avi', 'ogv', 'ts', 'm2ts', 'mpg', 'mpeg', 'mp3', 'flac', 'wav'] }
    ]
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  await runBackgroundScan({ files: res.filePaths });
  const page = libraryIndex.queryTracks({ offset: 0, limit: 500 });
  return {
    ...getAggregatePayload(),
    tracks: page.tracks,
    total: page.total
  };
});

// ── Cloud Storage IPC (Google Drive, OneDrive, Dropbox, S3, SFTP) ──────────

ipcMain.handle('audio:cloud-sources', async () => {
  return {
    sources: cloudManager.loadConfiguredSources(),
    cache: cloudManager.getCacheStatus()
  };
});

ipcMain.handle('audio:cloud-browse', async (_e, sourceId, remotePath = '/') => {
  return cloudManager.browse(sourceId, remotePath);
});

ipcMain.handle('audio:cloud-index', async (_e, sourceId, remotePath = '/') => {
  const res = await cloudManager.indexSource(sourceId, remotePath, 4, (prog) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('audio:cloud-index-progress', { sourceId, ...prog });
    }
  });
  saveLibrary(libraryIndex.tracks, true);
  return {
    indexedCount: res.indexedCount,
    ...getAggregatePayload()
  };
});

ipcMain.handle('audio:cloud-remove-tracks', async (_e, sourceId) => {
  const removed = libraryIndex.removeByPredicate(t => t.source === 'cloud' && (!sourceId || t.sourceId === sourceId));
  saveLibrary(libraryIndex.tracks, true);
  return { removed, ...getAggregatePayload() };
});

ipcMain.handle('audio:cloud-stream-url', async (_e, trackId) => {
  const track = libraryIndex.byId.get(trackId);
  if (!track) throw new Error('Movie not found in library');
  if (track.source !== 'cloud') {
    return track.path.startsWith('http') ? track.path : `file://${track.path}`;
  }
  return cloudManager.getStreamUrl(track, '127.0.0.1');
});

ipcMain.handle('audio:cloud-cache-status', async () => {
  return cloudManager.getCacheStatus();
});

ipcMain.handle('audio:cloud-cache-set-max', async (_e, maxBytes) => {
  return cloudManager.setMaxCacheBytes(maxBytes);
});

ipcMain.handle('audio:cloud-cache-clear', async () => {
  return cloudManager.clearCache();
});

ipcMain.handle('audio:cloud-enrich-track', async (_e, trackId) => {
  const updated = await cloudManager.enrichTrackMetadata(trackId);
  saveLibrary(libraryIndex.tracks);
  return updated;
});

ipcMain.handle('audio:open-data-sources', async () => {
  const candidates = [
    '/usr/local/share/robos/data-sources',
    path.resolve(__dirname, '..', 'data-sources')
  ];
  const appPath = candidates.find(p => fs.existsSync(p));
  if (!appPath) return { launched: false };
  const child = spawn('electron', [appPath, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
  return { launched: true, appPath };
});

ipcMain.handle('audio:open-cloud-accounts', async () => {
  const candidates = [
    '/usr/local/share/robos/cloud-accounts',
    path.resolve(__dirname, '..', 'cloud-accounts')
  ];
  const appPath = candidates.find(p => fs.existsSync(p));
  if (!appPath) return { launched: false };
  const child = spawn('electron', [appPath, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
  return { launched: true, appPath };
});

// ── Playlists / Watchlists IPC ──────────────────────────────────────────────

ipcMain.handle('audio:get-playlists', async () => loadPlaylists());

ipcMain.handle('audio:save-playlists', async (_event, playlists) => {
  savePlaylists(playlists);
  return playlists;
});

ipcMain.handle('audio:import-m3u', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Import M3U / M3U8 Movie Watchlist',
    properties: ['openFile'],
    filters: [{ name: 'M3U Playlists', extensions: ['m3u', 'm3u8'] }]
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  const m3uPath = res.filePaths[0];
  const content = fs.readFileSync(m3uPath, 'utf8');
  const entries = parseM3U(content, path.dirname(m3uPath));

  const tracks = [];
  for (const entry of entries) {
    if (!entry.path.startsWith('http') && !entry.path.startsWith('cloud://') && fs.existsSync(entry.path)) {
      tracks.push(await readTrackMetadata(entry.path, { artDir: ART_CACHE_DIR }));
    } else {
      tracks.push({
        id: Buffer.from(entry.path).toString('base64').slice(0, 24),
        ...entry
      });
    }
  }

  const playlists = loadPlaylists();
  const imported = {
    id: `pl-${Date.now()}`,
    name: path.basename(m3uPath, path.extname(m3uPath)),
    description: `Imported from ${path.basename(m3uPath)}`,
    tracks
  };
  playlists.push(imported);
  savePlaylists(playlists);
  return { playlists, imported };
});

ipcMain.handle('audio:export-m3u', async (_event, playlist) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Watchlist as M3U',
    defaultPath: `${(playlist.name || 'watchlist').replace(/\s+/g, '-')}.m3u`,
    filters: [{ name: 'M3U Playlist', extensions: ['m3u'] }]
  });
  if (res.canceled || !res.filePath) return false;
  fs.writeFileSync(res.filePath, exportM3U(playlist));
  return res.filePath;
});

// ── AI Watchlist & Virtual Cinema Host IPC (Optional) ───────────────────────

ipcMain.handle('audio:ai-generate-playlist', async (_e, opts = {}) => {
  const built = await generateAiPlaylist({
    prompt: opts.prompt || '',
    libraryIndex,
    count: opts.count || 15,
    virtualDj: Boolean(opts.virtualDj),
    djStyle: opts.djStyle || 'warm classic cinema host'
  });

  if (opts.save !== false && built.tracks.length > 0) {
    const playlists = loadPlaylists();
    const created = {
      id: `ai-pl-${Date.now()}`,
      name: built.name,
      description: built.description,
      aiGenerated: true,
      prompt: opts.prompt || '',
      virtualDj: built.virtualDj,
      djStyle: built.djStyle,
      tracks: built.tracks
    };
    playlists.push(created);
    savePlaylists(playlists);
    return { ...built, playlist: created, playlists };
  }
  return built;
});

ipcMain.handle('audio:ai-generate-dj-intros', async (_e, opts = {}) => {
  return generateDjIntros({
    tracks: Array.isArray(opts.tracks) ? opts.tracks : [],
    playlistName: opts.playlistName || '',
    djStyle: opts.djStyle || 'warm classic cinema host'
  });
});

ipcMain.handle('audio:ai-dj-speak', async (_e, { text, voice } = {}) => {
  if (!text || !String(text).trim()) {
    return { ok: false, error: 'Empty cinema host line' };
  }
  if (!ttsEngine || typeof ttsEngine.synthesizeSpeech !== 'function') {
    return { ok: false, error: 'RobOS Voice TTS engine unavailable' };
  }
  try {
    const res = await ttsEngine.synthesizeSpeech(String(text).trim(), {
      voice: voice || 'af_heart',
      speed: 1.0
    });
    if (res && res.file && fs.existsSync(res.file)) {
      return {
        ok: true,
        fileUrl: `file://${res.file}`,
        filePath: res.file,
        engine: res.engine
      };
    }
    return { ok: false, error: 'TTS produced no audio file' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── AI & Open-Data Movie Metadata / Poster Fixer IPC ────────────────────────

ipcMain.handle('audio:ai-fix-metadata', async (_e, opts = {}) => {
  const {
    trackIds = null,
    scope = 'missing',
    useAi = true,
    generateFallbackArt = true,
    writeFileTags = false
  } = opts || {};

  let targets = [];
  if (Array.isArray(trackIds) && trackIds.length > 0) {
    const idSet = new Set(trackIds);
    targets = libraryIndex.tracks.filter(t => idSet.has(t.id));
  } else if (scope === 'all') {
    targets = libraryIndex.tracks.slice(0, 500);
  } else {
    const { trackNeedsFix } = require('./lib/ai-metadata');
    targets = libraryIndex.tracks.filter(t => {
      const check = trackNeedsFix(t);
      return check.needsMetadata || check.needsArt;
    }).slice(0, 500);
  }

  if (targets.length === 0) {
    return {
      total: 0,
      updatedCount: 0,
      artAddedCount: 0,
      results: [],
      library: getAggregatePayload()
    };
  }

  const res = await enrichTracksMetadata({
    tracks: targets,
    artDir: ART_CACHE_DIR,
    useAi: Boolean(useAi),
    generateFallbackArt: Boolean(generateFallbackArt),
    writeFileTags: Boolean(writeFileTags),
    onProgress: (prog) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio:fix-metadata-progress', prog);
      }
    }
  });

  libraryIndex.upsertTracks(res.tracks);
  saveLibrary(libraryIndex.tracks, true);

  const playlists = loadPlaylists();
  let playlistsUpdated = false;
  for (const pl of playlists) {
    if (!Array.isArray(pl.tracks)) continue;
    for (let i = 0; i < pl.tracks.length; i++) {
      const updated = libraryIndex.byId.get(pl.tracks[i].id);
      if (updated) {
        pl.tracks[i] = { ...pl.tracks[i], ...updated };
        playlistsUpdated = true;
      }
    }
  }
  if (playlistsUpdated) savePlaylists(playlists);

  return {
    total: res.total,
    updatedCount: res.updatedCount,
    artAddedCount: res.artAddedCount,
    results: res.results,
    playlists,
    library: getAggregatePayload()
  };
});

// ── Google Home / Smart TV / Chromecast LAN Cast IPC ────────────────────────

ipcMain.handle('audio:cast-devices', async () => {
  return castService.startDiscovery();
});

ipcMain.handle('audio:cast-add-manual', async (_event, { name, host, port, model }) => {
  return castService.addManualDevice({ name, host, port, model });
});

ipcMain.handle('audio:cast-track', async (_event, device, track, startTime) => {
  let resolvedTrack = track;
  if (track && track.source === 'cloud') {
    const localFile = await cloudManager.ensureCachedFile(track);
    resolvedTrack = { ...track, path: localFile };
  }
  return castService.castTrack(device, resolvedTrack, startTime);
});

ipcMain.handle('audio:cast-playlist', async (_event, device, tracks, startIndex = 0) => {
  const list = Array.isArray(tracks) ? tracks : [];
  const resolved = [];
  for (const t of list) {
    if (!t) continue;
    if (t.source === 'cloud') {
      const localFile = await cloudManager.ensureCachedFile(t);
      resolved.push({ ...t, path: localFile });
    } else {
      resolved.push(t);
    }
  }
  return castService.castQueue(device, resolved, startIndex, 0);
});

ipcMain.handle('audio:cast-test', async (_event, device) => {
  return castService.testSpeaker(device);
});

ipcMain.handle('audio:cast-control', async (_event, action, value) => {
  return castService.control(action, value);
});

ipcMain.handle('audio:cast-disconnect', async () => {
  castService.disconnect();
  return true;
});

ipcMain.handle('audio:cast-clock-start', async (_event, { device, style, format24h, chimeHourly }) => {
  if (!castClock) throw new Error('cast-clock library not available');
  return castClock.startClockCast(device, { style, format24h, chimeHourly });
});

ipcMain.handle('audio:cast-clock-stop', async () => {
  if (!castClock) return { active: false };
  return castClock.stopClockCast();
});

ipcMain.handle('audio:cast-clock-status', async () => {
  if (!castClock) return { active: false };
  return castClock.getClockStatus();
});

ipcMain.handle('audio:cast-ambient-start', async (_event, { device, presetId, durationSec }) => {
  if (!castAmbient) throw new Error('cast-ambient library not available');
  return castAmbient.startAmbientCast(device, { presetId, durationSec });
});

ipcMain.handle('audio:cast-ambient-stop', async () => {
  if (!castAmbient) return { active: false };
  return castAmbient.stopAmbientCast();
});

ipcMain.handle('audio:cast-ambient-status', async () => {
  if (!castAmbient) return { active: false };
  return castAmbient.getAmbientStatus();
});

ipcMain.handle('audio:speaker-watch-status', async () => {
  return speakerWatcher ? speakerWatcher.getStatus() : { watching: false, targets: [] };
});

ipcMain.handle('audio:speaker-watch-configure', async (_e, { enabled, devices, expectedUrlSubstring } = {}) => {
  if (!speakerWatcher) return { watching: false, targets: [] };
  if (typeof expectedUrlSubstring === 'string') {
    speakerWatcher.setExpectedStream(expectedUrlSubstring);
  }
  if (enabled && Array.isArray(devices) && devices.length > 0) {
    speakerWatcher.watchDevices(devices);
  } else if (enabled === false) {
    speakerWatcher.stop();
  }
  return speakerWatcher.getStatus();
});

ipcMain.handle('audio:report-state', async (_e, state) => {
  return controlServer.updateState(state);
});

app.whenReady().then(() => {
  controlServer.start().catch(() => {});
  createWindow();
});

app.on('before-quit', () => {
  castService.shutdown();
  cloudManager.shutdown();
  controlServer.stop();
  if (speakerWatcher) speakerWatcher.stop();
});

app.on('window-all-closed', () => {
  app.quit();
});
