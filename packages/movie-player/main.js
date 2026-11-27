'use strict';

const { app, BrowserWindow, ipcMain, clipboard, dialog, shell, desktopCapturer, screen, session } = require('electron');
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
const { registerVideoSegments } = require('./lib/video-segments');

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
const videoSegments = registerVideoSegments({ app, ipcMain, getWindow: () => mainWindow, mediaLibrary });
castService.mediaLibrary = mediaLibrary;
castService.cloudStorage = cloud;
const libraryFolders = new LibraryFolders({ mediaLibrary, cloud, castService });
const publicMetadata = new PublicMetadataService({ mediaLibrary, castService });

// ── Cloud library & watch history ───────────────────────────────────────────
// What you watch is also kept in ~/.config/robos/media-history/movie-player.json, keyed by
// show/season/episode or movie, so another computer can tell where you left off. When
// RobOS Preferences has a backup vault (for example on Google Drive), this player keeps
// its folders, playlists and that history synced with it (robos-lib/media-cloud-sync).
const mediaHistoryLib = requireShared('robos-lib/media-history');
const mediaCloudSyncLib = requireShared('robos-lib/media-cloud-sync');
const mediaServiceClientLib = requireShared('robos-lib/media-service-client');
const watchHistoryImportLib = requireShared('robos-lib/watch-history-import');
const CONFIG_DIR = path.join(process.env.HOME || os.homedir(), '.config', 'robos');
let mediaSync = null;
if (mediaHistoryLib) {
  try {
    mediaHistoryLib.attachHistory(mediaLibrary, { app: 'movie-player', onChange: () => mediaSync && mediaSync.notifyLocalChange() });
  } catch (err) { console.warn('[MoviePlayer] Watch history unavailable:', err.message); }
}

function applyHistoryFromOtherComputers() {
  if (typeof mediaLibrary.syncHistory !== 'function') return {};
  const changed = mediaLibrary.syncHistory();
  if (Object.keys(changed).length) sendToWindow('audio:track-stats-updated', changed);
  return changed;
}

// Another computer changed the library or the watch history and it just arrived here.
function onVaultPulled(rels) {
  if (rels.some(r => r.startsWith('config/media-history/'))) applyHistoryFromOtherComputers();
  if (rels.includes('config/movie-playlists.json')) {
    mediaLibrary._loadPlaylists();
    sendToWindow('audio:playlists-updated', mediaLibrary.getPlaylists());
  }
  if (rels.includes('config/movie-folders.json') || rels.includes('config/media-servers.json')) {
    libraryFolders.folders = libraryFolders._load();
    // A folder or RobOS Media Service added on the other computer has no tracks here yet: index it now.
    const fresh = libraryFolders.list().filter(f => f.syncEnabled !== false && (f.trackCount === 0 || f.kind === 'media-service'));
    scanLocalFolders(fresh);
    syncCloudFolders(fresh)
      .catch(err => console.warn('[MoviePlayer] Indexing folders from the vault failed:', err.message))
      .finally(() => sendToWindow('audio:folders-updated', folderState({ withLibrary: true })));
  }
}

function watchQueries() {
  if (!mediaHistoryLib) throw new Error('RobOS media history is not installed');
  const entries = mediaLibrary.history ? mediaLibrary.history.entries() : mediaHistoryLib.readEntries('movie-player');
  return { lib: mediaHistoryLib, entries, tracks: mediaLibrary.tracks };
}

// Marks a show, one season or one episode watched (or not) by name.
function setShowWatched({ show, season = null, episode = null, watched = true } = {}) {
  const { lib, tracks } = watchQueries();
  if (!show) return { ok: false, error: 'Say which show' };
  const found = lib.findEpisodeTracks(show, { tracks, season, episode });
  if (!found.tracks.length) return { ok: false, error: `No episodes of "${show}"${season !== null ? ` season ${season}` : ''}${episode !== null ? ` episode ${episode}` : ''} are in this library.` };
  const isWatched = watched !== false;
  const changed = mediaLibrary.setWatched(found.tracks.map(t => t.id), isWatched);
  sendToWindow('audio:track-stats-updated', changed);
  if (mediaServiceClientLib?.pushBatchProgressToMediaServer) {
    mediaServiceClientLib.pushBatchProgressToMediaServer(found.tracks.map(t => ({
      track: t,
      payload: { ...(changed[t.id] || {}), completed: isWatched, unwatched: !isWatched },
    }))).catch(() => {});
  }
  const scopeLabel = episode !== null
    ? ` Season ${season} Episode ${episode}`
    : (season !== null ? ` Season ${season}` : '');
  const spoken = isWatched
    ? `Marked ${found.show}${scopeLabel} (${found.tracks.length} episode${found.tracks.length === 1 ? '' : 's'}) as watched.`
    : `Marked ${found.show}${scopeLabel} (${found.tracks.length} episode${found.tracks.length === 1 ? '' : 's'}) as new and unwatched.`;
  return { ok: true, show: found.show, season, episode, watched: isWatched, count: found.tracks.length, spoken };
}

