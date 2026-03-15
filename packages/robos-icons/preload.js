'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listIcons:        ()        => ipcRenderer.invoke('ri-list-icons'),
  getIcon:          (appId)   => ipcRenderer.invoke('ri-get-icon', appId),
  updateIcon:       (appId)   => ipcRenderer.invoke('ri-update-icon', appId),
  syncDesktopFiles: ()        => ipcRenderer.invoke('ri-sync-desktop-files'),
  pushIcons:        ()        => ipcRenderer.invoke('ri-push-icons'),
  onPushProgress:   (cb)      => {
    ipcRenderer.removeAllListeners('ri-push-progress');
    ipcRenderer.on('ri-push-progress', (_, data) => cb(data));
  },
  readImage:        (path)    => ipcRenderer.invoke('ri-read-image', path),
  openDevConsole:   ()        => ipcRenderer.invoke('ri-open-dev-console'),
});
