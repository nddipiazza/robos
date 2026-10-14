'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robosAudio', {
  discoverSpeakers: () => ipcRenderer.invoke('audio:discover-speakers'),
  getSpeakerStatus: (ip) => ipcRenderer.invoke('audio:get-speaker-status', ip),
  setSpeakerVolume: (ip, level, muted) => ipcRenderer.invoke('audio:set-speaker-volume', { ip, level, muted }),
  castFile: (ip, filePath, metadata) => ipcRenderer.invoke('audio:cast-file', { ip, filePath, metadata }),
  castUrl: (ip, url, metadata) => ipcRenderer.invoke('audio:cast-url', { ip, url, metadata }),
  castTTS: (ip, text, metadata) => ipcRenderer.invoke('audio:cast-tts', { ip, text, metadata }),
  castPause: (ip) => ipcRenderer.invoke('audio:cast-pause', ip),
  castResume: (ip) => ipcRenderer.invoke('audio:cast-resume', ip),
  castStop: (ip) => ipcRenderer.invoke('audio:cast-stop', ip),
  openFileDialog: () => ipcRenderer.invoke('audio:open-file-dialog'),
  getLibrary: () => ipcRenderer.invoke('audio:get-library'),
  selectLibraryFolder: () => ipcRenderer.invoke('audio:select-library-folder'),
  scanFolders: (folders) => ipcRenderer.invoke('audio:scan-folders', folders),
  cancelLibraryScan: () => ipcRenderer.invoke('audio:cancel-scan'),
  importPaths: (paths) => ipcRenderer.invoke('audio:import-paths', paths),
  scanDefaultLibrary: () => ipcRenderer.invoke('audio:scan-default-library'),
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
  }
});
