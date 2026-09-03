'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('devToolsMcp', {
  listTools: () => ipcRenderer.invoke('devtools-list'),
  checkTool: (toolId) => ipcRenderer.invoke('devtools-check', toolId),
  installTool: (toolId) => ipcRenderer.invoke('devtools-install', toolId),
  uninstallTool: (toolId) => ipcRenderer.invoke('devtools-uninstall', toolId),
  rpc: (request) => ipcRenderer.invoke('devtools-mcp-rpc', request),
});
