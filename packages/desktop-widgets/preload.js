const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('widgets', {
  getWidgetData:   ()     => ipcRenderer.invoke('get-widget-data'),
  getWidgetConfig: ()     => ipcRenderer.invoke('get-widget-config'),
  saveWidgetConfig: (cfg) => ipcRenderer.invoke('save-widget-config', cfg),
  onData:          (cb)   => ipcRenderer.on('widget-data', (_, d) => cb(d)),
});
