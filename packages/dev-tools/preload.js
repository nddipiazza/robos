'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  getToolCatalogue:     ()       => ipcRenderer.invoke('dt-get-catalogue'),
  launchTool:           (opts)   => ipcRenderer.invoke('dt-launch', opts),
  installTool:          (opts)   => ipcRenderer.invoke('dt-install', opts),
  uninstallTool:        (opts)   => ipcRenderer.invoke('dt-uninstall', opts),
  killTool:             (opts)   => ipcRenderer.invoke('dt-kill', opts),
  openUrl:              (opts)   => ipcRenderer.invoke('dt-open-url', opts),
  getRobosPluginConfig: ()       => ipcRenderer.invoke('dt-get-plugin-config'),
  installRobosPlugin:   (opts)   => ipcRenderer.invoke('dt-install-plugin', opts),
});
