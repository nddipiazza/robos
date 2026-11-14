'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  getAudioSnapshot: () => ipcRenderer.invoke('daw:audio-snapshot'),
  saveAudioEngine: (payload) => ipcRenderer.invoke('daw:save-audio-engine', payload),
  setFocusriteControl: (payload) => ipcRenderer.invoke('daw:set-focusrite-control', payload),
  testInputCapture: (payload) => ipcRenderer.invoke('daw:test-input', payload),
  playTestTone: (payload) => ipcRenderer.invoke('daw:play-test-tone', payload),
  onHardwareChanged: (cb) => {
    const listener = (_e, snap) => cb(snap);
    ipcRenderer.on('daw:hardware-changed', listener);
    return () => ipcRenderer.removeListener('daw:hardware-changed', listener);
  },
});
