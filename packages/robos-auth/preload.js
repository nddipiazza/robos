'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listProviders:    ()         => ipcRenderer.invoke('auth-list-providers'),
  saveProvider:     (p)        => ipcRenderer.invoke('auth-save-provider', p),
  deleteProvider:   (id)       => ipcRenderer.invoke('auth-delete-provider', id),
  resetProviders:   ()         => ipcRenderer.invoke('auth-reset-providers'),
  getIdentity:      ()         => ipcRenderer.invoke('auth-get-identity'),
  setIdentityUid:   (uid)      => ipcRenderer.invoke('auth-set-identity-uid', uid),
});
