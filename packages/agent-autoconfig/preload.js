'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agentAutoconfig', {
  getSupportedAgents: () => ipcRenderer.invoke('agent-get-supported'),
  getMCPConfig: (agentId) => ipcRenderer.invoke('agent-get-mcp-config', agentId),
  getAgentMarkdown: (agentId) => ipcRenderer.invoke('agent-get-markdown', agentId),
  sync: () => ipcRenderer.invoke('agent-sync'),
});
