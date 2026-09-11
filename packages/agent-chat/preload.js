'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  getSessions: () => ipcRenderer.invoke('chat:get-sessions'),
  createSession: (title) => ipcRenderer.invoke('chat:create-session', title),
  deleteSession: (id) => ipcRenderer.invoke('chat:delete-session', id),
  getMessages: (id) => ipcRenderer.invoke('chat:get-messages', id),
  sendMessage: (payload) => ipcRenderer.invoke('chat:send-message', payload),
  popoutPrompt: (text) => ipcRenderer.invoke('chat:popout-prompt', text),
  getConnectedTools: () => ipcRenderer.invoke('chat:get-tools'),
  getWorkspaces: () => ipcRenderer.invoke('chat:get-workspaces'),
  executeAction: (action, args) => ipcRenderer.invoke('chat:execute-action', { action, args }),
  onStreamChunk: (fn) => {
    const handler = (_event, data) => fn(data);
    ipcRenderer.on('chat:chunk', handler);
    return () => ipcRenderer.removeListener('chat:chunk', handler);
  },
  onToolEvent: (fn) => {
    const handler = (_event, data) => fn(data);
    ipcRenderer.on('chat:tool-event', handler);
    return () => ipcRenderer.removeListener('chat:tool-event', handler);
  },
});
