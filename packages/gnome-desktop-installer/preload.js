'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robosDesktopInstaller', {
  listApps: () => ipcRenderer.invoke('gdi:list-apps'),
  installApp: (appId, options) => ipcRenderer.invoke('gdi:install-app', appId, options),
  uninstallApp: (appId) => ipcRenderer.invoke('gdi:uninstall-app', appId),
  setDesktopShortcut: (appId, enabled) => ipcRenderer.invoke('gdi:set-desktop-shortcut', appId, enabled),
  setDockPinned: (appId, pinned) => ipcRenderer.invoke('gdi:set-dock-pinned', appId, pinned),
  bulkInstall: (appIds, options) => ipcRenderer.invoke('gdi:bulk-install', appIds, options),
  bulkRemoveDesktop: (appIds) => ipcRenderer.invoke('gdi:bulk-remove-desktop', appIds),
  refreshCaches: () => ipcRenderer.invoke('gdi:refresh-caches'),
  getDetails: (appId) => ipcRenderer.invoke('gdi:get-details', appId),
  launchApp: (appId) => ipcRenderer.invoke('gdi:launch-app', appId),
  onProgress: (cb) => {
    ipcRenderer.removeAllListeners('gdi:progress');
    ipcRenderer.on('gdi:progress', (_, data) => cb(data));
  },
});