function addWatchlistItem({ query, title, show, kind = null } = {}) {
  const { lib, entries, tracks } = watchQueries();
  const q = String(query || title || show || '').trim();
  if (!q) return { ok: false, error: 'Say which show or movie to add to your watchlist.' };
  const target = lib.findWatchlistTarget(q, { tracks, entries, preferredKind: kind });
  if (!target.ok) return { ok: false, error: target.error, spoken: target.error };
  if (!target.tracks.length) {
    const error = `"${target.name}" is not in this computer's Movie Player library.`;
    return { ok: false, error, spoken: error };
  }
  const changed = mediaLibrary.setLoved(target.tracks.map(t => t.id), true);
  sendToWindow('audio:track-stats-updated', changed);
  if (mediaServiceClientLib?.pushBatchProgressToMediaServer) {
    mediaServiceClientLib.pushBatchProgressToMediaServer(target.tracks.map(t => ({
      track: t,
      payload: { ...(changed[t.id] || {}), loved: true },
    }))).catch(() => {});
  }
  const label = target.kind === 'movie' && target.year ? `${target.name} (${target.year})` : target.name;
  const spoken = `Added ${label} to your Movie Player watchlist.`;
  return { ok: true, action: 'added', kind: target.kind, name: target.name, year: target.year || null, count: target.tracks.length, spoken };
}

function removeWatchlistItem({ query, title, show, kind = null } = {}) {
  const { lib, entries, tracks } = watchQueries();
  const q = String(query || title || show || '').trim();
  if (!q) return { ok: false, error: 'Say which show or movie to remove from your watchlist.' };
  const target = lib.findWatchlistTarget(q, { tracks, entries, preferredKind: kind });
  if (!target.ok) return { ok: false, error: target.error, spoken: target.error };

  const changed = target.tracks.length ? mediaLibrary.dismissFromWatchlist(target.tracks.map(t => t.id)) : {};
  // Also mark portable history entries that have no local track as unloved + dismissed
  if (target.entryKeys && target.entryKeys.length) {
    try {
      const hFile = lib.historyFile('movie-player', CONFIG_DIR);
      const doc = lib.readDoc(hFile);
      const now = new Date().toISOString();
      let mutated = false;
      for (const k of target.entryKeys) {
        if (doc.entries && doc.entries[k]) {
          doc.entries[k] = {
            ...doc.entries[k],
            loved: false,
            lovedAt: null,
            inProgress: false,
            positionSec: 0,
            dismissedFromWatchlist: true,
            updatedAt: now,
          };
          mutated = true;
        }
      }
      if (mutated) {
        doc.updatedAt = now;
        lib.writeDoc(hFile, doc);
        if (mediaLibrary.history) mediaLibrary.history.reloadIfChanged();
      }
    } catch {}
  }

  sendToWindow('audio:track-stats-updated', changed);
  sendToWindow('audio:playlists-updated', mediaLibrary.getPlaylists());
  if (target.tracks.length && mediaServiceClientLib?.pushBatchProgressToMediaServer) {
    mediaServiceClientLib.pushBatchProgressToMediaServer(target.tracks.map(t => ({
      track: t,
      payload: {
        ...(changed[t.id] || {}),
        loved: false,
        inProgress: false,
        positionSec: 0,
        completed: Boolean(changed[t.id]?.completed),
        unwatched: !changed[t.id]?.completed,
        dismissedFromWatchlist: true,
      },
    }))).catch(() => {});
  }
  const label = target.kind === 'movie' && target.year ? `${target.name} (${target.year})` : target.name;
  const spoken = `Removed ${label} from your watchlist.`;
  return { ok: true, action: 'removed', kind: target.kind, name: target.name, year: target.year || null, count: target.tracks.length, spoken };
}

