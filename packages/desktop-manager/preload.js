const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getApps:   () => ipcRenderer.invoke('get-apps'),
  launchApp: (id) => ipcRenderer.invoke('launch-app', id),
  killApp:   (id) => ipcRenderer.invoke('kill-app', id),
  getStatus: ()   => ipcRenderer.invoke('get-status'),
});
