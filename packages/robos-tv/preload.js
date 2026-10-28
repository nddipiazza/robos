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
  castDashboard: (payload) => ipcRenderer.invoke('tv:castDashboard', payload),
  stopDashboardCast: (payload) => ipcRenderer.invoke('tv:stopDashboardCast', payload),
  openDashboardExternal: () => ipcRenderer.invoke('tv:openDashboardExternal'),
  openPortalExternal: () => ipcRenderer.invoke('tv:openPortalExternal'),
  getPortalOwnership: () => ipcRenderer.invoke('tv:getPortalOwnership'),
  restartPortal: () => ipcRenderer.invoke('tv:restartPortal'),
  onPortalChanged: (cb) => ipcRenderer.on('tv:portalChanged', () => cb()),
  getTabloOverview: (opts) => ipcRenderer.invoke('tv:getTabloOverview', opts),
  getTabloChannels: (opts) => ipcRenderer.invoke('tv:getTabloChannels', opts),
  setTabloDevice: (opts) => ipcRenderer.invoke('tv:setTabloDevice', opts),
  openTabloExternal: (opts) => ipcRenderer.invoke('tv:openTabloExternal', opts),
});
