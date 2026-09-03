'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agentSession', {
  spawn: (taskId, options) => ipcRenderer.invoke('session-spawn', { taskId, options }),
  list: () => ipcRenderer.invoke('session-list'),
  inspect: (taskId) => ipcRenderer.invoke('session-inspect', taskId),
  sendCommand: (taskId, command) => ipcRenderer.invoke('session-command', { taskId, command }),
  terminate: (taskId) => ipcRenderer.invoke('session-terminate', taskId),
});
