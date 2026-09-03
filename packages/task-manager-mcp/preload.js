'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('taskMcp', {
  list: (filters) => ipcRenderer.invoke('task-list', filters),
  get: (id) => ipcRenderer.invoke('task-get', id),
  create: (data) => ipcRenderer.invoke('task-create', data),
  advanceWorkflow: (id) => ipcRenderer.invoke('task-advance', id),
  addComment: (id, comment) => ipcRenderer.invoke('task-comment', { id, comment }),
  rpc: (request) => ipcRenderer.invoke('task-mcp-rpc', request),
});
