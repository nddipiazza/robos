'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('routerApi', {
  rpc: (request) => ipcRenderer.invoke('router-rpc', request),
  getServers: () => ipcRenderer.invoke('router-get-servers'),
  getClaudeConfig: () => ipcRenderer.invoke('router-get-claude-config'),
});
