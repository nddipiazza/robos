const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robosCrpgCampaign', {
  getPaths: () => ipcRenderer.invoke('app:get-paths'),
  listCampaigns: () => ipcRenderer.invoke('campaigns:list'),
  loadCampaign: (slug) => ipcRenderer.invoke('campaigns:load', slug),
  saveCampaign: (payload) => ipcRenderer.invoke('campaigns:save', payload),
  deleteCampaign: (slug) => ipcRenderer.invoke('campaigns:delete', slug),
  listScenes: () => ipcRenderer.invoke('scenes:list'),
});
