'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  launchApp:      (appId) => ipcRenderer.invoke('launch-app', appId),
  getRunningApps: ()      => ipcRenderer.invoke('get-running-apps'),
  getPinnedApps:  ()      => ipcRenderer.invoke('get-pinned-apps'),
  setPinnedApps:  (list)  => ipcRenderer.invoke('set-pinned-apps', list),
  getAppMeta:     ()      => ipcRenderer.invoke('get-app-meta'),
  getX11Windows:  ()      => ipcRenderer.invoke('get-x11-windows'),
  focusWindow:    (wid)   => ipcRenderer.invoke('focus-window', wid),
  switchToGnome:  ()      => ipcRenderer.invoke('switch-to-gnome'),
});
