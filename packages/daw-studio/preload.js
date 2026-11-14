'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, cb) {
  const listener = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('robos', {
  // Hardware & Audio Devices
  getAudioSnapshot: () => ipcRenderer.invoke('daw:audio-snapshot'),
  saveAudioEngine: (payload) => ipcRenderer.invoke('daw:save-audio-engine', payload),
  setFocusriteControl: (payload) => ipcRenderer.invoke('daw:set-focusrite-control', payload),
  testInputCapture: (payload) => ipcRenderer.invoke('daw:test-input', payload),
  playTestTone: (payload) => ipcRenderer.invoke('daw:play-test-tone', payload),
  onHardwareChanged: (cb) => subscribe('daw:hardware-changed', cb),

  // Studio Init, Add Mic Wizard & Drum Instruments
  getStudioInit: () => ipcRenderer.invoke('daw:get-studio-init'),
  wizardStartTapDetect: (payload) => ipcRenderer.invoke('daw:wizard-start-tap-detect', payload),
  wizardStopTapDetect: () => ipcRenderer.invoke('daw:wizard-stop-tap-detect'),
  onTapLevels: (cb) => subscribe('daw:tap-levels', cb),

  addMicTrack: (payload) => ipcRenderer.invoke('daw:add-mic-track', payload),
  updateProjectMeta: (payload) => ipcRenderer.invoke('daw:update-project-meta', payload),
  updateTrack: (payload) => ipcRenderer.invoke('daw:update-track', payload),
  deleteTrack: (payload) => ipcRenderer.invoke('daw:delete-track', payload),
  clearTrackClips: (payload) => ipcRenderer.invoke('daw:clear-track-clips', payload),

  getDrumkitsStatus: () => ipcRenderer.invoke('daw:drumkits-status'),
  downloadDrumkit: (payload) => ipcRenderer.invoke('daw:download-drumkit', payload),
  onDrumkitProgress: (cb) => subscribe('daw:drumkit-progress', cb),
  readAudioFile: (payload) => ipcRenderer.invoke('daw:read-audio-file', payload),

  // Multi-Track Recording & Project Save / Open
  recordStart: (payload) => ipcRenderer.invoke('daw:record-start', payload),
  recordStop: (payload) => ipcRenderer.invoke('daw:record-stop', payload),
  onRecordProgress: (cb) => subscribe('daw:record-progress', cb),

  projectNew: (payload) => ipcRenderer.invoke('daw:project-new', payload),
  projectSave: (payload) => ipcRenderer.invoke('daw:project-save', payload),
  projectOpen: (payload) => ipcRenderer.invoke('daw:project-open', payload),
  projectList: () => ipcRenderer.invoke('daw:project-list'),
});
