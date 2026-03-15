'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('lm', {
  getCatalogue:       ()     => ipcRenderer.invoke('get-catalogue'),
  detectVersions:     (id)   => ipcRenderer.invoke('detect-versions', id),
  installVersion:     (opts) => ipcRenderer.invoke('install-version', opts),
  setDefaultVersion:  (opts) => ipcRenderer.invoke('set-default-version', opts),
  removeVersion:      (opts) => ipcRenderer.invoke('remove-version', opts),
  detectBuildTools:   (id)   => ipcRenderer.invoke('detect-build-tools', id),
  installBuildTool:   (opts) => ipcRenderer.invoke('install-build-tool', opts),
  openTerminal:       (cmd)  => ipcRenderer.invoke('open-terminal', cmd),
  openUrl:            (url)  => ipcRenderer.invoke('open-url', url),
  getEnvInfo:         (id)   => ipcRenderer.invoke('get-env-info', id),
});
