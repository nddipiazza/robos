'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('schemaStudio', {
  getEntities: () => ipcRenderer.invoke('schema-get-entities'),
  listBranches: () => ipcRenderer.invoke('schema-list-branches'),
  switchBranch: (branchName) => ipcRenderer.invoke('schema-switch-branch', branchName),
  compileTargets: (id) => ipcRenderer.invoke('schema-compile-targets', id),
  detectBreaking: (id) => ipcRenderer.invoke('schema-detect-breaking', id),

  // Definitive Schema.org & Standards API
  searchSchemas: (query, options) => ipcRenderer.invoke('schema-search', query, options),
  getClassDetails: (id) => ipcRenderer.invoke('schema-get-class', id),
  getPropertyDetails: (id) => ipcRenderer.invoke('schema-get-property', id),
  validateJsonLd: (payload) => ipcRenderer.invoke('schema-validate-jsonld', payload),
  synthesizeKGraph: (classId, options) => ipcRenderer.invoke('schema-synthesize-kgraph', classId, options),
  syncUpstream: () => ipcRenderer.invoke('schema-sync-upstream'),
});
