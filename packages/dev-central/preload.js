'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  readSettings:      ()   => ipcRenderer.invoke('dc-read-settings'),
  getMyIssues:       ()   => ipcRenderer.invoke('dc-get-my-issues'),
  getMyPRs:          ()   => ipcRenderer.invoke('dc-get-my-prs'),
  getReviewRequests: ()   => ipcRenderer.invoke('dc-get-review-requests'),
  getRecentActivity: ()   => ipcRenderer.invoke('dc-get-recent-activity'),
  openUrl:           (u)  => ipcRenderer.invoke('dc-open-url', u),
});
