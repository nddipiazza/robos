'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dataSources', {
  getSourceWorkspace: () => ipcRenderer.invoke('ds-source-workspace'),
  getDrivers:         () => ipcRenderer.invoke('ds-get-drivers'),
  getDataSources:     () => ipcRenderer.invoke('ds-get-datasources'),
  saveDataSource:     (ds) => ipcRenderer.invoke('ds-save-datasource', ds),
  deleteDataSource:   (id) => ipcRenderer.invoke('ds-delete-datasource', id),
  testConnection:     (ds) => ipcRenderer.invoke('ds-test-connection', ds),
  inspectSchema:      (params) => ipcRenderer.invoke('ds-inspect-schema', params),
  executeQuery:       (params) => ipcRenderer.invoke('ds-execute-query', params),
  getCloudFolders:    () => ipcRenderer.invoke('ds-get-cloud-folders'),
  mountCloudFolder:   (params) => ipcRenderer.invoke('ds-mount-cloud-folder', params),
  unmountCloudFolder: (mountId) => ipcRenderer.invoke('ds-unmount-cloud-folder', mountId),
  createFolder:       (params) => ipcRenderer.invoke('ds-create-folder', params),
  uploadFiles:        (params) => ipcRenderer.invoke('ds-upload-files', params),
  downloadFile:       (params) => ipcRenderer.invoke('ds-download-file', params),
  detectGDriveMounts: () => ipcRenderer.invoke('ds-detect-gdrive-mounts'),
  pickLocalFolder:    () => ipcRenderer.invoke('ds-pick-local-folder'),
  pickKeyFile:        (params) => ipcRenderer.invoke('ds-pick-key-file', params),
  openLocalPath:      (localPath) => ipcRenderer.invoke('ds-open-local-path', localPath),
  googleOAuthSignIn:  (params) => ipcRenderer.invoke('ds-google-oauth-signin', params),
  openUrl:            (url) => ipcRenderer.invoke('open-url', url),
});
