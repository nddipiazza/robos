'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig:      ()         => ipcRenderer.invoke('pd-get-config'),
  saveConfig:     (cfg)      => ipcRenderer.invoke('pd-save-config', cfg),
  listPeople:     ()         => ipcRenderer.invoke('pd-list'),
  savePerson:     (person)   => ipcRenderer.invoke('pd-save-person', person),
  deletePerson:   (uid)      => ipcRenderer.invoke('pd-delete-person', uid),
  importLdif:     (text)     => ipcRenderer.invoke('pd-import-ldif', text),
  getMyProfile:   ()         => ipcRenderer.invoke('pd-get-my-profile'),
  setMyProfile:   (uid)      => ipcRenderer.invoke('pd-set-my-profile', uid),
});
