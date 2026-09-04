'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nosqlManager', {
  getConnections: () => ipcRenderer.invoke('nosql-get-connections'),
  getDocuments: (p) => ipcRenderer.invoke('nosql-get-documents', p),
  getRedisKeys: (p) => ipcRenderer.invoke('nosql-get-redis-keys', p),
  execRedisCmd: (p) => ipcRenderer.invoke('nosql-exec-redis-cmd', p),
});
