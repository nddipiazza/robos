'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  appId: 'gitea-browser',
});
