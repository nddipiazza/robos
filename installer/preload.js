'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  getLatestRelease: () => ipcRenderer.invoke('get-latest-release'),
  listDrives: () => ipcRenderer.invoke('list-drives'),
  downloadISO: (url, filename) => ipcRenderer.invoke('download-iso', url, filename),
  flash: (isoPath, device) => ipcRenderer.invoke('flash', isoPath, device),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  onDownloadProgress: (cb) => ipcRenderer.on('download-progress', (_ev, data) => cb(data)),
  onFlashProgress: (cb) => ipcRenderer.on('flash-progress', (_ev, data) => cb(data)),
});
