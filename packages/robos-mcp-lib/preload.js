'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mcp', {
  listServers: () => ipcRenderer.invoke('mcp-list-servers'),
  rpc: (request) => ipcRenderer.invoke('mcp-rpc', request),
});
