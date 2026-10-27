'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('partyGame', {
  getState: () => ipcRenderer.invoke('party:getState'),
  updateSettings: (patch) => ipcRenderer.invoke('party:updateSettings', patch),
  resetSettings: () => ipcRenderer.invoke('party:resetSettings'),
  selectTvs: (selection) => ipcRenderer.invoke('party:selectTvs', selection),
  openLobby: () => ipcRenderer.invoke('party:openLobby'),
  recast: () => ipcRenderer.invoke('party:recast'),
  addGuest: (name) => ipcRenderer.invoke('party:addGuest', name),
  removeGuest: (id) => ipcRenderer.invoke('party:removeGuest', id),
  getGuestSurvey: (id) => ipcRenderer.invoke('party:getGuestSurvey', id),
  submitSurvey: (id, answers) => ipcRenderer.invoke('party:submitSurvey', id, answers),
  setPartyHost: (id) => ipcRenderer.invoke('party:setPartyHost', id),
  submitHouse: (answers) => ipcRenderer.invoke('party:submitHouse', answers),
  next: () => ipcRenderer.invoke('party:next'),
  skipRound: () => ipcRenderer.invoke('party:skipRound'),
  reset: () => ipcRenderer.invoke('party:reset'),
  endParty: () => ipcRenderer.invoke('party:endParty'),
  openExternal: (url) => ipcRenderer.invoke('party:openExternal', url),
  onState: (cb) => ipcRenderer.on('party:state', (_e, state) => cb(state)),
  onNarration: (cb) => ipcRenderer.on('party:narration', (_e, n) => cb(n)),
});

// Used by the shared <robos-agent-selector>.
contextBridge.exposeInMainWorld('robosProviders', {
  list: (options) => ipcRenderer.invoke('party:agentProviders', options),
});
