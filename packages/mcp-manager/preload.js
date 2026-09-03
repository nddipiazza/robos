'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mcpManager', {
  getServers: () => ipcRenderer.invoke('mcp-get-servers'),
  callTool: (appId, toolName, args) => ipcRenderer.invoke('mcp-call-tool', { appId, toolName, args }),
  readResource: (appId, uri) => ipcRenderer.invoke('mcp-read-resource', { appId, uri }),
  getConfig: () => ipcRenderer.invoke('mcp-get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('mcp-save-config', cfg),
});
