const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('si', {
  listIndexes:  ()       => ipcRenderer.invoke('list-indexes'),
  rebuildIndex: (id)     => ipcRenderer.invoke('rebuild-index', id),
  addIndex:     (args)   => ipcRenderer.invoke('add-index', args),
  deleteIndex:  (id)     => ipcRenderer.invoke('delete-index', id),
  searchIndex:  (args)   => ipcRenderer.invoke('search-index', args),
  onProgress:   (cb) => { ipcRenderer.on('index-progress', (_, d) => cb(d)); },
  onDone:       (cb) => { ipcRenderer.on('index-done',     (_, d) => cb(d)); },
});
