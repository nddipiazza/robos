const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robosCrpgSceneStudio', {
  getPaths: () => ipcRenderer.invoke('app:get-paths'),
  listScenes: () => ipcRenderer.invoke('scenes:list'),
  loadScene: (slug) => ipcRenderer.invoke('scenes:load', slug),
  saveScene: (payload) => ipcRenderer.invoke('scenes:save', payload),
  deleteScene: (slug) => ipcRenderer.invoke('scenes:delete', slug),
  listMaps: () => ipcRenderer.invoke('maps:list'),
  loadMap: (slug) => ipcRenderer.invoke('maps:load', slug),
  listCampaigns: () => ipcRenderer.invoke('campaigns:list'),
  loadCampaign: (slug) => ipcRenderer.invoke('campaigns:load', slug),
});
