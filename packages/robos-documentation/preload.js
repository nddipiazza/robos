'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robosDocumentation', {
  getInitialTarget: () => ipcRenderer.invoke('documentation:get-initial-target'),
  listDocumentableEntries: () => ipcRenderer.invoke('documentation:list-documentable-entries'),
  getEntryDoc: (entityIdOrSlug) => ipcRenderer.invoke('documentation:get-entry-doc', entityIdOrSlug),
  generateDoc: (opts) => ipcRenderer.invoke('documentation:generate-doc', opts),
  saveDoc: (opts) => ipcRenderer.invoke('documentation:save-doc', opts),
  exportWebsite: (opts) => ipcRenderer.invoke('documentation:export-website', opts),
  launchTestViewer: (opts) => ipcRenderer.invoke('documentation:launch-test-viewer', opts),
});
