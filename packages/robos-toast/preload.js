const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toast', {
  onData:   (cb) => ipcRenderer.on('toast-data', (_, d) => cb(d)),
  dismiss:  ()   => ipcRenderer.send('dismiss-toast'),
  action:   (a)  => ipcRenderer.send('toast-action', a),
});
