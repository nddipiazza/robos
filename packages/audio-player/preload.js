'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robosAudio', {
  discoverSpeakers: () => ipcRenderer.invoke('audio:discover-speakers'),
  getSpeakerStatus: (ip) => ipcRenderer.invoke('audio:get-speaker-status', ip),
  setSpeakerVolume: (ip, level, muted) => ipcRenderer.invoke('audio:set-speaker-volume', { ip, level, muted }),
  castFile: (ip, filePath, metadata) => ipcRenderer.invoke('audio:cast-file', { ip, filePath, metadata }),
  castUrl: (ip, url, metadata) => ipcRenderer.invoke('audio:cast-url', { ip, url, metadata }),
  castPause: (ip) => ipcRenderer.invoke('audio:cast-pause', ip),
  castResume: (ip) => ipcRenderer.invoke('audio:cast-resume', ip),
  castStop: (ip) => ipcRenderer.invoke('audio:cast-stop', ip),
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
  aiAgentInfo: () => ipcRenderer.invoke('audio:ai-agent-info'),
  aiPlaylistGenerate: (request, count, dj) => ipcRenderer.invoke('audio:ai-playlist-generate', { request, count, dj }),
  onAiProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('audio:ai-progress', handler);
    return () => ipcRenderer.removeListener('audio:ai-progress', handler);
  },
  djLines: (persona, upcoming) => ipcRenderer.invoke('audio:dj-lines', { persona, upcoming }),
  djVoices: () => ipcRenderer.invoke('audio:dj-voices'),
  djSynthesize: (text, voice) => ipcRenderer.invoke('audio:dj-synthesize', { text, voice }),
  listFolders: () => ipcRenderer.invoke('audio:folders-list'),
  addLocalFolder: () => ipcRenderer.invoke('audio:folders-add-local'),
  addCloudFolder: (connectionId, path, label) => ipcRenderer.invoke('audio:folders-add-cloud', { connectionId, path, label }),
  rescanFolders: (id) => ipcRenderer.invoke('audio:folders-rescan', id),
  renameFolder: (id, label) => ipcRenderer.invoke('audio:folders-rename', { id, label }),
  removeFolder: (id, removeTracks) => ipcRenderer.invoke('audio:folders-remove', { id, removeTracks }),
  cloudConnections: () => ipcRenderer.invoke('audio:cloud-connections'),
  cloudList: (id, path) => ipcRenderer.invoke('audio:cloud-list', { id, path }),
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
  onSpeakerPlaybackStopped: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('audio:speaker-playback-stopped', handler);
    return () => ipcRenderer.removeListener('audio:speaker-playback-stopped', handler);
  }
});

// Answers the <robos-ai-textarea> "?" button through the shared quick-ask handler.
contextBridge.exposeInMainWorld('robosQuickAsk', (question, context, contextFiles, onChunk, onDone, onError) => {
  ipcRenderer.invoke('robos-quick-ask', { question, context, contextFiles })
    .then(r => { if (r && r.ok) { onChunk(r.text); onDone(); } else onError((r && r.error) || 'No answer'); })
    .catch(e => onError(e.message));
});
