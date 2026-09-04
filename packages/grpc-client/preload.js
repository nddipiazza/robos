'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('grpcClient', {
  getServices: () => ipcRenderer.invoke('grpc-get-services'),
  invoke: (p) => ipcRenderer.invoke('grpc-invoke', p),
});
