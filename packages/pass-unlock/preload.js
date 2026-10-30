const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getStatus:      ()     => ipcRenderer.invoke('get-status'),
  unlock:         (pass) => ipcRenderer.invoke('unlock', pass),
  unlockHardware: (opts) => ipcRenderer.invoke('unlock-hardware', opts),
  skip:           ()     => ipcRenderer.invoke('skip'),
});
