'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadCollections: () => ipcRenderer.invoke('rest-load-collections'),
  sendRequest: (opts) => ipcRenderer.invoke('rest-send-request', opts),
  saveBru: (opts) => ipcRenderer.invoke('rest-save-bru', opts),
  aiGenerate: (prompt) => ipcRenderer.invoke('rest-ai-generate', prompt),
  getEnvironments: () => ipcRenderer.invoke('rest-get-environments'),
});
