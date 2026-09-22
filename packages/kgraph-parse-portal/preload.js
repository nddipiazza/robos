'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robosApi', {
  getStatus: () => ipcRenderer.invoke('portal:get-status'),
  parseResource: (data) => ipcRenderer.invoke('portal:parse-resource', data),
  crawlDirectory: (data) => ipcRenderer.invoke('portal:crawl-directory', data),
  ingestToGraph: (data) => ipcRenderer.invoke('portal:ingest-to-graph', data),
  searchLuxir: (data) => ipcRenderer.invoke('portal:search-luxir', data),
  getRbeStatus: (endpoint) => ipcRenderer.invoke('portal:get-rbe-status', endpoint),
  generateRbeValues: (data) => ipcRenderer.invoke('portal:generate-rbe-values', data),
  registerRbeCluster: (data) => ipcRenderer.invoke('portal:register-rbe-cluster', data),
});
