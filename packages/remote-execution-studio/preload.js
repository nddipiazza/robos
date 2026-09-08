'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('remoteExecutionStudio', {
  getClusters: () => ipcRenderer.invoke('re-get-clusters'),
  getCluster: (id) => ipcRenderer.invoke('re-get-cluster', id),
  saveCluster: (cluster) => ipcRenderer.invoke('re-save-cluster', cluster),
  deleteCluster: (id) => ipcRenderer.invoke('re-delete-cluster', id),
  getBuildSystems: () => ipcRenderer.invoke('re-get-build-systems'),
  saveBuildSystem: (sys) => ipcRenderer.invoke('re-save-build-system', sys),
  generateBazelrc: (clusterId) => ipcRenderer.invoke('re-generate-bazelrc', clusterId),
  generateBuckconfig: (clusterId) => ipcRenderer.invoke('re-generate-buckconfig', clusterId),
  generateBuildbarnConfigs: (clusterId) => ipcRenderer.invoke('re-generate-buildbarn-configs', clusterId),
  generateNativeLinkConfig: (clusterId) => ipcRenderer.invoke('re-generate-nativelink-config', clusterId),
  testEndpoints: (clusterId) => ipcRenderer.invoke('re-test-endpoints', clusterId),
  syncToKGraph: () => ipcRenderer.invoke('re-sync-kgraph'),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
});
