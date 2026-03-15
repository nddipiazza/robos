const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fe', {
  readDir:          (p)         => ipcRenderer.invoke('read-dir', p),
  readTreeChildren: (p)         => ipcRenderer.invoke('read-tree-children', p),
  getHome:          ()          => ipcRenderer.invoke('get-home'),
  openFile:         (p)         => ipcRenderer.invoke('open-file', p),
  openTerminalHere: (p)         => ipcRenderer.invoke('open-terminal-here', p),
  openInEditor:     (p)         => ipcRenderer.invoke('open-in-editor', p),
  copyPath:         (p)         => ipcRenderer.invoke('copy-path', p),
  getFileContent:   (p)         => ipcRenderer.invoke('get-file-content', p),
  deleteItem:       (p)         => ipcRenderer.invoke('delete-item', p),
  renameItem:       (from, to)  => ipcRenderer.invoke('rename-item', { from, to }),
  mkdir:            (p)         => ipcRenderer.invoke('mkdir', p),
  showContextMenu:  (itemPath, isDir) => ipcRenderer.invoke('show-context-menu', { itemPath, isDir }),
  onCtxAction:      (cb)        => ipcRenderer.on('ctx-action', (_, data) => cb(data)),
  onNavigateTo:     (cb)        => ipcRenderer.on('navigate-to', (_, p) => cb(p)),
});
