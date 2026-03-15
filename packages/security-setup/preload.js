const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getSecurityStatus:  ()       => ipcRenderer.invoke('get-security-status'),
  createGpgKey:       (opts)   => ipcRenderer.invoke('create-gpg-key', opts),
  listGpgKeys:        ()       => ipcRenderer.invoke('list-gpg-keys'),
  initPass:           (opts)   => ipcRenderer.invoke('init-pass', opts),
  configurePinentry:  ()       => ipcRenderer.invoke('configure-pinentry'),
  resetAll:           ()       => ipcRenderer.invoke('reset-all'),
});
