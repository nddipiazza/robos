'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  getOverview: () => ipcRenderer.invoke('messaging:getOverview'),
  setWebEnabled: (id, enabled) => ipcRenderer.invoke('messaging:setWebEnabled', id, enabled),
  signOutWeb: (id) => ipcRenderer.invoke('messaging:signOutWeb', id),
  setWebUnread: (id, count) => ipcRenderer.invoke('messaging:setWebUnread', id, count),
  connectApi: (id, payload) => ipcRenderer.invoke('messaging:connectApi', id, payload),
  disconnectApi: (id) => ipcRenderer.invoke('messaging:disconnectApi', id),
  refresh: (opts) => ipcRenderer.invoke('messaging:refresh', opts),
  listConversations: (opts) => ipcRenderer.invoke('messaging:listConversations', opts),
  getConversation: (id) => ipcRenderer.invoke('messaging:getConversation', id),
  send: (payload) => ipcRenderer.invoke('messaging:send', payload),
  listKdeConnectDevices: () => ipcRenderer.invoke('messaging:listKdeConnectDevices'),
  startSignalLink: () => ipcRenderer.invoke('messaging:startSignalLink'),
  cancelSignalLink: () => ipcRenderer.invoke('messaging:cancelSignalLink'),
  openSetupPage: (pageId) => ipcRenderer.invoke('messaging:openSetupPage', pageId),
  onEvent: (fn) => {
    const handler = (_e, event) => fn(event);
    ipcRenderer.on('messaging:event', handler);
    return () => ipcRenderer.removeListener('messaging:event', handler);
  },
  onOpenConversation: (fn) => {
    const handler = (_e, id) => fn(id);
    ipcRenderer.on('messaging:open-conversation', handler);
    return () => ipcRenderer.removeListener('messaging:open-conversation', handler);
  },
});
