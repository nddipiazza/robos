const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  listEntries:    ()          => ipcRenderer.invoke('list-entries'),
  initStore:      (opts)      => ipcRenderer.invoke('init-store', opts),
  getEntry:       (p)         => ipcRenderer.invoke('get-entry', p),
  copyEntry:      (p)         => ipcRenderer.invoke('copy-entry', p),
  addEntry:       (opts)      => ipcRenderer.invoke('add-entry', opts),
  addMultiline:   (opts)      => ipcRenderer.invoke('add-multiline', opts),
  deleteEntry:    (p)         => ipcRenderer.invoke('delete-entry', p),
  renameEntry:    (opts)      => ipcRenderer.invoke('rename-entry', opts),
  generateEntry:  (opts)      => ipcRenderer.invoke('generate-entry', opts),
  openUnlockDialog: ()          => ipcRenderer.invoke('open-unlock-dialog'),
  lockStore:        ()          => ipcRenderer.invoke('lock-store'),
  getLockStatus:  ()          => ipcRenderer.invoke('get-lock-status'),
});
