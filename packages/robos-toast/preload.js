const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toast', {
  onData:          (cb) => ipcRenderer.on('toast-data', (_, d) => cb(d)),
  dismiss:         ()   => ipcRenderer.send('dismiss-toast'),
  action:          (a)  => ipcRenderer.send('toast-action', a),
  getActiveToasts: ()   => ipcRenderer.invoke('get-active-toasts'),
  getQueuedToasts: ()   => ipcRenderer.invoke('get-queued-toasts'),
  emitToast:       (n)  => ipcRenderer.invoke('emit-toast', n),
  getPrefs:        ()   => ipcRenderer.invoke('get-prefs'),
  setPrefs:        (p)  => ipcRenderer.invoke('set-prefs', p),
  dismissAll:      ()   => ipcRenderer.invoke('dismiss-all'),
});
