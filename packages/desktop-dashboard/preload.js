'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  getScreenInfo: () => ipcRenderer.invoke('dd-get-screen-info'),
});
