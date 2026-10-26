'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  listAccounts: () => ipcRenderer.invoke('ca:list'),
  saveAccount: (acc) => ipcRenderer.invoke('ca:save', acc),
  updateSuites: (accountId, suites) => ipcRenderer.invoke('ca:update-suites', { accountId, suites }),
  deleteAccount: (accountId) => ipcRenderer.invoke('ca:delete', accountId),
  setDefaultAccount: (accountId) => ipcRenderer.invoke('ca:set-default', accountId),
  verifyAccount: (accountId) => ipcRenderer.invoke('ca:verify', accountId),
  startGoogleOAuth: (params) => ipcRenderer.invoke('ca:oauth-google', params),
  configureThunderbird: (payload) => ipcRenderer.invoke('ca:configure-thunderbird', payload),
  launchApp: (appId) => ipcRenderer.invoke('ca:launch-app', appId),
});
