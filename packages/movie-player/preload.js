const { contextBridge, ipcRenderer } = require('electron');

const api = {
  // Library & metadata (100k-item indexed query API)
  getLibrary: () => ipcRenderer.invoke('audio:get-library'),
  getLibrarySummary: () => ipcRenderer.invoke('audio:get-library-summary'),
  queryTracks: (opts) => ipcRenderer.invoke('audio:query-tracks', opts),
  getTrackById: (id) => ipcRenderer.invoke('audio:get-track', id),
  recordPlay: (id) => ipcRenderer.invoke('audio:record-play', id),
  toggleLoved: (id, loved) => ipcRenderer.invoke('audio:toggle-loved', id, loved),
  getArtUrl: (artId) => ipcRenderer.invoke('audio:get-art-url', artId),
  getLyrics: (trackId) => ipcRenderer.invoke('audio:get-lyrics', trackId),
  getSubtitles: (trackId) => ipcRenderer.invoke('audio:get-lyrics', trackId),
  importSubtitles: (trackId) => ipcRenderer.invoke('movie:import-subtitles', trackId),
  saveSnapshotFrame: (payload) => ipcRenderer.invoke('movie:save-snapshot', payload),
  scanFolders: (dirs) => ipcRenderer.invoke('audio:scan-folders', dirs),
  pickFolder: () => ipcRenderer.invoke('audio:pick-folder'),
  pickFiles: () => ipcRenderer.invoke('audio:pick-files'),
  onScanProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('audio:scan-progress', handler);
    return () => ipcRenderer.removeListener('audio:scan-progress', handler);
  },

  // Managed Library Folders
  listLibraryFolders: () => ipcRenderer.invoke('audio:folders-list'),
  addLibraryFolder: () => ipcRenderer.invoke('audio:folders-add'),
  removeLibraryFolder: (dirPath) => ipcRenderer.invoke('audio:folders-remove', dirPath),
  rescanLibraryFolder: (dirPath) => ipcRenderer.invoke('audio:folders-rescan', dirPath),

  // Cloud Storage (Google Drive, OneDrive, Dropbox, S3, SFTP)
  getCloudSources: () => ipcRenderer.invoke('audio:cloud-sources'),
  browseCloud: (sourceId, remotePath) => ipcRenderer.invoke('audio:cloud-browse', sourceId, remotePath),
  indexCloudSource: (sourceId, remotePath) => ipcRenderer.invoke('audio:cloud-index', sourceId, remotePath),
  removeCloudSourceTracks: (sourceId) => ipcRenderer.invoke('audio:cloud-remove-tracks', sourceId),
  getCloudStreamUrl: (trackId) => ipcRenderer.invoke('audio:cloud-stream-url', trackId),
  getCloudCacheStatus: () => ipcRenderer.invoke('audio:cloud-cache-status'),
  setCloudCacheMaxBytes: (maxBytes) => ipcRenderer.invoke('audio:cloud-cache-set-max', maxBytes),
  clearCloudCache: () => ipcRenderer.invoke('audio:cloud-cache-clear'),
  enrichCloudTrack: (trackId) => ipcRenderer.invoke('audio:cloud-enrich-track', trackId),
  openDataSourcesApp: () => ipcRenderer.invoke('audio:open-data-sources'),
  openCloudAccountsApp: () => ipcRenderer.invoke('audio:open-cloud-accounts'),
  onCloudIndexProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('audio:cloud-index-progress', handler);
    return () => ipcRenderer.removeListener('audio:cloud-index-progress', handler);
  },

  // Playlists / Watchlists
  getPlaylists: () => ipcRenderer.invoke('audio:get-playlists'),
  savePlaylists: (playlists) => ipcRenderer.invoke('audio:save-playlists', playlists),
  importM3U: () => ipcRenderer.invoke('audio:import-m3u'),
  exportM3U: (playlist) => ipcRenderer.invoke('audio:export-m3u', playlist),

  // AI Watchlist / Movie Marathon & Virtual Cinema Host (optional)
  generateAiPlaylist: (opts) => ipcRenderer.invoke('audio:ai-generate-playlist', opts),
  generateDjIntros: (opts) => ipcRenderer.invoke('audio:ai-generate-dj-intros', opts),
  synthesizeDjSpeech: (opts) => ipcRenderer.invoke('audio:ai-dj-speak', opts),

  // AI & Open-Data Movie Metadata / Poster Fixer
  fixTrackMetadata: (opts) => ipcRenderer.invoke('audio:ai-fix-metadata', opts),
  onFixMetadataProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('audio:fix-metadata-progress', handler);
    return () => ipcRenderer.removeListener('audio:fix-metadata-progress', handler);
  },

  // Google Home / Smart TV / Chromecast LAN Cast
  getCastDevices: () => ipcRenderer.invoke('audio:cast-devices'),
  addManualCastDevice: (info) => ipcRenderer.invoke('audio:cast-add-manual', info),
  castTrack: (device, track, startTime) => ipcRenderer.invoke('audio:cast-track', device, track, startTime),
  castPlaylist: (device, tracks, startIndex) => ipcRenderer.invoke('audio:cast-playlist', device, tracks, startIndex),
  testCastSpeaker: (device) => ipcRenderer.invoke('audio:cast-test', device),
  castControl: (action, value) => ipcRenderer.invoke('audio:cast-control', action, value),
  castDisconnect: () => ipcRenderer.invoke('audio:cast-disconnect'),
  castClockStart: (opts) => ipcRenderer.invoke('audio:cast-clock-start', opts),
  castClockStop: () => ipcRenderer.invoke('audio:cast-clock-stop'),
  castClockStatus: () => ipcRenderer.invoke('audio:cast-clock-status'),
  castAmbientStart: (opts) => ipcRenderer.invoke('audio:cast-ambient-start', opts),
  castAmbientStop: () => ipcRenderer.invoke('audio:cast-ambient-stop'),
  castAmbientStatus: () => ipcRenderer.invoke('audio:cast-ambient-status'),

  // Events from main process
  onCastDevicesUpdated: (cb) => {
    const handler = (_e, devices) => cb(devices);
    ipcRenderer.on('audio:cast-devices-updated', handler);
    return () => ipcRenderer.removeListener('audio:cast-devices-updated', handler);
  },
  onCastStatus: (cb) => {
    const handler = (_e, status) => cb(status);
    ipcRenderer.on('audio:cast-status', handler);
    return () => ipcRenderer.removeListener('audio:cast-status', handler);
  },

  // Companion app remote control sync
  reportPlaybackState: (state) => ipcRenderer.invoke('audio:report-state', state),
  onRemoteCommand: (cb) => {
    const handler = (_e, cmd) => cb(cmd);
    ipcRenderer.on('audio:remote-command', handler);
    return () => ipcRenderer.removeListener('audio:remote-command', handler);
  },

  // Live speaker takeover detector
  speakerWatchStatus: () => ipcRenderer.invoke('audio:speaker-watch-status'),
  speakerWatchConfigure: (opts) => ipcRenderer.invoke('audio:speaker-watch-configure', opts),
  onSpeakerTakeover: (cb) => {
    const handler = (_e, evt) => cb(evt);
    ipcRenderer.on('audio:speaker-takeover', handler);
    return () => ipcRenderer.removeListener('audio:speaker-takeover', handler);
  },
  onSpeakerState: (cb) => {
    const handler = (_e, evt) => cb(evt);
    ipcRenderer.on('audio:speaker-state', handler);
    return () => ipcRenderer.removeListener('audio:speaker-state', handler);
  }
};

contextBridge.exposeInMainWorld('robosMovie', api);
contextBridge.exposeInMainWorld('robosAudio', api);
