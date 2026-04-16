'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  getCommands: () => ipcRenderer.invoke('get-commands'),
  executeCommand: (input) => ipcRenderer.invoke('execute-command', input),
  loadHistory: () => ipcRenderer.invoke('load-history'),
  saveHistory: (history) => ipcRenderer.invoke('save-history', history),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
});