function markShowEpisodesNew({ show, query, season = null } = {}) {
  const { lib, entries, tracks } = watchQueries();
  const q = String(show || query || '').trim();
  if (!q) return { ok: false, error: 'Say which show to mark as new.' };
  const found = lib.findEpisodeTracks(q, { tracks, season: season !== null && season !== undefined ? Number(season) : null });
  if (!found.show && !found.tracks.length) {
    // Try movie fallback in case user said "mark Dune as new"
    const movieTarget = lib.findWatchlistTarget(q, { tracks, entries, preferredKind: 'movie' });
    if (movieTarget.ok && movieTarget.tracks.length) {
      const changed = mediaLibrary.setWatched(movieTarget.tracks.map(t => t.id), false);
      sendToWindow('audio:track-stats-updated', changed);
      if (mediaServiceClientLib?.pushBatchProgressToMediaServer) {
        mediaServiceClientLib.pushBatchProgressToMediaServer(movieTarget.tracks.map(t => ({
          track: t,
          payload: { unwatched: true, plays: 0, lastPlayed: null },
        }))).catch(() => {});
      }
      const spoken = `Marked ${movieTarget.name} as new and unwatched.`;
      return { ok: true, kind: 'movie', title: movieTarget.name, count: movieTarget.tracks.length, spoken };
    }
    const error = `I could not find "${q}" in your library.`;
    return { ok: false, error, spoken: error };
  }
  const changed = mediaLibrary.setWatched(found.tracks.map(t => t.id), false);
  sendToWindow('audio:track-stats-updated', changed);
  if (mediaServiceClientLib?.pushBatchProgressToMediaServer) {
    mediaServiceClientLib.pushBatchProgressToMediaServer(found.tracks.map(t => ({
      track: t,
      payload: { unwatched: true, plays: 0, lastPlayed: null },
    }))).catch(() => {});
  }
  const seasonLabel = season !== null && season !== undefined ? ` Season ${season}` : '';
  const spoken = `Marked all ${found.tracks.length} episode${found.tracks.length === 1 ? '' : 's'} of ${found.show}${seasonLabel} as new and unwatched.`;
  return { ok: true, kind: 'tv', show: found.show, season: season !== null && season !== undefined ? Number(season) : null, count: found.tracks.length, spoken };
}

function setShowCurrentEpisode({ show, query, ep = null, season = null, episode = null } = {}) {
  const { lib, entries, tracks } = watchQueries();
  const q = String(show || query || '').trim();
  if (!q) return { ok: false, error: 'Say which show.' };
  const epInput = ep !== null && ep !== undefined && String(ep).trim() !== ''
    ? ep
    : { season, episode };
  const plan = lib.planCurrentEpisode(q, epInput, { tracks, entries });
  if (!plan.ok) return plan;

  const watchedIds = plan.watchedTracks.map(t => t.id);
  const unwatchedIds = plan.unwatchedTracks.map(t => t.id);
  // If setting current episode to the very first episode (0 prior watched), ensure show stays on Watchlist
  const addLovedIds = watchedIds.length === 0 ? unwatchedIds : [];
  const changed = mediaLibrary.applyEpisodeCursor({ watchedIds, unwatchedIds, addLovedIds });
  sendToWindow('audio:track-stats-updated', changed);

  if (mediaServiceClientLib?.pushBatchProgressToMediaServer) {
    const batch = [
      ...plan.watchedTracks.map(t => ({
        track: t,
        payload: { ...(changed[t.id] || {}), completed: true, unwatched: false, inProgress: false, positionSec: 0 },
      })),
      ...plan.unwatchedTracks.map(t => ({
        track: t,
        payload: { ...(changed[t.id] || {}), completed: false, unwatched: true, inProgress: false, positionSec: 0, plays: 0, lastPlayed: null },
      })),
    ];
    if (batch.length) mediaServiceClientLib.pushBatchProgressToMediaServer(batch).catch(() => {});
  }

  return {
    ok: true,
    show: plan.show,
    targetSeason: plan.targetSeason,
    targetEpisode: plan.targetEpisode,
    targetCode: plan.targetCode,
    targetEpisodeTitle: plan.targetEpisodeTitle,
    watchedBeforeCount: plan.watchedBeforeCount,
    unwatchedFromCurrentCount: plan.unwatchedFromCurrentCount,
    spoken: plan.spoken,
  };
}

async function playNextEpisode({ show, targetIp = null } = {}) {
  const { lib, entries, tracks } = watchQueries();
  const status = lib.showStatus(show, { entries, tracks });
  if (!status.ok) return status;
  const next = status.nextUp;
  if (!next || !next.trackId) return { ok: false, error: status.finished ? `You're caught up on ${status.show}.` : `The next episode of ${status.show} is not in this library.`, status };
  const result = await controlHandlers.play({ trackIds: [next.trackId], targetIp });
  return { ...result, show: status.show, season: next.season, episode: next.episode, resume: next.resume, spoken: `Playing ${status.show} season ${next.season}, episode ${next.episode}${next.episodeTitle ? `, "${next.episodeTitle}"` : ''}${next.resume ? ', from where you left off' : ''}.` };
}

