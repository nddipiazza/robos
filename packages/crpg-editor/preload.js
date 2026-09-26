const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  getPaths: () => ipcRenderer.invoke('app:get-paths'),
  
  // Campaign APIs
  listCampaigns: () => ipcRenderer.invoke('campaigns:list'),
  loadCampaign: (slug) => ipcRenderer.invoke('campaigns:load', slug),
  saveCampaign: (payload) => ipcRenderer.invoke('campaigns:save', payload),
  deleteCampaign: (slug) => ipcRenderer.invoke('campaigns:delete', slug),

  // Map APIs
  listMaps: () => ipcRenderer.invoke('maps:list'),
  loadMap: (slug) => ipcRenderer.invoke('maps:load', slug),
  saveMap: (payload) => ipcRenderer.invoke('maps:save', payload),
  buildMap: (payload) => ipcRenderer.invoke('maps:build', payload),
  exportMapPng: (payload) => ipcRenderer.invoke('maps:export-png', payload),

  // Scene APIs
  listScenes: () => ipcRenderer.invoke('scenes:list'),

  // Platform info
  platform: process.platform,
});
