'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('vpn', Object.fromEntries(
  ['prerequisites', 'build', 'import', 'start', 'stop', 'status', 'open']
    .map(name => [name, (...args) => ipcRenderer.invoke(`vpn:${name}`, ...args)])
));
