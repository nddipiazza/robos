const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getApps:           () => ipcRenderer.invoke('get-apps'),
  launchApp:         (id) => ipcRenderer.invoke('launch-app', id),
  killApp:           (id) => ipcRenderer.invoke('kill-app', id),
  getStatus:         () => ipcRenderer.invoke('get-status'),
  getSocketPath:     () => ipcRenderer.invoke('get-socket-path'),
  sendSocketMessage: (payload) => ipcRenderer.invoke('send-socket-message', payload),
  getNotifications:  () => ipcRenderer.invoke('get-notifications'),
  sendNotification:  (payload) => ipcRenderer.invoke('send-notification', payload),
  clearNotifications:() => ipcRenderer.invoke('clear-notifications'),
  getKeepAliveState: () => ipcRenderer.invoke('get-keepalive-state'),
  toggleKeepAlive:   (appId, paused) => ipcRenderer.invoke('toggle-keepalive', appId, paused),
});
