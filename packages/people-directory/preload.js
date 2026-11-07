'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig:       ()         => ipcRenderer.invoke('pd-get-config'),
  saveConfig:      (cfg)      => ipcRenderer.invoke('pd-save-config', cfg),
  listPeople:      ()         => ipcRenderer.invoke('pd-list'),
  savePerson:      (person)   => ipcRenderer.invoke('pd-save-person', person),
  deletePerson:    (uid)      => ipcRenderer.invoke('pd-delete-person', uid),
  importLdif:      (text)     => ipcRenderer.invoke('pd-import-ldif', text),
  getMyProfile:    ()         => ipcRenderer.invoke('pd-get-my-profile'),
  setMyProfile:    (uid)      => ipcRenderer.invoke('pd-set-my-profile', uid),
  pickPhoto:       (opts)     => ipcRenderer.invoke('pd-pick-photo', opts || {}),
  uploadPhoto:     (opts)     => ipcRenderer.invoke('pd-upload-photo', opts || {}),
  getPartySchema:  ()         => ipcRenderer.invoke('pd-get-party-schema'),
  launchPartyGame: ()         => ipcRenderer.invoke('pd-launch-party-game'),
  listAIProviders: ()         => ipcRenderer.invoke('pd-list-ai-providers'),
  aiAddPerson:     (prompt, providerId) => ipcRenderer.invoke('pd-ai-add-person', { prompt, providerId: providerId || null }),
  searchIndex:     (prefix)   => ipcRenderer.invoke('pd-list-path', prefix),
});
