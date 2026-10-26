'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robosTv', {
  getOverview: () => ipcRenderer.invoke('tv:getOverview'),
  scanLan: () => ipcRenderer.invoke('tv:scanLan'),
  addOrUpdateTv: (tvInput) => ipcRenderer.invoke('tv:addOrUpdate', tvInput),
  removeTv: (tvId) => ipcRenderer.invoke('tv:remove', tvId),
  buildPackage: (options) => ipcRenderer.invoke('tv:buildPackage', options),
  renewWebos: (tvId) => ipcRenderer.invoke('tv:renewWebos', tvId),
  sendRemoteKey: (payload) => ipcRenderer.invoke('tv:sendRemoteKey', payload),
  diagnoseReadiness: (tvId) => ipcRenderer.invoke('tv:diagnoseReadiness', tvId),
  launchTile: (payload) => ipcRenderer.invoke('tv:launchTile', payload),
  openPortalExternal: () => ipcRenderer.invoke('tv:openPortalExternal'),
});
