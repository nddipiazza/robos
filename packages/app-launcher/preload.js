const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  getDesktopEntries: () => ipcRenderer.invoke('get-desktop-entries'),
  launchApp: (exec) => ipcRenderer.invoke('launch-app', exec),
  closeWindow: () => ipcRenderer.invoke('close-window')
});
