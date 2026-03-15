const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('csv', {
  listSessions:     ()               => ipcRenderer.invoke('list-sessions'),
  loadSession:      (opts)           => ipcRenderer.invoke('load-session', opts),
  listCheckpoints:  (opts)           => ipcRenderer.invoke('list-checkpoints', opts),
  readSessionFile:  (opts)           => ipcRenderer.invoke('read-session-file', opts),
});
