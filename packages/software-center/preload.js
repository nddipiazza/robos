const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  getTools: (force = false) => ipcRenderer.invoke('get-tools', force),
  installTool: (toolId) => ipcRenderer.invoke('install-tool', toolId),
  uninstallTool: (toolId) => ipcRenderer.invoke('uninstall-tool', toolId),
  getInstallLog: (toolId) => ipcRenderer.invoke('get-install-log', toolId),
  manageWindowsSoftware: () => ipcRenderer.invoke('manage-windows-software'),
  onInstallProgress: (callback) => {
    ipcRenderer.on('install-progress', (_event, data) => callback(data));
  }
});
