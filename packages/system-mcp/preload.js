'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('systemMcp', {
  getPreferences: () => ipcRenderer.invoke('system-get-prefs'),
  getNotifications: () => ipcRenderer.invoke('system-get-notifications'),
  sendNotification: (title, body, urgency) => ipcRenderer.invoke('system-send-notification', { title, body, urgency }),
  searchFiles: (query) => ipcRenderer.invoke('system-search-files', query),
  getTools: () => ipcRenderer.invoke('system-get-tools'),
  getActiveTask: () => ipcRenderer.invoke('system-get-active-task'),
  rpc: (request) => ipcRenderer.invoke('system-mcp-rpc', request),
});
