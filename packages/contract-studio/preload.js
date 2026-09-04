'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('contractStudio', {
  getContracts: () => ipcRenderer.invoke('cs-get-contracts'),
  switchBranch: (branchName) => ipcRenderer.invoke('cs-switch-branch', branchName),
  runSpectral: (id) => ipcRenderer.invoke('cs-run-spectral', id),
  runPact: (id) => ipcRenderer.invoke('cs-run-pact', id),
  startPrism: (id) => ipcRenderer.invoke('cs-start-prism', id),
});
