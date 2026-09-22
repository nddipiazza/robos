'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('voicePrompt', {
  getStatus: () => ipcRenderer.invoke('vp-get-status'),
  getAppContext: () => ipcRenderer.invoke('vp-get-app-context'),
  listDevices: () => ipcRenderer.invoke('vp-list-devices'),
  activate: (options) => ipcRenderer.invoke('vp-activate', options),
  deactivate: () => ipcRenderer.invoke('vp-deactivate'),
  dictate: (payload) => ipcRenderer.invoke('vp-dictate', payload),
  getPrompts: (query) => ipcRenderer.invoke('vp-get-prompts', query),
  getPrompt: (id) => ipcRenderer.invoke('vp-get-prompt', id),
  deletePrompt: (id) => ipcRenderer.invoke('vp-delete-prompt', id),
  clearPrompts: () => ipcRenderer.invoke('vp-clear-prompts'),
  getPrefs: () => ipcRenderer.invoke('vp-get-prefs'),
  savePrefs: (prefs) => ipcRenderer.invoke('vp-save-prefs', prefs),

  onActivated: (callback) => {
    ipcRenderer.on('vp-event-activated', (_e, data) => callback(data));
  },
  onDeactivated: (callback) => {
    ipcRenderer.on('vp-event-deactivated', (_e, data) => callback(data));
  },
  onDictation: (callback) => {
    ipcRenderer.on('vp-event-dictation', (_e, data) => callback(data));
  },
  onInterimText: (callback) => {
    ipcRenderer.on('vp-event-interim-text', (_e, data) => callback(data));
  },
});
