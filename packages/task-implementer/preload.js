'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  readSettings:    ()    => ipcRenderer.invoke('read-settings'),
  getServerInfo:   ()    => ipcRenderer.invoke('get-server-info'),
  listTasks:       (f)   => ipcRenderer.invoke('list-tasks', f),
  startAgent:      (p)   => ipcRenderer.invoke('start-agent', p),
  stopAgent:       (p)   => ipcRenderer.invoke('stop-agent', p),
  openUrl:         (url) => ipcRenderer.invoke('open-url', url),
  openTaskServers: ()    => ipcRenderer.invoke('open-task-servers'),

  onAgentStream: (cb) => ipcRenderer.on('agent-stream', (_, data) => cb(data)),
  onAgentDone:   (cb) => ipcRenderer.on('agent-done',   (_, data) => cb(data)),
  removeAgentListeners: () => {
    ipcRenderer.removeAllListeners('agent-stream');
    ipcRenderer.removeAllListeners('agent-done');
  },
});
