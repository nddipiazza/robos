'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('contractStudio', {
  getContracts: () => ipcRenderer.invoke('contract-get-contracts'),
  listBranches: () => ipcRenderer.invoke('contract-list-branches'),
  switchBranch: (branchName) => ipcRenderer.invoke('contract-switch-branch', branchName),
  runSpectral: (id) => ipcRenderer.invoke('contract-run-spectral', id),
  runPact: (id) => ipcRenderer.invoke('contract-run-pact', id),
  startPrism: (id) => ipcRenderer.invoke('contract-start-prism', id),
});
