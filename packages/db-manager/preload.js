'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dbManager', {
  getConnections: () => ipcRenderer.invoke('db-get-connections'),
  saveConnection: (c) => ipcRenderer.invoke('db-save-connection', c),
  getSchema: (p) => ipcRenderer.invoke('db-get-schema', p),
  getTableData: (p) => ipcRenderer.invoke('db-get-table-data', p),
  executeSql: (p) => ipcRenderer.invoke('db-execute-sql', p),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
});
