'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('topologyManager', {
  getTopology: () => ipcRenderer.invoke('top-get-topology'),
  importBackstage: (yaml) => ipcRenderer.invoke('top-import-backstage', yaml),
  exportC4: () => ipcRenderer.invoke('top-export-c4'),
});
