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
  scanDefaultLibrary: () => ipcRenderer.invoke('audio:scan-default-library'),
  onLibraryScanProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('audio:library-scan-progress', handler);
    return () => ipcRenderer.removeListener('audio:library-scan-progress', handler);
  },
  onSpeakerStatusChange: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('audio:speaker-status-change', handler);
    return () => ipcRenderer.removeListener('audio:speaker-status-change', handler);
  }
});
