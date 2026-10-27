'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const invoke = name => (...args) => ipcRenderer.invoke(`manager:${name}`, ...args);
const listen = name => callback => {
  const listener = (_event, value) => callback(value); ipcRenderer.on(`manager:${name}`, listener);
  return () => ipcRenderer.removeListener(`manager:${name}`, listener);
};
contextBridge.exposeInMainWorld('robosManager', { state: invoke('state'), refresh: invoke('refresh'), preview: invoke('preview'),
  install: invoke('install'), cancel: invoke('cancel'), uninstall: invoke('uninstall'), uninstallAll: invoke('uninstall-all'), launch: invoke('launch'), removeAll: invoke('remove-all'),
  onState: listen('state'), onProgress: listen('progress') });
