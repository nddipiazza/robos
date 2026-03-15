const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('launcher', {
  listApps:  ()       => ipcRenderer.invoke('list-apps'),
  launchApp: (exec)   => ipcRenderer.invoke('launch-app', exec),
  close:     ()       => ipcRenderer.invoke('close'),
});
