'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agentd', {
  listAgents:     ()                  => ipcRenderer.invoke('list-agents'),
  spawnAgent:     (taskId, options)  => ipcRenderer.invoke('spawn-agent', { taskId, options }),
  inspectAgent:   (taskId)            => ipcRenderer.invoke('inspect-agent', taskId),
  terminateAgent: (taskId)            => ipcRenderer.invoke('terminate-agent', taskId),
  wipeAll:        ()                  => ipcRenderer.invoke('wipe-all'),
  appendLog:      (taskId, line)      => ipcRenderer.invoke('append-log', { taskId, line }),
});
