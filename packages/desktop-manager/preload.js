const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getApps:   () => ipcRenderer.invoke('get-apps'),
  launchApp: (id) => ipcRenderer.invoke('launch-app', id),
});
