const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robosCrpgMaker', {
  getPaths: () => ipcRenderer.invoke('app:get-paths'),
  listMaps: () => ipcRenderer.invoke('maps:list'),
  loadMap: (slug) => ipcRenderer.invoke('maps:load', slug),
  saveMap: (payload) => ipcRenderer.invoke('maps:save', payload),
  buildMap: (payload) => ipcRenderer.invoke('maps:build', payload),
  exportPng: (payload) => ipcRenderer.invoke('maps:export-png', payload),
});
