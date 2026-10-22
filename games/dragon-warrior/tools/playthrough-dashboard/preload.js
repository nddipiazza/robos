const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dash', {
  config: () => ipcRenderer.invoke('dash:config'),
  live: () => ipcRenderer.invoke('dash:live'),
  registry: () => ipcRenderer.invoke('dash:registry'),
  readJson: (rel) => ipcRenderer.invoke('dash:read-json', rel),
  report: () => ipcRenderer.invoke('dash:report'),
  fileUrl: (rel) => ipcRenderer.invoke('dash:file-url', rel),
  state: () => ipcRenderer.invoke('dash:state'),
  command: (command, args) => ipcRenderer.invoke('dash:command', command, args),
  screenshot: () => ipcRenderer.invoke('dash:screenshot'),
  open: (rel) => ipcRenderer.invoke('dash:open', rel),
  reveal: (rel) => ipcRenderer.invoke('dash:reveal', rel),
  setTray: (dataUrl, sig) => ipcRenderer.invoke('dash:set-tray', dataUrl, sig),
});
