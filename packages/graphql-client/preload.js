'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('graphqlClient', {
  introspect: () => ipcRenderer.invoke('gql-introspect'),
  execute: (p) => ipcRenderer.invoke('gql-execute', p),
});
