const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cli', {
  runCli: (opts) => ipcRenderer.invoke('run-cli', opts),
  getTools: () => ipcRenderer.invoke('get-cli-tools'),
});
