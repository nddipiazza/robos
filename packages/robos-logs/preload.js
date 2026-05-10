'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('roboLogs', {
  listApps:  ()       => ipcRenderer.invoke('logs-list-apps'),
  read:      (opts)   => ipcRenderer.invoke('logs-read', opts),
  search:    (opts)   => ipcRenderer.invoke('logs-search', opts),
  tail:      (opts)   => ipcRenderer.invoke('logs-tail', opts),
  clear:     (appId)  => ipcRenderer.invoke('logs-clear', { appId }),
  getStats:  ()       => ipcRenderer.invoke('logs-get-stats'),
});
