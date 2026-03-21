'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  readSettings:   ()     => ipcRenderer.invoke('md-read-settings'),
  getAllIssues:    (args) => ipcRenderer.invoke('md-get-all-issues', args),
  getAllPRs:       (args) => ipcRenderer.invoke('md-get-all-prs', args),
  getContributors: (args) => ipcRenderer.invoke('md-get-contributors', args),
  getDeployments: (args) => ipcRenderer.invoke('md-get-deployments', args),
  openUrl:        (url)  => ipcRenderer.invoke('md-open-url', url),
});
