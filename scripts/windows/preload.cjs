const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('robos', { list: () => ipcRenderer.invoke('apps:list'), launch: id => ipcRenderer.invoke('apps:launch', id) });
