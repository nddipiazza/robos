const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toast', {
  onData:          (cb) => ipcRenderer.on('toast-data', (_, d) => cb(d)),
  onFadeOut:       (cb) => ipcRenderer.on('start-fade-out', () => cb()),
  dismiss:         ()   => ipcRenderer.send('dismiss-toast'),
  action:          (a)  => ipcRenderer.send('toast-action', a),
  getActiveToasts: ()   => ipcRenderer.invoke('get-active-toasts'),
  getQueuedToasts: ()   => ipcRenderer.invoke('get-queued-toasts'),
  emitToast:       (n)  => ipcRenderer.invoke('emit-toast', n),
  getPrefs:        ()   => ipcRenderer.invoke('get-prefs'),
  setPrefs:        (p)  => ipcRenderer.invoke('set-prefs', p),
  resetPrefs:      ()   => ipcRenderer.invoke('reset-prefs'),
  dismissAll:      ()   => ipcRenderer.invoke('dismiss-all'),
  getTelemetry:    ()   => ipcRenderer.invoke('get-telemetry-log'),
  clearTelemetry:  ()   => ipcRenderer.invoke('clear-telemetry-log'),
  simulateToast:   (t)  => ipcRenderer.invoke('simulate-toast', t),
  getSystemInfo:   ()   => ipcRenderer.invoke('get-system-info'),
});