async function runWatchHistoryImport({ filePath = '', data = null, account = null, includeAudio = true, pushToServer = true } = {}) {
  if (!watchHistoryImportLib || typeof watchHistoryImportLib.importWatchHistory !== 'function') {
    return { ok: false, error: 'RobOS watch history importer is not installed.' };
  }
  const res = await watchHistoryImportLib.importWatchHistory(data || null, {
    filePath,
    account: account || null,
    includeAudio: includeAudio !== false,
    pushToServer: pushToServer !== false,
    configDir: CONFIG_DIR,
    movieLibrary: mediaLibrary,
  });
  if (!res.ok) return res;
  if (res.changedMovieStats && Object.keys(res.changedMovieStats).length) {
    sendToWindow('audio:track-stats-updated', res.changedMovieStats);
  } else {
    // Even if only portable history entries changed, notify renderer to reload watch history
    sendToWindow('audio:track-stats-updated', { __imported: { updatedAt: new Date().toISOString() } });
  }
  castService._saveStreamServerEndpoint();
  if (mediaSync) mediaSync.notifyLocalChange();
  const { changedMovieStats: _omit, ...clean } = res;
  return clean;
}

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
    if (targets.some(f => f.kind === 'cloud' || f.kind === 'peer' || f.kind === 'media-service')) {
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
  if (mediaCloudSyncLib && !process.env.ROBOS_MEDIA_SYNC_DISABLED) {
    mediaSync = mediaCloudSyncLib.startMediaCloudSync({
      category: 'movie-library',
      onPulled: onVaultPulled,
      onStatus: (s) => sendToWindow('audio:media-sync-status', s),
      log: (m) => console.log('[MoviePlayer]', m),
    });
  }
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
  try { mediaSync && mediaSync.stop(); } catch {}
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

const controlHandlers = {
    status: () => askRenderer('status'),
    speakClip: (clip) => askRenderer('speak-clip', clip, 60000),
    play: async (body = {}) => {
      refreshCloudTrackUrls();
      const byId = new Map(mediaLibrary.tracks.map(t => [t.id, t]));
      let tracks = [];
      if (Array.isArray(body.trackIds) && body.trackIds.length) {
        tracks = body.trackIds.map(id => byId.get(id)).filter(Boolean);
      } else if (Array.isArray(body.tracks) && body.tracks.length) {
        tracks = body.tracks.map(t => (t && byId.get(t.id)) || t).filter(Boolean);
      }
      if (!tracks.length) return { ok: false, error: 'No matching movies to play' };
      if ((!body.targetIp || body.targetIp === 'local') && mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
      }
      return askRenderer('play', {
        tracks,
        shuffle: Boolean(body.shuffle),
        keepFirst: Boolean(body.keepFirst),
        startAt: body.startAt !== undefined ? body.startAt : null,
        targetIp: body.targetIp || null,
        robosUser: body.robosUser || null,
      });
    },
    next: (body = {}) => askRenderer('next', { robosUser: body.robosUser || null }),
    previous: (body = {}) => askRenderer('previous', { robosUser: body.robosUser || null }),
    restart: (body = {}) => askRenderer('restart', { robosUser: body.robosUser || null }),
    pause: (body = {}) => askRenderer('pause', { robosUser: body.robosUser || null }),
    resume: (body = {}) => askRenderer('resume', { robosUser: body.robosUser || null }),
};

// Watch status: answered from the portable history and this library, no renderer needed.
//   GET  /api/watch-status?show=<name>       where you left off, what is next, per-season counts
//   GET  /api/movie-status?title=<name>      finished, in progress or not watched
//   GET  /api/continue-watching[?limit=n]    in-progress shows and movies
//   GET  /api/history[?kind=tv|movie&limit=n]
//   GET  /api/shows                          every show with watched / in-progress counts
//   GET  /api/media-sync                     last cloud sync of library and history
//   POST /api/set-watched      { show, season?, episode?, watched? }
//   POST /api/play-next-episode { show, targetIp? }
//   POST /api/media-sync-now
controlHandlers.queries = {
  '/api/watch-status': (q) => { const { lib, entries, tracks } = watchQueries(); return lib.showStatus(q.show || q.q || '', { entries, tracks }); },
  '/api/movie-status': (q) => { const { lib, entries, tracks } = watchQueries(); return lib.movieStatus(q.title || q.q || '', { entries, tracks }); },
  '/api/continue-watching': (q) => { const { lib, entries } = watchQueries(); return { ok: true, items: lib.continueWatching(entries, { limit: Number(q.limit) || 10 }) }; },
  '/api/watchlist': (q) => {
    const { lib, entries, tracks } = watchQueries();
    return lib.watchlistSummary({
      entries,
      tracks,
      stats: mediaLibrary.getStats(),
      playlists: mediaLibrary.getPlaylists(),
      limit: Number(q.limit) || 50,
    });
  },
  '/api/history': (q) => { const { lib, entries } = watchQueries(); return { ok: true, items: lib.recentHistory(entries, { kind: q.kind || undefined, limit: Number(q.limit) || 20 }) }; },
  '/api/shows': () => { const { lib, entries, tracks } = watchQueries(); return { ok: true, shows: lib.listShows({ entries, tracks }) }; },
  '/api/media-sync': () => ({ ok: true, ...(mediaSync ? mediaSync.status() : { outcome: 'unavailable' }) }),
};
controlHandlers.actions = {
  '/api/set-watched': (body) => setShowWatched(body),
  '/api/watchlist-add': (body) => addWatchlistItem(body),
  '/api/watchlist-remove': (body) => removeWatchlistItem(body),
  '/api/mark-episodes-new': (body) => markShowEpisodesNew(body),
  '/api/set-current-episode': (body) => setShowCurrentEpisode(body),
  '/api/import-watch-history': (body) => runWatchHistoryImport(body),
  '/api/play-next-episode': (body) => playNextEpisode(body),
  '/api/transfer-output': (body) => askRenderer('transfer-output', { targetIp: body.targetIp || 'local', robosUser: body.robosUser || null }),
  '/api/stop-cast': (body) => askRenderer('stop-cast', { targetIp: body.targetIp || null, robosUser: body.robosUser || null }),
  '/api/open-tv-library': async (body = {}) => {
    const ip = String(body.targetIp || '').trim();
    if (!ip) return { ok: false, error: 'No Smart TV IP specified' };
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
        if (raw.activeCinemaCast) raw.activeCinemaCast.active = false;
        fs.writeFileSync(cfgPath, JSON.stringify(raw, null, 2));
        castService._pushRokuCastToMediaServers({ active: false });
        if (tvInfo.platformId === 'roku-os') {
          castService._ensureRokuDevChannelLaunched(ip, tvInfo?.ports?.ecp || 8060);
        }
      }
      return { ok: true, ip, totalMovies: mediaLibrary.tracks.length };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },
  '/api/media-sync-now': async () => ({ ok: true, ...(mediaSync ? await mediaSync.runNow('manual') : { outcome: 'unavailable' }) }),
  '/api/media-service-reload': async () => {
    mediaLibrary._loadCache();
    libraryFolders.folders = libraryFolders._load();
    libraryFolders.list();
    sendToWindow('audio:folders-updated', folderState({ withLibrary: true }));
    return { ok: true, totalTracks: mediaLibrary.tracks.length };
  },
};

