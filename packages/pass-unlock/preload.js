const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getStatus: ()          => ipcRenderer.invoke('get-status'),
  unlock:    (pass)      => ipcRenderer.invoke('unlock', pass),
  skip:      ()          => ipcRenderer.invoke('skip'),
});
