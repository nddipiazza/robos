const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getSchema:     ()        => ipcRenderer.invoke('get-schema'),
  loadSettings:  ()        => ipcRenderer.invoke('load-settings'),
  saveSettings:  (data)    => ipcRenderer.invoke('save-settings', data),
  getSetting:    (key)     => ipcRenderer.invoke('get-setting', key),
  setSetting:    (key, v)  => ipcRenderer.invoke('set-setting', key, v),
});
