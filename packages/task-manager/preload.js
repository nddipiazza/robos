'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('taskMgr', {
  listProcesses:  ()     => ipcRenderer.invoke('list-processes'),
  killProcesses:  (opts) => ipcRenderer.invoke('kill-processes', opts),
  minimize:       ()     => ipcRenderer.invoke('minimize'),
  close:          ()     => ipcRenderer.invoke('close'),
});
