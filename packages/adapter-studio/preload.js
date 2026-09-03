'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getAdaptersStatus: () => ipcRenderer.invoke('adapter-get-status'),
  syncAll:           () => ipcRenderer.invoke('adapter-sync-all'),
  exportBackstage:   () => ipcRenderer.invoke('adapter-export-backstage'),
  switchBranch:      (b) => ipcRenderer.invoke('adapter-switch-branch', b),
});
