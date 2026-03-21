'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  readSettings:          ()     => ipcRenderer.invoke('dt-read-settings'),
  getDeployments:        (args) => ipcRenderer.invoke('dt-get-deployments', args),
  getDeploymentStatuses: (args) => ipcRenderer.invoke('dt-get-deployment-statuses', args),
  getReleases:           (args) => ipcRenderer.invoke('dt-get-releases', args),
  getMergedPRs:          (args) => ipcRenderer.invoke('dt-get-merged-prs', args),
  openUrl:               (url)  => ipcRenderer.invoke('dt-open-url', url),
});
