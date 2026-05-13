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
  minimizeWindow: (wid)   => ipcRenderer.invoke('minimize-window', wid),
  maximizeWindow: (wid)   => ipcRenderer.invoke('maximize-window', wid),
  closeWindow:    (wid)   => ipcRenderer.invoke('close-window', wid),
  switchToGnome:  ()      => ipcRenderer.invoke('switch-to-gnome'),
  setDockZone:    (h)     => ipcRenderer.invoke('set-dock-zone', h),
  setDragLock:    (v)     => ipcRenderer.invoke('set-drag-lock', v),
  debugLog:       (msg)   => ipcRenderer.send('debug-log', msg),
});
