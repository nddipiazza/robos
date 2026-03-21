const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('notifs', {
  getNotifications:    ()     => ipcRenderer.invoke('get-notifications'),
  markRead:            (id)   => ipcRenderer.invoke('mark-read', id),
  markAllRead:         ()     => ipcRenderer.invoke('mark-read', null),
  markReadByCategory:  (cat)  => ipcRenderer.invoke('mark-read-by-category', cat),
  deleteNotification:  (id)   => ipcRenderer.invoke('delete-notification', id),
  clearRead:           ()     => ipcRenderer.invoke('clear-read'),
  clearAll:            ()     => ipcRenderer.invoke('clear-all'),
  getUnreadCount:      ()     => ipcRenderer.invoke('get-unread-count'),
  getUnreadByCategory: ()     => ipcRenderer.invoke('get-unread-by-category'),
  getPrefs:            ()     => ipcRenderer.invoke('get-prefs'),
  savePrefs:           (p)    => ipcRenderer.invoke('save-prefs', p),
});