const controlServer = createControlServer({
  handlers: controlHandlers,
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

ipcMain.handle('audio:set-default-tv', async (_evt, target) => {
  try {
    const nabu = require(path.resolve(__dirname, '..', 'home-speaker', 'lib', 'nabu-command-router'));
    const res = nabu.setDefaultSmartTv(target || '', { configDir: CONFIG_DIR });
    return { ...res, speakers: castService.getPairedSmartTvs() };
  } catch (err) {
    return { ok: false, error: err.message };
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
      // Check if it's a cloud, P2P, or RobOS Media Service track that should be streamed on demand
      const remoteTrack = mediaLibrary.tracks.find(t => t.filePath === filePath && (t.cloud || t.peerStream || t.mediaService));
      if (!remoteTrack) throw new Error('File does not exist: ' + filePath);
      streamUrl = remoteTrack.cloud
        ? castService.getCloudStreamUrl(remoteTrack.id, true)
        : (remoteTrack.mediaService?.streamUrl || remoteTrack.peerStream?.streamUrl || remoteTrack.src);
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

  videoSegments.rememberOpened(tracks);
  return { canceled: false, tracks };
});

ipcMain.handle('audio:ensure-file-accessible', async (_evt, filePath) => {
  if (filePath && filePath.startsWith(cloud.CACHE_ROOT + path.sep) && fs.existsSync(filePath)) {
    cloud.touchCacheFile(filePath);
    return true;
  }
  const remoteTrack = mediaLibrary.tracks.find(t => t.filePath === filePath && (t.cloud || t.peerStream || t.mediaService));
  if (remoteTrack) return true; // Streamed on demand via /cloud-stream/:trackId or P2P /media/:id
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

async function indexLocalFiles(files) {
  const quickTracks = [];
  for (const f of files) {
    try {
      const track = await mediaLibrary.parseTrack(f);
      quickTracks.push(track);
    } catch {}
  }
  mediaLibrary.mergeTracks(quickTracks);
  return quickTracks;
}

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

  const quickTracks = await indexLocalFiles(files);

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

const mediaRecorder = requireShared('robos-lib/media-recorder');
mediaRecorder?.registerMediaRecorder({
  app, ipcMain, clipboard, shell, desktopCapturer, screen, session, getWindow: () => mainWindow,
  kind: 'video',
  directory: path.join(mediaLibrary.configDir, 'movie-player', 'recordings'),
  async index(file, { source, label }) {
    const [track] = await indexLocalFiles([file]);
    if (!track) throw new Error('The recording could not be indexed.');
    sendToWindow('audio:library-scan-batch', { library: mediaLibrary.getLibrary() });
    if (source === 'link' || label) enrichRecordedMovie(track.id);
    videoSegments.detect(track);
    return track;
  },
});

// ── Managed library folders (local + cloud) ────────────────────────────────

// Only attach the (potentially huge) library when the call changed tracks.
function folderState({ withLibrary = false } = {}) {
  const state = { folders: libraryFolders.list() };
  if (withLibrary) state.library = mediaLibrary.getLibrary();
  return state;
}

let activeMetadataSync;

function syncPublicMetadata(options) {
  const run = publicMetadata.syncAll(options);
  if (!activeMetadataSync) {
    activeMetadataSync = run;
    const clear = () => { activeMetadataSync = null; };
    run.then(clear, clear);
  }
  return run;
}

async function enrichRecordedMovie(trackId) {
  while (activeMetadataSync) await activeMetadataSync.catch(() => {});
  try {
    const result = await syncPublicMetadata({ trackIds: [trackId] });
    if (result.updatedTracks) sendToWindow('audio:library-scan-batch', { library: mediaLibrary.getLibrary() });
  } catch (err) {
    console.warn('[MoviePlayer] Recording metadata lookup failed:', err.message);
  }
}

function maybeAutoFetchPublicMetadata() {
  const needsSync = mediaLibrary.tracks.some(t => !t.artId || !t.overview);
  if (!needsSync || publicMetadata._running) return;
  syncPublicMetadata({
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
      applyHistoryFromOtherComputers();
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
  for (const f of folders.filter(x => x.kind === 'peer')) {
    try {
      results.push({ id: f.id, ...(await libraryFolders.syncPeer(f.id, (p) => sendToWindow('audio:cloud-progress', { ...p, folder: f.label }))) });
    } catch (err) {
      f.syncError = err.message;
      results.push({ id: f.id, error: err.message });
    }
  }
  for (const f of folders.filter(x => x.kind === 'media-service')) {
    try {
      results.push({ id: f.id, ...(await libraryFolders.syncMediaService(f.id, (p) => sendToWindow('audio:cloud-progress', { ...p, folder: f.label }))) });
    } catch (err) {
      f.syncError = err.message;
      results.push({ id: f.id, error: err.message });
    }
  }
  readCloudTagsInBackground();
  applyHistoryFromOtherComputers();
  await syncMediaServerProgress();
  maybeAutoFetchPublicMetadata();
  return results;
}

function getActivePeerBridgeInfo() {
  if (process.env.ROBOS_PEER_STREAM_URL) {
    return { endpoint: process.env.ROBOS_PEER_STREAM_URL, label: 'RobOS Private Network Peer' };
  }
  try {
    const bridgeFile = path.join(CONFIG_DIR, 'movie-player', 'active-peer-bridge.json');
    if (fs.existsSync(bridgeFile)) {
      const data = JSON.parse(fs.readFileSync(bridgeFile, 'utf8'));
      if (data && data.endpoint) {
        return {
          endpoint: data.endpoint,
          label: data.peerName ? `${data.peerName} (P2P Stream)` : 'RobOS Private Network Peer',
          peerNodeId: data.peerNodeId,
        };
      }
    }
  } catch {}
  return null;
}

ipcMain.handle('audio:folders-list', async () => folderState());

ipcMain.handle('audio:get-active-peer-bridge', async () => {
  return getActivePeerBridgeInfo();
});

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

ipcMain.handle('audio:folders-add-peer', async (_evt, { endpoint, label } = {}) => {
  try {
    let targetEndpoint = String(endpoint || '').trim();
    let targetLabel = label;

    if (!targetEndpoint) {
      const activeBridge = getActivePeerBridgeInfo();
      targetEndpoint = activeBridge ? activeBridge.endpoint : 'http://127.0.0.1:19225';
      if (!targetLabel && activeBridge?.label) targetLabel = activeBridge.label;
    }

    if (/^robos-(net|mesh):\/\//i.test(targetEndpoint)) {
      const appMeshMod = requireShared('robos-lib/app-mesh-engine');
      if (!appMeshMod) throw new Error('RobOS Private Networks engine not available');
      const engine = appMeshMod.createAppMeshEngine({ configDir: CONFIG_DIR });
      const joined = await engine.joinPrivateNetwork(targetEndpoint, {
        reverseMux: true,
        bridgeMoviePlayer: true,
      });
      if (!joined.movieBridge) {
        throw new Error('Joined Private Network, but could not bridge peer port 19215');
      }
      targetEndpoint = `http://127.0.0.1:${joined.movieBridge.localPort}`;
      targetLabel = targetLabel || `${joined.peer.name} (P2P Stream)`;
    }

    const folder = libraryFolders.add({ kind: 'peer', endpoint: targetEndpoint, label: targetLabel });
    const [result] = await syncCloudFolders([folder]);
    if (result && result.error) return { ok: false, error: result.error, ...folderState({ withLibrary: true }) };
    return { ok: true, ...result, ...folderState({ withLibrary: true }) };
  } catch (err) {
    return { ok: false, error: err.message, ...folderState() };
  }
});

ipcMain.handle('audio:media-services-list', async () => {
  try {
    if (!mediaServiceClientLib) return { ok: true, servers: [] };
    return await mediaServiceClientLib.listMediaServers();
  } catch (err) {
    return { ok: false, error: err.message, servers: [] };
  }
});

ipcMain.handle('audio:media-services-discover', async () => {
  try {
    if (!mediaServiceClientLib) return { ok: true, servers: [] };
    return await mediaServiceClientLib.discoverMediaServersOnLan();
  } catch (err) {
    return { ok: false, error: err.message, servers: [] };
  }
});

ipcMain.handle('audio:folders-add-media-service', async (_evt, { endpoint, label } = {}) => {
  try {
    const rawEndpoint = String(endpoint || '').trim();
    if (!rawEndpoint) throw new Error('Enter a RobOS Media Server URL or IP address');
    if (mediaServiceClientLib) {
      await mediaServiceClientLib.saveMediaServer({ url: rawEndpoint, name: label || undefined }, { syncNow: false });
    }
    const folder = libraryFolders.add({ kind: 'media-service', endpoint: rawEndpoint, label });
    const [result] = await syncCloudFolders([folder]);
    if (mediaSync) mediaSync.notifyLocalChange();
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
    const res = await syncPublicMetadata({
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

async function syncMediaServerProgress() {
  if (!mediaServiceClientLib?.pullProgressFromMediaServers) return {};
  try {
    const { changed } = await mediaServiceClientLib.pullProgressFromMediaServers({
      tracks: mediaLibrary.tracks,
      stats: mediaLibrary.stats,
      configDir: CONFIG_DIR,
    });
    if (changed && Object.keys(changed).length) {
      mediaLibrary._saveStats();
      if (mediaLibrary.history) {
        const items = [];
        for (const [id, st] of Object.entries(changed)) {
          const track = mediaLibrary.tracks.find(t => t && t.id === id);
          if (track) items.push({ track, stats: st });
        }
        if (items.length) mediaLibrary.history.recordMany(items);
      }
      sendToWindow('audio:track-stats-updated', changed);
      return changed;
    }
  } catch {}
  return {};
}

ipcMain.handle('audio:get-track-stats', async () => {
  await syncMediaServerProgress();
  return mediaLibrary.getStats();
});

ipcMain.handle('audio:record-play', async (_evt, trackId) => {
  const entry = mediaLibrary.recordPlay(trackId);
  const track = trackId && mediaLibrary.tracks.find(t => t && t.id === trackId);
  if (track && entry && mediaServiceClientLib?.pushProgressToMediaServer) {
    mediaServiceClientLib.pushProgressToMediaServer(track, entry).catch(() => {});
  }
  return entry;
});

ipcMain.handle('audio:set-loved', async (_evt, { ids, loved }) => mediaLibrary.setLoved(ids, loved));

function persistAndPushProgress({ trackId, positionSec, durationSec, completed, started } = {}) {
  const entry = mediaLibrary.saveProgress(trackId, { positionSec, durationSec, completed, started });
  const track = trackId && mediaLibrary.tracks.find(t => t && t.id === trackId);
  if (track && entry && mediaServiceClientLib?.pushProgressToMediaServer) {
    mediaServiceClientLib.pushProgressToMediaServer(track, entry).catch(() => {});
  }
  return entry;
}

ipcMain.handle('audio:save-progress', async (_evt, payload = {}) => {
  return persistAndPushProgress(payload);
});

ipcMain.on('audio:save-progress-sync', (evt, payload = {}) => {
  const entry = persistAndPushProgress(payload);
  evt.returnValue = entry || null;
});

ipcMain.handle('audio:set-watched', async (_evt, { ids, watched } = {}) => {
  const changed = mediaLibrary.setWatched(ids, watched);
  if (mediaServiceClientLib?.pushProgressToMediaServer) {
    for (const [id, st] of Object.entries(changed || {})) {
      const track = mediaLibrary.tracks.find(t => t && t.id === id);
      if (track) {
        mediaServiceClientLib.pushProgressToMediaServer(track, {
          ...st,
          completed: Boolean(watched),
          unwatched: !watched,
        }).catch(() => {});
      }
    }
  }
  castService._saveStreamServerEndpoint();
  return changed;
});

ipcMain.handle('audio:get-watch-history', async () => {
  await syncMediaServerProgress();
  applyHistoryFromOtherComputers();
  const portableEntries = mediaLibrary.history
    ? mediaLibrary.history.entries()
    : (mediaHistoryLib ? mediaHistoryLib.readEntries('movie-player', CONFIG_DIR) : {});
  return {
    ok: true,
    stats: mediaLibrary.getStats(),
    portableEntries: portableEntries || {},
  };
});

ipcMain.handle('audio:import-watch-history', async (_evt, opts = {}) => {
  let targetPath = opts && opts.filePath ? String(opts.filePath).trim() : '';
  const inlineData = opts && opts.data ? opts.data : null;

  if (!targetPath && !inlineData) {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { ok: false, canceled: true };
    }
    const defaultDir = fs.existsSync(path.join(os.homedir(), 'Downloads'))
      ? path.join(os.homedir(), 'Downloads')
      : os.homedir();
    const dlg = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Watch History (Plex, Tautulli, Trakt, Letterboxd, RobOS)',
      defaultPath: defaultDir,
      buttonLabel: 'Import Watch History',
      properties: ['openFile'],
      filters: [
        { name: 'Watch History Files (JSON, CSV, TSV)', extensions: ['json', 'csv', 'tsv'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (dlg.canceled || !dlg.filePaths.length) return { ok: false, canceled: true };
    targetPath = dlg.filePaths[0];
  }

  const res = await runWatchHistoryImport({
    filePath: targetPath,
    data: inlineData,
    account: opts?.account || null,
    includeAudio: opts?.includeAudio !== false,
  });
  if (!res.ok) return res;
  const portableEntries = mediaLibrary.history
    ? mediaLibrary.history.entries()
    : (mediaHistoryLib ? mediaHistoryLib.readEntries('movie-player', CONFIG_DIR) : {});
  return {
    ...res,
    stats: mediaLibrary.getStats(),
    portableEntries: portableEntries || {},
  };
});

ipcMain.handle('audio:clear-watch-history', async (_evt, { ids = [], keys = [] } = {}) => {
  const removedIds = mediaLibrary.clearWatchHistory(ids);
  if (mediaServiceClientLib?.pushProgressToMediaServer) {
    for (const id of removedIds) {
      const track = mediaLibrary.tracks.find(t => t && t.id === id);
      if (track) {
        mediaServiceClientLib.pushProgressToMediaServer(track, { unwatched: true }).catch(() => {});
      }
    }
  }
  if (mediaHistoryLib) {
    try {
      const hFile = mediaHistoryLib.historyFile('movie-player', CONFIG_DIR);
      const doc = mediaHistoryLib.readDoc(hFile);
      const keysToDelete = new Set(Array.isArray(keys) ? keys.filter(Boolean) : []);
      for (const id of removedIds) {
        const track = mediaLibrary.tracks.find(t => t && t.id === id);
        const mk = track && mediaHistoryLib.mediaKey(track);
        if (mk) keysToDelete.add(mk);
      }
      let mutated = false;
      for (const k of keysToDelete) {
        if (doc.entries && doc.entries[k]) {
          if (doc.entries[k].loved) {
            doc.entries[k] = {
              ...doc.entries[k],
              positionSec: 0,
              progressPct: 0,
              completed: false,
              inProgress: false,
              plays: 0,
              lastPlayed: null,
              updatedAt: new Date().toISOString(),
            };
          } else {
            delete doc.entries[k];
          }
          mutated = true;
        }
      }
      if (mutated) {
        doc.updatedAt = new Date().toISOString();
        fs.mkdirSync(path.dirname(hFile), { recursive: true });
        fs.writeFileSync(hFile, JSON.stringify(doc, null, 2) + '\n');
        if (mediaLibrary.history) mediaLibrary.history.reloadIfChanged();
      }
    } catch {}
  }
  return {
    ok: true,
    stats: mediaLibrary.getStats(),
    portableEntries: mediaLibrary.history ? mediaLibrary.history.entries() : {},
  };
});

// Watch status for the renderer (the same answers as the control API and the media MCP server).
ipcMain.handle('audio:watch-status', async (_evt, show) => { try { return controlHandlers.queries['/api/watch-status']({ show }); } catch (err) { return { ok: false, error: err.message }; } });
ipcMain.handle('audio:run-voice-command', async (_evt, rawCommand = '') => {
  try {
    const router = requireShared('home-speaker/lib/nabu-command-router');
    if (!router || typeof router.executeNabuCommand !== 'function') {
      return { ok: false, error: 'RobOS Voice router is not installed.' };
    }
    return await router.executeNabuCommand(String(rawCommand || ''), {
      configDir: CONFIG_DIR,
      autoLaunchPlayers: true,
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('audio:continue-watching', async (_evt, limit) => { try { return controlHandlers.queries['/api/continue-watching']({ limit }); } catch (err) { return { ok: false, error: err.message }; } });
ipcMain.handle('audio:media-sync-status', async () => controlHandlers.queries['/api/media-sync']());
ipcMain.handle('audio:media-sync-now', async () => controlHandlers.actions['/api/media-sync-now']());

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



