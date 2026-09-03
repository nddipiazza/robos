'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ekgMcp', {
  search: (query) => ipcRenderer.invoke('ekg-search', query),
  getNode: (path) => ipcRenderer.invoke('ekg-get-node', path),
  getLinked: (path) => ipcRenderer.invoke('ekg-get-linked', path),
  createNode: (data) => ipcRenderer.invoke('ekg-create-node', data),
  rpc: (request) => ipcRenderer.invoke('ekg-mcp-rpc', request),
});
