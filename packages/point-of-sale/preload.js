'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  posInfo: () => ipcRenderer.invoke('pos:info'),
  openKiosk: () => ipcRenderer.invoke('pos:openKiosk'),
  openReadyBoard: () => ipcRenderer.invoke('pos:openReadyBoard'),
});
