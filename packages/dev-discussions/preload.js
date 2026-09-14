'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robosDevDiscussions', {
  getDiscussions: () => ipcRenderer.invoke('get-discussions'),
  postComment: (payload) => ipcRenderer.invoke('post-comment', payload),
  addAttachment: (payload) => ipcRenderer.invoke('add-attachment', payload),
  syncRemote: (payload) => ipcRenderer.invoke('sync-remote', payload),
  exportToKGraph: () => ipcRenderer.invoke('export-to-kgraph'),
  getRateLimitStatus: () => ipcRenderer.invoke('get-rate-limit-status'),
  toggleResolved: (payload) => ipcRenderer.invoke('toggle-resolved', payload),
  addReaction: (payload) => ipcRenderer.invoke('add-reaction', payload),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
});
