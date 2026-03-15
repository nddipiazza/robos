const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('wm', {
  scanWorkspaces:     (opts) => ipcRenderer.invoke('scan-workspaces', opts),
  detectIDEs:         ()     => ipcRenderer.invoke('detect-ides'),
  openInIDE:          (opts) => ipcRenderer.invoke('open-in-ide', opts),
  openInFiles:        (opts) => ipcRenderer.invoke('open-in-files', opts),
  openTerminal:       (opts) => ipcRenderer.invoke('open-terminal', opts),
  getHome:            ()     => ipcRenderer.invoke('get-home'),
  readVscodeSettings: (opts) => ipcRenderer.invoke('read-vscode-settings', opts),
  listRobosDesktops:  ()     => ipcRenderer.invoke('list-robos-desktops'),
});
