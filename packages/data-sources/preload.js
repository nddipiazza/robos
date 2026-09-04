'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dataSources', {
  getDrivers:      () => ipcRenderer.invoke('ds-get-drivers'),
  getDataSources:  () => ipcRenderer.invoke('ds-get-datasources'),
  saveDataSource:  (ds) => ipcRenderer.invoke('ds-save-datasource', ds),
  deleteDataSource:(id) => ipcRenderer.invoke('ds-delete-datasource', id),
  testConnection:  (ds) => ipcRenderer.invoke('ds-test-connection', ds),
  inspectSchema:   (params) => ipcRenderer.invoke('ds-inspect-schema', params),
  executeQuery:    (params) => ipcRenderer.invoke('ds-execute-query', params),
  openUrl:         (url) => ipcRenderer.invoke('open-url', url),
});
