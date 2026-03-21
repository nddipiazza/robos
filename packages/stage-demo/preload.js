const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getConfig:        ()     => ipcRenderer.invoke('get-config'),
  listDemos:        ()     => ipcRenderer.invoke('list-demos'),
  generateDemo:     (opts) => ipcRenderer.invoke('generate-demo', opts),
  fetchMergedPRs:   ()     => ipcRenderer.invoke('fetch-merged-prs'),
  updateDemoStatus: (opts) => ipcRenderer.invoke('update-demo-status', opts),
  openUrl:          (url)  => ipcRenderer.invoke('open-url', url),
});
