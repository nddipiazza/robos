const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('robos', {
  list: () => ipcRenderer.invoke('apps:list'), launch: id => ipcRenderer.invoke('apps:launch', id),
  launcherState: () => ipcRenderer.invoke('launcher:state'),
  setShortcut: enabled => ipcRenderer.invoke('launcher:shortcut', enabled),
  setStartAtLogin: enabled => ipcRenderer.invoke('launcher:login', enabled),
  hide: () => ipcRenderer.invoke('launcher:hide'),
  onShown: callback => ipcRenderer.on('launcher:shown', () => callback()),
});
