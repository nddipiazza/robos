'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wsMcp', {
  list: () => ipcRenderer.invoke('ws-list'),
  getActive: () => ipcRenderer.invoke('ws-get-active'),
  create: (data) => ipcRenderer.invoke('ws-create', data),
  openIde: (id, ide) => ipcRenderer.invoke('ws-open-ide', { id, ide }),
  startDevServer: (id, port) => ipcRenderer.invoke('ws-start-devserver', { id, port }),
  rpc: (request) => ipcRenderer.invoke('ws-mcp-rpc', request),
});
