'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listTeams: () => ipcRenderer.invoke('app-wizard:list-teams'),
  scanSource: (opts) => ipcRenderer.invoke('app-wizard:scan-source', opts),
  refineInspection: (opts) => ipcRenderer.invoke('app-wizard:refine-inspection', opts),
  listPath: (query) => ipcRenderer.invoke('app-wizard:list-path', query),
  generateNewApp: (spec) => ipcRenderer.invoke('app-wizard:generate-new-app', spec),
  importApp: (spec) => ipcRenderer.invoke('app-wizard:import-app', spec),
});
