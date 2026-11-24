'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robosMediaServer', {
  getUrl: () => ipcRenderer.invoke('media-server:get-url'),
  openExternal: (url) => ipcRenderer.invoke('media-server:open-external', url),
});
