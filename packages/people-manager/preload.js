'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('peopleManager', {
  getTeams: () => ipcRenderer.invoke('people-get-teams'),
  addAgent: (teamId, agentData) => ipcRenderer.invoke('people-add-agent', teamId, agentData),
  assignMCP: (agentId, skill) => ipcRenderer.invoke('people-assign-mcp', agentId, skill),
});
