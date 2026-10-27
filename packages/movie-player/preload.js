'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robosAudio', {
  discoverSpeakers: (opts) => ipcRenderer.invoke('audio:discover-speakers', opts || {}),
  launchTvLibrary: (ip) => ipcRenderer.invoke('audio:launch-tv-library', ip),
  closeTvLibrary: (ip) => ipcRenderer.invoke('audio:close-tv-library', ip),
  getSpeakerStatus: (ip) => ipcRenderer.invoke('audio:get-speaker-status', ip),
  setSpeakerVolume: (ip, level, muted) => ipcRenderer.invoke('audio:set-speaker-volume', { ip, level, muted }),
  castFile: (ip, filePath, metadata) => ipcRenderer.invoke('audio:cast-file', { ip, filePath, metadata }),
  castUrl: (ip, url, metadata) => ipcRenderer.invoke('audio:cast-url', { ip, url, metadata }),
  castPause: (ip) => ipcRenderer.invoke('audio:cast-pause', ip),
  castResume: (ip) => ipcRenderer.invoke('audio:cast-resume', ip),
  castStop: (ip) => ipcRenderer.invoke('audio:cast-stop', ip),
  castSeek: (ip, seconds) => ipcRenderer.invoke('audio:cast-seek', { ip, seconds }),
  prefetchTrack: (filePath) => ipcRenderer.invoke('audio:prefetch-track', filePath),
  castStopAll: () => ipcRenderer.invoke('audio:cast-stop-all'),
  playTestChime: (ip) => ipcRenderer.invoke('audio:play-test-chime', ip),
  openFileDialog: () => ipcRenderer.invoke('audio:open-file-dialog'),
  ensureFileAccessible: (filePath) => ipcRenderer.invoke('audio:ensure-file-accessible', filePath),
  getLibrary: () => ipcRenderer.invoke('audio:get-library'),
  selectLibraryFolder: () => ipcRenderer.invoke('audio:select-library-folder'),
  scanFolders: (folders) => ipcRenderer.invoke('audio:scan-folders', folders),
  cancelLibraryScan: () => ipcRenderer.invoke('audio:cancel-scan'),
  importPaths: (paths) => ipcRenderer.invoke('audio:import-paths', paths),
  scanDefaultLibrary: () => ipcRenderer.invoke('audio:scan-default-library'),
  getLyrics: (track) => ipcRenderer.invoke('audio:get-lyrics', track),
  getArtBase: () => ipcRenderer.invoke('audio:get-art-base'),
  getTrackStats: () => ipcRenderer.invoke('audio:get-track-stats'),
  recordPlay: (trackId) => ipcRenderer.invoke('audio:record-play', trackId),
  setLoved: (ids, loved) => ipcRenderer.invoke('audio:set-loved', { ids, loved }),
  showInFolder: (filePath) => ipcRenderer.invoke('audio:show-in-folder', filePath),
  aiPlaylistGenerate: (request, count, dj, agent) => ipcRenderer.invoke('audio:ai-playlist-generate', { request, count, dj, agent }),
  aiFixMetadataPreview: (opts) => ipcRenderer.invoke('audio:ai-fix-metadata-preview', opts || {}),
  aiFixMetadataApply: (opts) => ipcRenderer.invoke('audio:ai-fix-metadata-apply', opts || {}),
  onAiProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('audio:ai-progress', handler);
    return () => ipcRenderer.removeListener('audio:ai-progress', handler);
  },
  djLines: (persona, upcoming, agent) => ipcRenderer.invoke('audio:dj-lines', { persona, upcoming, agent }),
  djVoices: () => ipcRenderer.invoke('audio:dj-voices'),
  djSynthesize: (text, voice, level) => ipcRenderer.invoke('audio:dj-synthesize', { text, voice, level }),
  djWarmup: () => ipcRenderer.invoke('audio:dj-warmup'),
  listFolders: () => ipcRenderer.invoke('audio:folders-list'),
  setFolderEnabled: (id, enabled) => ipcRenderer.invoke('audio:folders-set-enabled', { id, enabled }),
  onFoldersUpdated: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('audio:folders-updated', handler);
    return () => ipcRenderer.removeListener('audio:folders-updated', handler);
  },
  addLocalFolder: () => ipcRenderer.invoke('audio:folders-add-local'),
  addCloudFolder: (connectionId, path, label) => ipcRenderer.invoke('audio:folders-add-cloud', { connectionId, path, label }),
  rescanFolders: (id) => ipcRenderer.invoke('audio:folders-rescan', id),
  renameFolder: (id, label) => ipcRenderer.invoke('audio:folders-rename', { id, label }),
  removeFolder: (id, removeTracks) => ipcRenderer.invoke('audio:folders-remove', { id, removeTracks }),
  cloudConnections: () => ipcRenderer.invoke('audio:cloud-connections'),
  cloudList: (id, path, forceRefresh = false) => ipcRenderer.invoke('audio:cloud-list', { id, path, forceRefresh }),
  cloudImport: (id, paths) => ipcRenderer.invoke('audio:cloud-import', { id, paths }),
  cloudCacheStats: () => ipcRenderer.invoke('audio:cloud-cache-stats'),
  cloudCacheSetMax: (maxBytes) => ipcRenderer.invoke('audio:cloud-cache-set-max', maxBytes),
  cloudCacheClear: () => ipcRenderer.invoke('audio:cloud-cache-clear'),
  onCloudProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('audio:cloud-progress', handler);
    return () => ipcRenderer.removeListener('audio:cloud-progress', handler);
  },
  getPlaylists: () => ipcRenderer.invoke('audio:get-playlists'),
  getPlaylist: (id) => ipcRenderer.invoke('audio:get-playlist', id),
  createPlaylist: (data) => ipcRenderer.invoke('audio:create-playlist', data),
  updatePlaylist: (id, updates) => ipcRenderer.invoke('audio:update-playlist', { id, updates }),
  deletePlaylist: (id) => ipcRenderer.invoke('audio:delete-playlist', id),
  addTracksToPlaylist: (id, tracks) => ipcRenderer.invoke('audio:add-tracks-to-playlist', { id, tracks }),
  removeTrackFromPlaylist: (id, trackIndex) => ipcRenderer.invoke('audio:remove-track-from-playlist', { id, trackIndex }),
  reorderPlaylistTracks: (id, fromIndex, toIndex) => ipcRenderer.invoke('audio:reorder-playlist-tracks', { id, fromIndex, toIndex }),
  exportPlaylistM3u: (id) => ipcRenderer.invoke('audio:export-playlist-m3u', id),
  importPlaylistM3u: () => ipcRenderer.invoke('audio:import-playlist-m3u'),
  onLibraryScanDiscovered: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('audio:library-scan-discovered', handler);
    return () => ipcRenderer.removeListener('audio:library-scan-discovered', handler);
  },
  onLibraryScanProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('audio:library-scan-progress', handler);
    return () => ipcRenderer.removeListener('audio:library-scan-progress', handler);
  },
  onLibraryScanBatch: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('audio:library-scan-batch', handler);
    return () => ipcRenderer.removeListener('audio:library-scan-batch', handler);
  },
  onLibraryScanComplete: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('audio:library-scan-complete', handler);
    return () => ipcRenderer.removeListener('audio:library-scan-complete', handler);
  },
  onLibraryScanCanceled: (callback) => {
    const handler = (_event) => callback();
    ipcRenderer.on('audio:library-scan-canceled', handler);
    return () => ipcRenderer.removeListener('audio:library-scan-canceled', handler);
  },
  onLibraryScanError: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('audio:library-scan-error', handler);
    return () => ipcRenderer.removeListener('audio:library-scan-error', handler);
  },
  onSpeakerStatusChange: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('audio:speaker-status-change', handler);
    return () => ipcRenderer.removeListener('audio:speaker-status-change', handler);
  },
  // Calls from other RobOS apps (lib/control-server.js): `callback` answers each.
  onControlRequest: (callback) => {
    const handler = async (_event, { requestId, action, payload }) => {
      let result;
      try { result = await callback(action, payload); } catch (err) { result = { ok: false, error: err.message }; }
      ipcRenderer.invoke('audio:control-reply', { requestId, result });
    };
    ipcRenderer.on('audio:control-request', handler);
    return () => ipcRenderer.removeListener('audio:control-request', handler);
  },
  onSpeakerPlaybackStopped: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('audio:speaker-playback-stopped', handler);
    return () => ipcRenderer.removeListener('audio:speaker-playback-stopped', handler);
  }
});

// Provider catalog for the shared <robos-agent-selector> (same API as PR Review).
contextBridge.exposeInMainWorld('robosProviders', {
  list: (options) => ipcRenderer.invoke('audio:agent-providers', options),
});

// Skills catalog and @mention file typeahead for the shared <robos-ai-textarea>.
contextBridge.exposeInMainWorld('robos', {
  skillsList: () => ipcRenderer.invoke('robos-skills-list'),
  searchIndex: (prefix) => ipcRenderer.invoke('ap-list-path', prefix),
});

// Answers the <robos-ai-textarea> "?" button through the shared quick-ask handler.
contextBridge.exposeInMainWorld('robosQuickAsk', (question, context, contextFiles, onChunk, onDone, onError) => {
  ipcRenderer.invoke('robos-quick-ask', { question, context, contextFiles })
    .then(r => { if (r && r.ok) { onChunk(r.text); onDone(); } else onError((r && r.error) || 'No answer'); })
    .catch(e => onError(e.message));
});
