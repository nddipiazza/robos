'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  readSettings:    ()        => ipcRenderer.invoke('read-settings'),
  getServerInfo:   ()        => ipcRenderer.invoke('get-server-info'),
  generateTasks:   (p)       => ipcRenderer.invoke('generate-tasks', p),
  createTasks:     (p)       => ipcRenderer.invoke('create-tasks', p),
  openUrl:         (url)     => ipcRenderer.invoke('open-url', url),
  openTaskServers: ()        => ipcRenderer.invoke('open-task-servers'),
});
