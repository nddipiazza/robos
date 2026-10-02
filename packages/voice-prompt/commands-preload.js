'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('voiceCommandsApi', {
  startMicrophoneTest: (device, generation) => ipcRenderer.invoke('vp-microphone-test-start', device, generation),
  stopMicrophoneTest: () => ipcRenderer.invoke('vp-microphone-test-stop'),
  onMicrophoneTestData: callback => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('vp-microphone-test-data', listener);
    return () => ipcRenderer.removeListener('vp-microphone-test-data', listener);
  },
  listDevices: () => ipcRenderer.invoke('vp-list-devices'),
  getPrefs: () => ipcRenderer.invoke('vp-get-prefs'),
  savePrefs: (prefs) => ipcRenderer.invoke('vp-save-prefs', prefs),
  getCommands: (opts) => ipcRenderer.invoke('vp-voice-commands-list', opts),
  matchCommand: (text) => ipcRenderer.invoke('vp-voice-command-match', text),
  executeCommand: (commandId, args, text) => ipcRenderer.invoke('vp-voice-command-execute', { commandId, args, text }),
  testPhrase: (phrase) => ipcRenderer.invoke('vp-voice-commands-test-phrase', phrase),
  closeWindow: () => ipcRenderer.invoke('vp-voice-commands-window-close'),
});
