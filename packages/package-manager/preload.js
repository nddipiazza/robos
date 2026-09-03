'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('packageManager', {
  getPackages: () => ipcRenderer.invoke('pkg-get-packages'),
  listBranches: () => ipcRenderer.invoke('pkg-list-branches'),
  switchBranch: (branchName) => ipcRenderer.invoke('pkg-switch-branch', branchName),
  startService: (id) => ipcRenderer.invoke('pkg-start-service', id),
  stopService: (id) => ipcRenderer.invoke('pkg-stop-service', id),
  probeHealth: (id) => ipcRenderer.invoke('pkg-health-probe', id),
});
