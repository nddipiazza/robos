'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('schemaStudio', {
  getEntities: () => ipcRenderer.invoke('schema-get-entities'),
  listBranches: () => ipcRenderer.invoke('schema-list-branches'),
  switchBranch: (branchName) => ipcRenderer.invoke('schema-switch-branch', branchName),
  compileTargets: (id) => ipcRenderer.invoke('schema-compile-targets', id),
  detectBreaking: (id) => ipcRenderer.invoke('schema-detect-breaking', id),
});
