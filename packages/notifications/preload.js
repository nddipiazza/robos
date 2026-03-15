const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('notifs', {
  getNotifications:    ()   => ipcRenderer.invoke('get-notifications'),
  markRead:            (id) => ipcRenderer.invoke('mark-read', id),
  markAllRead:         ()   => ipcRenderer.invoke('mark-read', null),
  deleteNotification:  (id) => ipcRenderer.invoke('delete-notification', id),
  clearAll:            ()   => ipcRenderer.invoke('clear-all'),
});
