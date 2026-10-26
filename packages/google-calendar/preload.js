'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  getState: () => ipcRenderer.invoke('gcal:get-state'),
  previewConfig: (payload) => ipcRenderer.invoke('gcal:preview-config', payload),
  configureOnly: (payload) => ipcRenderer.invoke('gcal:configure-only', payload),
  installAndConfigure: (payload) => ipcRenderer.invoke('gcal:install-and-configure', payload),
  fetchOverview: (accountId) => ipcRenderer.invoke('gcal:fetch-overview', accountId),
  launchThunderbird: (mode) => ipcRenderer.invoke('gcal:launch-thunderbird', mode),
  startGoogleOAuth: (params) => ipcRenderer.invoke('gcal:oauth-google', params),
  launchApp: (appId) => ipcRenderer.invoke('gcal:launch-app', appId),
  onInstallLog: (cb) => ipcRenderer.on('gcal:install-log', (_, line) => cb(line)),
});
