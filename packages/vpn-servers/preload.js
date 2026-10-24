'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  getState: () => ipcRenderer.invoke('get-state'),
  saveAccount: input => ipcRenderer.invoke('save-account', input),
  deleteAccount: accountId => ipcRenderer.invoke('delete-account', accountId),
  setDefaultAccount: accountId => ipcRenderer.invoke('set-default-account', accountId),
  setAccountServer: payload => ipcRenderer.invoke('set-account-server', payload),
  syncProfiles: providerId => ipcRenderer.invoke('sync-profiles', providerId),
  importProfile: payload => ipcRenderer.invoke('import-profile', payload),
  addProvider: input => ipcRenderer.invoke('add-provider', input),
  openVpnSandbox: () => ipcRenderer.invoke('open-vpn-sandbox'),
});
