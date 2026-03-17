const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  getTools: () => ipcRenderer.invoke('get-tools'),
  installTool: (toolId) => ipcRenderer.invoke('install-tool', toolId),
  uninstallTool: (toolId) => ipcRenderer.invoke('uninstall-tool', toolId),
  getInstallLog: (toolId) => ipcRenderer.invoke('get-install-log', toolId),
  onInstallProgress: (callback) => {
    ipcRenderer.on('install-progress', (_event, data) => callback(data));
  }
});
