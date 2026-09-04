'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('topologyManager', {
  getTopology: () => ipcRenderer.invoke('top-get-topology'),
  saveTopology: (data) => ipcRenderer.invoke('top-save-topology', data),
  readContract: (contractPath) => ipcRenderer.invoke('top-read-contract', contractPath),
  importBackstage: (yaml) => ipcRenderer.invoke('top-import-backstage', yaml),
  exportC4: () => ipcRenderer.invoke('top-export-c4'),
  addDataSource: (ds) => ipcRenderer.invoke('top-add-datasource', ds),
});
