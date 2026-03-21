const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getBoardConfig: ()       => ipcRenderer.invoke('get-board-config'),
  fetchIssues:    (opts)   => ipcRenderer.invoke('fetch-issues', opts),
  openUrl:        (url)    => ipcRenderer.invoke('open-url', url),
});
