'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('voiceCommandsApi', {
  getCommands: (opts) => ipcRenderer.invoke('vp-voice-commands-list', opts),
  matchCommand: (text) => ipcRenderer.invoke('vp-voice-command-match', text),
  executeCommand: (commandId, args, text) => ipcRenderer.invoke('vp-voice-command-execute', { commandId, args, text }),
  testPhrase: (phrase) => ipcRenderer.invoke('vp-voice-commands-test-phrase', phrase),
  closeWindow: () => ipcRenderer.invoke('vp-voice-commands-window-close'),
});
